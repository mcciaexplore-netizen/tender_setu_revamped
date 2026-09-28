import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

// Without a listener, an error on an idle pooled client (e.g. the database
// provider closing a connection the pool isn't actively using) is an
// unhandled EventEmitter 'error' event, which crashes the whole process.
// This keeps that failure contained to a log line; the pool opens a fresh
// connection for the next query.
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

function isConnectionResetError(error: any): boolean {
  const message = String(error?.message ?? '');
  return error?.code === 'ECONNRESET'
    || message.includes('Connection terminated unexpectedly')
    || message.includes('terminating connection');
}

// A helper for querying to make it simpler to use across the app. Retries
// once on a dropped-connection error, since a connection can be closed by
// the provider between being borrowed from the pool and the query running;
// the pool transparently opens a new one for the retry.
export const query = async (text: string, params?: any[]) => {
  try {
    return await pool.query(text, params);
  } catch (error) {
    if (!isConnectionResetError(error)) throw error;
    console.warn('[DB Pool] Query failed on a dropped connection, retrying once...');
    return pool.query(text, params);
  }
};
