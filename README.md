# Awiros Games

A daily leaderboard for the games the Awiros WhatsApp group plays: Krillion, Perceptle, Chainle, Worldle, Wordle, MapTap and Globle. Everyone pastes their share text, and the board ranks the day, the week and all time.

**Live:** https://atishay-aj.github.io/awiros-games-board/

## How it works

- **Today:** "Paste from clipboard", a checklist of the 7 games with play links, the day's podium, and each game's ranking with a round-by-round comparison.
- **Daily score (overall ranking):** each game scores 0–100 by where you finished among that day's players (`100 × (players − place + 1) ÷ players`, ties share). Your daily score is the average of your best 4 games, rounded to a whole number, and you need 4 games that someone else also played to be ranked. Crowns 👑 still go to 1st place in each game.
- **Standings:** week (average of best 5 daily scores, at least 3 ranked days, or fewer while the week has had fewer days with a ranking), month (best 20, at least 8) and all time (every ranked day, at least 5), with a podium, day wins, crowns per game and awards.
- **Profiles:** streaks, per-game averages and trends, and head-to-head records.
- **Right day, every time:** each score is filed under the day its puzzle belongs to (from the puzzle number, or the date MapTap and Globle print), not the day you paste it. A puzzle can only be posted once per player, and the API rejects a puzzle number saved on the wrong day.
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
