# TenderMatch

TenderMatch is a single-deployable Node application for evidence-based tender discovery and MSME workflow management.

## Workspace

- `apps/backend` — Express API, Neon/Postgres migrations, extraction, matching, and static-file hosting.
- `apps/frontend` — Vite/React application using the existing Tailwind and Radix interface.
- `packages/shared-types` — shared source-status, role, application, and match contracts.

## Commands

```powershell
npm install
npm run migrate:up
npm run build
npm test
npm run lint
npm start
```

`npm run build` copies the frontend bundle into `apps/backend/public`; `npm start` then serves the UI and `/api` from one Node process.

## Setting up on a new laptop

The project has no machine-specific paths, so it can be cloned to any folder or drive.

1. Install Node.js 20 or newer.
2. Clone the repo anywhere and run `npm install` in the repo root.
3. Copy `apps/backend/.env.example` to `apps/backend/.env` and fill in `DATABASE_URL` and `JWT_SECRET` (`.env` is git-ignored, so it never comes with the clone).
4. `npm run migrate:up`, then `npm run build`, then `npm start`, and open http://localhost:3000. Set `PORT` in `.env` if 3000 is already in use.
5. For frontend development, run `npm run dev:backend` and `npm run dev:frontend` in two terminals. The dev server proxies `/api` to http://localhost:3000, so no extra frontend config is needed (see `apps/frontend/.env.example` if the backend uses another port).

## Required configuration

Create `apps/backend/.env` using `apps/backend/.env.example`. `DATABASE_URL` must be a Neon Postgres connection string and `JWT_SECRET` must be a unique value of at least 32 characters. The application intentionally fails on startup if either is absent.

## Trust policy

The app does not generate sample tenders, estimate unsupported tender fields, or treat template data as live. Missing source evidence is represented as unavailable or queued for manual review.
