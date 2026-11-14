// Security rules, read straight from the sources so a change that breaks them fails here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const api = read('supabase/functions/api/index.ts');
const app = read('site/js/app.js');
const config = read('site/config.js');
const schema = fs.readdirSync(path.join(__dirname, '../supabase/migrations')).map((f) => read('supabase/migrations/' + f)).join('\n');

const at = (needle) => { const i = api.indexOf(needle); assert.notEqual(i, -1, 'missing in api: ' + needle); return i; };

test('only /ping is public, and it returns no data', () => {
  const ping = api.slice(at('route === "ping"'), at('const user = await caller(req)'));
  assert.match(ping, /head: true/);
  assert.match(ping, /return \{ ok: true \};/);
});

test('everything after /ping needs a signed-in user', () => {
  assert.ok(at('if (!user) throw new HttpError(401') < at('route === "me"'));
});

test('board data and changes need a profile, which only the invite code gives', () => {
  const gate = at('if (!me) throw new HttpError(403');
  ['route === "board"', 'route === "scores"', 'route === "scores/remove"', 'route === "profile"'].forEach((r) => assert.ok(gate < at(r), r + ' must come after the profile check'));
  assert.ok(at('codeMatches(body.code)') < at('from("profiles").insert'), 'the code is checked before a profile is created');
  assert.match(api, /if \(!inviteCode\) throw new HttpError\(503/);
});

test('you can only write, remove or rename your own things', () => {
  assert.match(api, /user_id: user\.id, played_on: day/);
  assert.match(api, /\.delete\(\)\.eq\("id", id\)\.eq\("user_id", user\.id\)/);
  assert.match(api, /\.update\(\{ display_name: name \}\)\.eq\("user_id", user\.id\)/);
});

test('scores are validated on the server', () => {
  assert.match(api, /if \(!GAMES\.has\(game\)\)/);
  assert.match(api, /dayIsReasonable\(day\)/);
  assert.match(api, /One score per game/);
});

test('browsers have no direct access to the tables', () => {
  assert.match(schema, /enable row level security/);
  assert.match(schema, /revoke all on table public\.profiles, public\.scores from anon, authenticated;/);
});

test('the page sends the session token and never a user id', () => {
  assert.match(app, /headers\.Authorization = 'Bearer ' \+ t;/);
  assert.doesNotMatch(app, /user_id/);
});

test('config.js holds only public values', () => {
  assert.doesNotMatch(config, /service_role|sb_secret_/i);
  const key = (config.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
  assert.ok(key, 'anon key present');
  const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  assert.equal(role, 'anon');
});
