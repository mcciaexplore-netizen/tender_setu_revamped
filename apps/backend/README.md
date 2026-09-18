# TenderMatch Backend

Backend service for the TenderMatch platform, built with Node.js, Express, TypeScript, Neon Postgres, and local deterministic extraction.

## Tech Stack
- Node.js + Express
- TypeScript
- Neon PostgreSQL
- Node's built-in password hashing and JWT authentication
- Local, evidence-based tender extraction with manual-review fallback

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup environment variables:
   Copy `.env.example` to `.env` and fill in the required keys.

3. Setup Database:
   Set `DATABASE_URL` and run `npm run migrate:up`. The migration is additive and does not drop data.

## Running the server

Development mode:
```bash
npm run dev
```

Build for production:
```bash
npm run build
npm start
```
