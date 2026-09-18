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

## Required configuration

Create `apps/backend/.env` using `apps/backend/.env.example`. `DATABASE_URL` must be a Neon Postgres connection string and `JWT_SECRET` must be a unique value of at least 32 characters. The application intentionally fails on startup if either is absent.

## Trust policy

The app does not generate sample tenders, estimate unsupported tender fields, or treat template data as live. Missing source evidence is represented as unavailable or queued for manual review.
