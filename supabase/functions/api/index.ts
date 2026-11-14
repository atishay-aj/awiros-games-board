// Awiros Games API (Supabase Edge Function "api").
//
// Routes, relative to /functions/v1/api:
//   GET  /ping            public keep-alive; touches the database, returns { ok }
//   GET  /me              who is signed in, and their profile if they joined
//   POST /join            { name, code }  join with the invite code
//   GET  /board?since=    profiles + scores (since a day, or everything)
//   POST /scores          { day, pasted, entries: [{ game, value, label, puzzle, detail }] }
//   POST /scores/remove   { id }  remove one of your own scores
//   POST /profile         { name } change your display name
//
// Everything except /ping needs a Supabase Auth (Google) access token, and
// everything except /me and /join also needs a profile. Scores are always written
// under the caller's own account, whatever the request body says.
import { createClient, type User } from "npm:@supabase/supabase-js@2";

const GAMES = new Set(["krillion", "perceptle", "chainle", "worldle", "wordle", "maptap", "globle"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const env = (k: string) => Deno.env.get(k) ?? "";
const origins = env("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
const inviteCode = env("JOIN_CODE").trim().toLowerCase();
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = origins.length === 0 || origins.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : (origins[0] ?? "*"),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

// Route = the path after the function name, e.g. "scores/remove".
function routeOf(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.lastIndexOf("api");
  return parts.slice(at + 1).join("/");
}

function cleanName(v: unknown) {
  const name = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (name.length < 1 || name.length > 40) throw new HttpError(400, "Pick a name between 1 and 40 characters.");
  return name;
}

function handleFrom(name: string) {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34).replace(/-+$/, "");
  return base || "player";
}

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

// Compare fixed-length hashes so the time taken says nothing about the code.
async function codeMatches(given: unknown) {
  if (!inviteCode || typeof given !== "string") return false;
  const [a, b] = await Promise.all([digest(given.trim().toLowerCase()), digest(inviteCode)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function caller(req: Request): Promise<User | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

async function profileOf(userId: string) {
  const { data, error } = await db.from("profiles").select("handle, display_name").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? { handle: data.handle as string, name: data.display_name as string } : null;
}

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 32_000) throw new HttpError(413, "That paste is too long.");
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "Malformed request."); }
}

function dayIsReasonable(day: string) {
  const t = Date.parse(day + "T12:00:00Z");
  const now = Date.now();
  return !Number.isNaN(t) && t > now - 400 * 864e5 && t < now + 2 * 864e5;
}

function cleanEntry(raw: unknown) {
  const e = (raw ?? {}) as Record<string, unknown>;
  const game = String(e.game ?? "");
  const value = Number(e.value);
  const label = typeof e.label === "string" ? e.label.trim() : "";
  const puzzle = e.puzzle == null ? null : Number(e.puzzle);
  const detail = e.detail && typeof e.detail === "object" && !Array.isArray(e.detail) ? e.detail : {};
  if (!GAMES.has(game)) throw new HttpError(400, "Unknown game.");
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) throw new HttpError(400, "That score does not look right.");
  if (!label || label.length > 60) throw new HttpError(400, "That score does not look right.");
  if (puzzle !== null && !Number.isInteger(puzzle)) throw new HttpError(400, "That puzzle number does not look right.");
  if (JSON.stringify(detail).length > 2000) throw new HttpError(400, "That score has too much detail.");
  return { game, value, label, puzzle, detail };
}

