# Agent Reservations — CP1 deck

CP1 deck for the AI Agent Reservation System following the C07–C08 assignment
(`input/SWI_C07_C08_Assignment_CZ_EN_FINAL.html`), built with
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
`agent-reservations.pdf` is committed as a ready-made handout; regenerate it after
changing the deck.

Keys: `→` / `Space` next step, `←` previous, `Esc` overview. The URL hash tracks
the current slide.

## Structure

| Path | Content |
|---|---|
| `src/slides.tsx` | The deck: 23 slides, speaker notes on each; baselines, risks and actions are constants at the top |
| `src/diagrams.tsx` | Stepped SVG diagrams (intervals, lifecycle, static architecture, AS-IS → TO-BE, Approve sequence) |
| `src/ui.tsx` | Slide frame, footer, status pills, browser-framed screenshots |
| `src/theme.css` | Typography, palette (status colors match the app) |
| `public/screenshots/` | Real screenshots of the running app (seeded demo data) |

## Sections

**A · Technical Design Review** (8–10 min) — one argument line around BR-02:

1. **Scope & accepted behavior** — domain, roles, system boundary, OP-01 Create
   pre/postconditions, BR-02 verification example, v0.2 approval lifecycle.
2. **Architecture** — driver and owners, alternatives + ADR-001, static view,
   AS-IS → TO-BE, Approve sequence (dynamic view).
3. **Detailed Design** — `planDecision` / `assertCanConfirm` contract, branches → tests.
4. **Verification & Evidence** — positive, boundary and concurrent case
   (expected vs observed), C04 quality criterion.
5. **C06 Findings** — scorecard, disposition of F1–F3, F1 in detail.

**C · Project Status Report** (5–7 min) — the six slides of the template:
Executive Status, Scope & Delivery, Schedule & Resources, Top Risks & Issues,
Next Action Plan, Decision & Outlook.

`REPORTING_BASELINE` in `src/slides.tsx` must be set to the reporting tag once
it exists (A and C share it).

## Notes on react-slides 0.1.0

- `.npmrc` sets `legacy-peer-deps`: `@react-slides/plugin-shiki@0.1.0` declares a
  stale `@react-slides/core@0.0.3` peer.
- `react-slides.config.ts` exports a plain object: `@react-slides/cli@0.1.0` ships
  without a `main`/`exports` entry, so `defineConfig` cannot be imported.
- `react-slides preview` is a dev server rather than a static server, so
  `npm run preview` uses `vite preview` on the production build instead.
- `@react-slides/themes` is not used; its bundled reset overrides the deck
  typography. Layout components read the `--rs-*` variables set in `theme.css`.
