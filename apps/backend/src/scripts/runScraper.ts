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
    await pool.end();
    process.exit(0);
  }
}

void main();
