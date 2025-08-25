# dwdw — Spotify Visual VJ (Static GitHub Pages)

A static, client-only Vite + TypeScript web app that authenticates with Spotify via Authorization Code Flow with PKCE, provides basic playback/device controls, and renders 5 hot-swappable audio-reactive visual scenes with a Director/VJ panel, quality/accessibility options, and WebM recording. Deployed to GitHub Pages.

Live: https://belisario-afk.github.io/dwdw/

## Security & Auth

- Flow: Authorization Code + PKCE. No client secret is used or stored.
- Client ID: `927fda6918514f96903e828fcd6bb576`
- Redirect URIs (register both in the Spotify Dashboard):
  - Production: `https://belisario-afk.github.io/dwdw/callback`
  - Local dev: `http://127.0.0.1:5173/callback`

Important:
- Do NOT commit or expose a client secret. None is used here.
- If you ever used a secret during testing, ROTATE it in the Spotify Dashboard and NEVER expose it.

## Deployment on GitHub Pages

Use GitHub Actions (recommended):
- Settings → Pages → Build and deployment → Source: GitHub Actions.
- The provided workflow builds to `dist/` and publishes to `gh-pages`.
- After deploy, View Source should reference `/dwdw/assets/*.js` (no `.ts`).

Alternative (no Actions): build to `docs/` and set Pages to main:/docs (not preconfigured here).

Common error:
- “Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of video/mp2t” means the page is loading `/src/main.ts`. Fix by deploying the built `dist/` (or `docs/`) output and ensuring the Pages source is set correctly.

## Dev

- Node 18+
- `npm ci`
- `npm run dev` then open http://127.0.0.1:5173/

## Features

- PKCE auth, token refresh, backoff.
- Playback via Web Playback SDK (Premium) or control active device.
- Controls: play/pause, prev/next, seek, volume, device picker.
- Visual scenes (5): Particles, Fluid, Tunnel, Terrain, Typography.
- Crossfades at phrase boundaries; auto scene selection from audio features.
- VJ panel (keyboard/MIDI), macros (intensity, bloom, glitch, speed).
- Quality panel: render scale, bloom, SSAO/motion blur toggles (scaffold), raymarch steps, particle count, fluid iterations.
- Recording to WebM.
- Accessibility toggles.
- Palette from album cover; palette-synced UI.
- Caching of audio analysis with ETags.

## Notes

- Spotify Web Playback SDK audio is DRM; no raw PCM/FFT. Analysis is approximated using Spotify Audio Analysis API.
- SPA routing on Pages uses hash; static callback forwarder at `/dwdw/callback` forwards params to `#/callback`.

## Rotate secrets reminder

- No client secret in this repo. If you ever used one during testing, rotate it in the Spotify Dashboard immediately and never expose it.