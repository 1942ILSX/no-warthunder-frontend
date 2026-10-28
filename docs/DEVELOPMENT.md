# NO WarThunder — browser client

Ten original missions, a Go-authoritative tank game, and an opt-in top-ten board for each mission. Vite, TypeScript and Canvas 2D; no browser game engine or runtime framework.

## Run locally

Use Node.js 24+ for Vite and native TypeScript tests. Start the Go backend on `127.0.0.1:8080`, then:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` (including WebSocket upgrades) and `/healthz` to the Go server. All API URLs are relative, so the same production build works when served by Go using `FRONTEND_DIR`.

```sh
npm run typecheck
npm test
npm run build
```

The deployment output is `dist/`. Build on your development machine or CI rather than using the production server's 256 MB memory budget. `npm run preview` serves the static build for inspection; production API routes should be served by Go, or configured in your reverse proxy.

## Controls

- WASD or arrow keys: move and turn. The most recently pressed direction wins.
- Space: hold to fire.
- Escape / Mission select: confirm leaving a live run.
- Touch devices: on-screen directional pad and fire button.
- Header sound button: opt into original synthesized effects. Sound is off by default.

Inputs are cleared when the window loses focus. There is no pause: the mission and server-measured elapsed time continue while a dialog is open or the tab is in the background. Disconnection ends the active run. A victory opens an optional ID form; skipping it sends no leaderboard submission.

## Architecture

- `src/index.ts`: room connection lifecycle, keyboard/touch input, mission and difficulty selection, leaderboard, and results.
- `src/types.ts`: JSON protocol v2 types. The canonical backend contract is `docs/PROTOCOL.md` in the backend repository.
- `src/difficulty.ts`: validated difficulty preferences and multiplier display formatting. It never calculates authoritative scores.
- `src/renderer.ts`: terrain/tank artwork, entity interpolation and bounded local-player visual extrapolation. The Go server owns positions, collisions, damage, score and outcomes. Visual extrapolation resets at each snapshot and is limited to 80 ms; it is not authoritative rollback prediction.
- `src/audio.ts`: small Web Audio synthesizer; no third-party samples.
- `src/shell.ts` / `styles.css`: responsive UI, keyboard-accessible dialogs and reduced-motion support.

No RL model is bundled in the browser. The backend loads the three qualified model artifacts once and performs enemy inference in Go. The browser sends only sequenced direction/fire inputs during play. On victory it submits a server-issued single-use completion token and chosen display ID; client-supplied scores are never sent.

Player IDs are escaped before rendering. Only the optional last-used display ID, sound, language, and difficulty preferences are stored in localStorage. Scores remain server-owned. Empty leaderboards remain empty; no placeholder records are fabricated.

## Difficulty and score contract

The main page fetches `/api/difficulties` alongside `/api/levels`. The backend
offers Trainee ×1.0, Expert ×1.5 (default), and Ace ×2.0. A saved `nwt-difficulty`
preference is used only if that tier still appears in the backend catalog.
The selector describes AI difficulty separately from the level's fixed threat
rating.

Room creation sends `{levelId, difficulty}`. The room response, WebSocket
welcome, and final result include the locked `difficulty`, `scoreMultiplier`,
and `policyVersion`. Changing difficulty requires returning to the main page
and starting another room; retries keep the selected tier.

Snapshot and result `score` fields are already weighted by the backend. The
client must not multiply them again. `baseScore` is supplied separately for the
result breakdown. Fractional points round down. The multiplier includes the
victory bonus as well as combat score.

Every level has one top-ten board across all difficulties, ranked by final
score then duration. New records include difficulty metadata. Older records
without it display a Legacy label and retain their original scores.

All terrain, tank drawings, icons and level mini-maps are rendered from local code and backend metadata. Barlow, Barlow Condensed and IBM Plex Mono Latin font subsets are bundled locally through Fontsource; the production client makes no third-party runtime font request. System fallbacks cover other scripts. Font licenses are included with their Fontsource packages.


## Languages

The header and each dialog include a language selector: `en`, `zh_cn`, and `jp`. Saved selection (`bcr-locale`) takes priority over the browser language. HTML language tags are `en`, `zh-CN`, and `ja`. Switching languages updates text and accessible labels in place, preserving the active room, input sequence, typed ID, and submission state. Original project directories, protocol/module names, and existing ID/sound preferences are retained.

`src/locales/en.ts` is the canonical flat message catalog. `zh_cn.ts` and `jp.ts` must provide every key and preserve interpolation placeholders. Locale helpers are import-safe for Node tests. API errors use stable backend codes, with a compatibility map for the earlier English error messages; unknown errors use a localized generic message.
