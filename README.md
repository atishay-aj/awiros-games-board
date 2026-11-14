# Awiros Games

A daily leaderboard for the games the Awiros WhatsApp group plays: Krillion, Perceptle, Chainle, Worldle, Wordle, MapTap and Globle. Everyone pastes their share text, and the board ranks the day, the week and all time.

**Live:** https://atishay-aj.github.io/awiros-games-board/

## How it works

- **Today:** "Paste from clipboard", a checklist of the 7 games with play links, the day's podium, and each game's ranking with a round-by-round comparison.
- **Points:** in each game each day, 1st / 2nd / 3rd get 3 / 2 / 1 points and 1st gets a crown, once two people have posted that game. Equal scores share the place.
- **Standings:** week (from Monday), month and all time, with a podium, crowns per game and awards.
- **Profiles:** streaks, per-game averages and trends, and head-to-head records.
- **Sharing:** one tap posts a day or week summary to WhatsApp.
- **App:** installable to the home screen.

## Layout

| Path | What it is |
|---|---|
| `site/` | The whole website, served as-is by GitHub Pages (no build step) |
| `site/js/games.js` | Game list and the readers for each game's share text |
| `site/js/scoring.js` | Places, points, streaks, awards, head-to-head |
| `site/js/ui.js`, `site/js/app.js` | The page |
| `site/config.js` | Public settings: API address and Supabase anon key |
| `supabase/migrations/` | Database tables (`profiles`, `scores`) |
| `supabase/functions/api/` | The API every request goes through |
| `test/` | `npm test` runs parser, scoring and security tests |

## Access and security

- Players sign in with any Google account, then enter the invite code once. Until then they see nothing.
- The browser never touches the database. The `api` function checks the Google session on every request and always writes under the caller's own account, so nobody can post as someone else.
- The only public endpoint is `/ping`, which returns `{ "ok": true }` and is used by the daily keep-alive job.

### Admin

- **Change the invite code** (people who already joined stay in):
  `npx supabase secrets set JOIN_CODE=new-code --project-ref iqvwxhxkoznehopjrpqz`
- **Remove someone:** Supabase dashboard → Authentication → Users → delete their account. Their profile and scores go with it.
- **Deploy the API:** `npx supabase functions deploy api --use-api --no-verify-jwt`
- **Site:** every push to `main` runs the tests and publishes `site/` (`.github/workflows/pages.yml`).
- **Keep-alive:** `.github/workflows/keep-alive.yml` pings the API daily so the free Supabase project never pauses.

## Running locally

```bash
npm test
npm run serve   # http://localhost:8000 (sign-in needs localhost:8000 in Supabase's allowed redirect URLs)
```

## License

Copyright (c) 2026 Atishay Jain. All rights reserved. See [LICENSE](LICENSE).