async function board(since: string) {
  const { data: people, error: pe } = await db.from("profiles").select("user_id, handle, display_name, joined_at").order("joined_at");
  if (pe) throw pe;
  const handleOf = new Map((people ?? []).map((p) => [p.user_id as string, p.handle as string]));
  const scores: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("scores").select("id, user_id, played_on, game, value, label, puzzle, detail")
      .order("played_on", { ascending: false }).order("id").range(from, from + 999);
    if (since) q = q.gte("played_on", since);
    const { data, error } = await q;
    if (error) throw error;
    for (const s of data ?? []) {
      scores.push({ id: s.id, handle: handleOf.get(s.user_id), day: s.played_on, game: s.game, value: s.value, label: s.label, puzzle: s.puzzle, detail: s.detail });
    }
    if (!data || data.length < 1000) break;
  }
  return {
    profiles: (people ?? []).map((p) => ({ handle: p.handle, name: p.display_name, joinedAt: p.joined_at })),
    scores,
  };
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const route = routeOf(url);
  const get = req.method === "GET", post = req.method === "POST";

  if (get && route === "ping") {
    const { error } = await db.from("profiles").select("user_id", { count: "exact", head: true });
    if (error) throw error;
    return { ok: true };
  }

  const user = await caller(req);
  if (!user) throw new HttpError(401, "Sign in with Google to use the board.");
  const me = await profileOf(user.id);

  if (get && route === "me") {
    const meta = user.user_metadata ?? {};
    const suggested = String(meta.full_name ?? meta.name ?? "").slice(0, 40);
    return { email: user.email ?? null, profile: me, suggestedName: suggested };
  }

  if (post && route === "join") {
    if (me) return me;
    const body = await bodyOf(req);
    if (!inviteCode) throw new HttpError(503, "Joining is closed right now.");
    if (!(await codeMatches(body.code))) {
      await new Promise((r) => setTimeout(r, 900)); // slow down guessing
      throw new HttpError(403, "That invite code is not right. Check the WhatsApp group.");
    }
    const name = cleanName(body.name);
    const base = handleFrom(name);
    for (let n = 1; n < 50; n++) {
      const handle = n === 1 ? base : `${base}-${n}`;
      const { error } = await db.from("profiles").insert({ user_id: user.id, handle, display_name: name, email: user.email ?? null });
      if (!error) return { handle, name };
      if (error.code !== "23505") throw error; // 23505 = handle taken, try the next one
      const again = await profileOf(user.id);
      if (again) return again; // joined in another tab meanwhile
    }
    throw new HttpError(409, "Could not find a free name. Try a slightly different one.");
  }

  if (!me) throw new HttpError(403, "Join the board with the invite code first.");

  if (get && route === "board") {
    const since = url.searchParams.get("since") ?? "";
    if (since && !DAY.test(since)) throw new HttpError(400, "Malformed date.");
    return await board(since);
  }

  if (post && route === "scores") {
    const body = await bodyOf(req);
    const day = String(body.day ?? "");
    if (!DAY.test(day) || !dayIsReasonable(day)) throw new HttpError(400, "Pick a day within the last year.");
    if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > GAMES.size) throw new HttpError(400, "No scores to save.");
    const pasted = typeof body.pasted === "string" ? body.pasted.slice(0, 4000) : null;
    const now = new Date().toISOString();
    const rows = body.entries.map(cleanEntry).map((e) => ({ ...e, user_id: user.id, played_on: day, pasted, updated_at: now }));
    if (new Set(rows.map((r) => r.game)).size !== rows.length) throw new HttpError(400, "One score per game, please.");
    const { error } = await db.from("scores").upsert(rows, { onConflict: "user_id,played_on,game" });
    if (error) throw error;
    return { ok: true, saved: rows.length };
  }

  if (post && route === "scores/remove") {
    const body = await bodyOf(req);
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Malformed request.");
    const { error } = await db.from("scores").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return { ok: true };
  }

  if (post && route === "profile") {
    const body = await bodyOf(req);
    const name = cleanName(body.name);
    const { error } = await db.from("profiles").update({ display_name: name }).eq("user_id", user.id);
    if (error) throw error;
    return { handle: me.handle, name };
  }

  throw new HttpError(404, "Not found.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    return reply(req, await handle(req));
  } catch (e) {
    if (e instanceof HttpError) return reply(req, { error: e.message }, e.status);
    console.error(e);
    return reply(req, { error: "Something went wrong on the board. Try again in a moment." }, 500);
  }
});
