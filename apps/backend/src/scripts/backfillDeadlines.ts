// One-off backfill: most previously ingested tenders never got a deadline
// because the local regex fallback couldn't parse the "Closing Date:
// DD-MonthName-YYYY" format used by GeM CPPP and most other portals (see
// parseLocalTenderData in extractionService.ts, now fixed). This re-parses
// deadlines from the raw_text already stored for tenders that are still
// missing one, without re-scraping or calling the Gemini API.
import { pool, query } from '../utils/db';
import { parseLocalTenderData } from '../services/extractionService';

async function main() {
  const { rows } = await query(
    `SELECT id, source, raw_text FROM tenders WHERE deadline IS NULL AND raw_text IS NOT NULL`,
  );
  console.log(`Found ${rows.length} tenders missing a deadline.`);

  let updated = 0;
  for (const row of rows) {
    const { deadline } = parseLocalTenderData(row.raw_text, row.source ?? '');
    if (deadline) {
      await query('UPDATE tenders SET deadline = $1 WHERE id = $2', [deadline, row.id]);
      updated++;
    }
  }

  console.log(`Backfilled deadline on ${updated} of ${rows.length} tenders.`);
  await pool.end();
}

main().catch((error) => {
  console.error('Deadline backfill failed:', error);
  process.exit(1);
});
