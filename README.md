# Railway Traffic Control Simulator

Professional browser-based railway traffic control simulator inspired by real CTC / NX dispatching panels.

## Status
**Section 1 of 18** — Bootstrap. The simulation engine and gameplay are not yet implemented; this commit lays the foundation.

## Stack
- React 18 + TypeScript (strict)
- Vite 5
- Zustand (state)
- Vitest (tests)
- ESLint + Prettier
- SVG rendering (planned)

## Scripts
```sh
npm install
npm run dev        # Vite dev server
npm test           # run tests once
npm run test:watch # watch tests
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

## Architecture
The simulation engine lives in `src/engine/**` as **pure TypeScript** with no React imports (enforced by ESLint). The UI in `src/ui/**` renders engine state and dispatches typed `Command`s. See `CHANGELOG.md` for the section-by-section build log.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full architecture reference: engine/UI boundaries, command/event flow, topology model, serialization, and long-term design goals.
