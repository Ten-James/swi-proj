# Agent Reservations — pitch deck

Product and architecture pitch for the AI Agent Reservation System, built with
[react-slides](https://ten-james.github.io/react-slides/).

The deck is in Czech. Terms without a natural Czech equivalent stay in English
rather than as Czech-ified loanwords: code identifiers and status values,
module names (Reservation Service, Route Handlers), the spec's domain terms
(User, Admin, Session) and terms such as spike, walking skeleton, rollback,
architecture drivers or HttpOnly session cookie.

## Run

```bash
cd presentation
npm install
npm run dev        # dev server with HMR
npm run build      # static export to dist/
npm run preview    # serve dist/ at http://localhost:4173
npm run pdf        # with preview running: agent-reservations.pdf
```

Deploying under a sub-path (e.g. a university home directory) needs the base at build
time; images go through `asset()` in `src/ui.tsx`, so they follow it:

```bash
npx react-slides build --base /~ind0040/
npx vite preview --base /~ind0040/ --port 4173   # served at /~ind0040/
```

`npm run pdf` drives the system Chrome (`CHROME_PATH`, default
`/usr/bin/google-chrome`) and prints one vector page per slide with all builds
revealed; the code slide gets two pages (`planDecision`, `assertCanConfirm`).
`agent-reservations.pdf` is committed as a ready-made handout.

Keys: `→` / `Space` next step, `←` previous, `Esc` overview. The URL hash tracks
the current slide.

## Structure

| Path | Content |
|---|---|
| `src/slides.tsx` | The deck: 27 slides, speaker notes on each |
| `src/diagrams.tsx` | Stepped SVG diagrams (allocation premise, intervals, lifecycle, architecture, AS-IS → TO-BE) |
| `src/ui.tsx` | Slide frame, footer, status pills, browser-framed screenshots |
| `src/theme.css` | Typography, palette (status colors match the app) |
| `public/screenshots/` | Real screenshots of the running app (seeded demo data) |
| `public/images/` | Use-case diagrams v0.1 / v0.2 and the outage sketch from `docs/` |

## Sections

1. **Product** — time-based allocation premise, app tour, six guarantees (BR-01…05, AR-01), half-open
   intervals, v0.2 lifecycle, the late-approval conflict shown in the real UI.
2. **Architecture** — scope evolution, drivers, alternatives A/B, comparison,
   static architecture, AS-IS → TO-BE ownership, runtime and stack.
3. **Detailed design** — pure `reservation-policy`, rule codes → HTTP.
4. **Evidence** — test results, C01 → C05 timeline, risks and roadmap.
5. **Review (C06)** — scorecard from the reviewing team and a decision on each
   finding (F1–F3).

## Notes on react-slides 0.1.0

- `.npmrc` sets `legacy-peer-deps`: `@react-slides/plugin-shiki@0.1.0` declares a
  stale `@react-slides/core@0.0.3` peer.
- `react-slides.config.ts` exports a plain object: `@react-slides/cli@0.1.0` ships
  without a `main`/`exports` entry, so `defineConfig` cannot be imported.
- `react-slides preview` is a dev server rather than a static server, so
  `npm run preview` uses `vite preview` on the production build instead.
- `@react-slides/themes` is not used; its bundled reset overrides the deck
  typography. Layout components read the `--rs-*` variables set in `theme.css`.
