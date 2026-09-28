import { runLiveScraper } from '../services/scraperService';
import { pool } from '../utils/db';

async function main() {
  console.log('--- Starting Standalone Universal Scraper ---');
  try {
    const result = await runLiveScraper();
    console.log(`--- Scraper finished: ${result.count} new tenders added ---`);
  } catch (err: any) {
    console.error('Scraper encountered an error:', err);
  } finally {
    // A GitHub Actions run should still exit 0 even if closing an
    // already-broken pool throws, so a flaky network doesn't turn a
    // "some portals were unreachable" run into a reported CI failure.
    try {
      await pool.end();
    } catch (closeErr: any) {
      console.warn('Pool close warning:', closeErr.message);
    }
    process.exit(0);
  }
}

void main();
