import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

// A helper for querying to make it simpler to use across the app
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};
