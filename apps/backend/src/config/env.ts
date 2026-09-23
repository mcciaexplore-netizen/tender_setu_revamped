import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set before TenderMatch can start.`);
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  adminEmails: new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
  // Optional: Gemini API key for AI-powered tender extraction.
  // Get a free key at https://aistudio.google.com/apikey (no credit card needed).
  // If not set, the scraper falls back to the local regex-based parser.
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? '',
};

if (env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

export function isConfiguredAdmin(email: string): boolean {
  return env.adminEmails.has(email.trim().toLowerCase());
}
