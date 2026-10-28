# NO WarThunder — Frontend

Browser client for a tank defense game with ten original, independently
selectable levels. TypeScript and Canvas render the game; a Go backend owns the
simulation, enemy AI, score, completion receipts, and leaderboard.

- Keyboard controls: **WASD / arrow keys** to move, **Space** to fire.
- Touch controls, sound toggle, and **English (`en`), 简体中文 (`zh_cn`), 日本語 (`jp`)**.
- Three trained AI difficulties, selected before starting a room.
- Optional player ID submission after a win. Each level keeps only its best
  **ten runs**, across all difficulties: higher score first, then shorter time.

| Difficulty | Score multiplier |
| --- | ---: |
| Trainee | ×1.0 |
| Expert (default) | ×1.5 |
| Ace | ×2.0 |

Difficulty is separate from a level's fixed threat rating. A room locks its
difficulty for the whole run. The backend applies the multiplier once to the
full base score, rounding fractional points down; the browser displays the
server result and its breakdown. Records from before trained difficulties were
introduced remain marked **Legacy**.

## Related repositories

- [Backend](https://github.com/1942ILSX/no-warthunder-backend): Go simulation,
  HTTP/3, WebTransport/WebSocket API, leaderboard persistence, and the three qualified model
  artifacts. No Python runtime is needed to play.
- [AI training](https://github.com/1942ILSX/no-warthunder-ai): offline training,
  evaluation, and model export. Training does not require a human opponent.

## Run locally

Use **Node.js 24 or newer** and npm. This supports both Vite 8 and the test
suite's native TypeScript execution. The current setup was verified on Node.js
26.12.1.

Clone the frontend and backend into sibling directories:

```sh
git clone https://github.com/1942ILSX/no-warthunder-frontend.git
git clone https://github.com/1942ILSX/no-warthunder-backend.git
```

Start the backend in its own terminal, following its README:

```sh
cd no-warthunder-backend
go run .
```

Then start this client in another terminal:

```sh
cd no-warthunder-frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite forwards `/api`, its WebSocket connections,
and `/healthz` to `http://127.0.0.1:8080`. Both services bind to loopback by
default. Start the current backend before loading the page: the difficulty
picker requires its `/api/difficulties` endpoint.

The chosen language and difficulty are remembered in browser storage. Retrying
a run preserves the chosen difficulty; return to the main page to change it.

## Check and build

```sh
npm test
npm run typecheck
npm run build
```

`npm run build` produces `dist/`. To serve that build locally through Go, set
the backend's `FRONTEND_DIR` to this directory. Build output, dependencies,
local environment files, and IDE files are excluded from Git.

The tests cover input handling, ID validation, localization, error mapping,
difficulty preferences, and the room API contract. They do not replace browser
playtesting of controls or level design.

## Production transport and asset delivery

On HTTPS the client tries WebTransport when the room advertises
`webTransportPath`. It falls back to WebSocket if WebTransport is unavailable
or fails before sending `join`, reusing the same room reservation. A failure
after `join` ends the run; automatic mid-game resume is not implemented.
Local HTTP development continues to use WebSocket.

The production build contains an origin-hosted bootstrap. It fetches
`/api/client-config`, which supplies `assetBaseURL` (the complete HTTPS CDN
release prefix) and configurable `originAssetRatio` (default `0.1`). For example,
a ratio of `0.1` assigns 10% of browser tab sessions to origin and 90% to CDN.
A random draw saved in sessionStorage keeps the choice stable across reloads
and multiple game rooms. This is a session ratio, not an exact bandwidth ratio.

Publish the same `dist/` files at the origin root and beneath the CDN release
prefix. Relative module and font URLs keep each asset group on its chosen
origin. The bootstrap loads no eager module, stylesheet, or font before
selection. CDN preflight or stylesheet failure falls back to origin and
remembers that failure for this release and session. Module evaluation is
never raced against a second application import.

HTML and `/api/client-config` require `Cache-Control: no-store` or revalidation.
Versioned CDN files and hashed origin assets can use immutable caching. The CDN
must allow cross-origin GET requests from the game origin for modules and fonts.
`asset-manifest.json` lists the entry module and CSS files for deployment checks.

## License

Licensed under the [MIT License](LICENSE).
