import { Router } from 'express';
import { query } from '../utils/db';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/matches - Get matches for logged in company
router.get('/', async (req: AuthenticatedRequest, res) => {
  const companyId = req.auth!.company_id;
  const filterClauses: string[] = [];
  const filterValues: unknown[] = [companyId];
  if (req.query.udyam_priority === 'true') filterClauses.push('t.udyam_priority = TRUE');
  if (req.query.emd_exempt === 'true') filterClauses.push('t.emd_exempt_msme = TRUE');
  if (typeof req.query.gem_category === 'string' && req.query.gem_category.trim()) {
    filterValues.push(req.query.gem_category.trim());
    filterClauses.push(`t.gem_category = $${filterValues.length}`);
  }
  const filterSql = filterClauses.length ? ` AND ${filterClauses.join(' AND ')}` : '';

  try {
    let { rows } = await query(`
      SELECT m.*, row_to_json(t.*) as tender
      FROM matches m
      JOIN tenders t ON m.tender_id = t.id
      WHERE m.company_id = $1 AND m.overall_score >= 30${filterSql}
      ORDER BY m.overall_score DESC
    `, filterValues);

    // A read request must remain read-only. Matching is recalculated by signup,
    // profile updates, and the explicit live-sync job; never run that expensive
    // process inside a filtered dashboard request.
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/calendar.ics', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT t.id, t.title, t.deadline, t.source
      FROM tenders t
      LEFT JOIN saved_tenders s ON s.tender_id = t.id AND s.company_id = $1
      LEFT JOIN applied_tenders p ON p.tender_id = t.id AND p.company_id = $1
      LEFT JOIN tender_applications a ON a.tender_id = t.id AND a.company_id = $1
      WHERE (s.id IS NOT NULL OR p.id IS NOT NULL OR a.id IS NOT NULL) AND t.deadline IS NOT NULL
      ORDER BY t.deadline ASC
    `, [req.auth!.company_id]);
    const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const dates = rows.map((row: { id: string; title: string; deadline: string; source: string | null }) => {
      const deadline = new Date(row.deadline);
      const stamp = deadline.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      return ['BEGIN:VEVENT', `UID:${row.id}@tendermatch`, `DTSTAMP:${stamp}`, `DTSTART:${stamp}`, `SUMMARY:${escapeIcs(row.title || 'Tender deadline')}`, `DESCRIPTION:${escapeIcs(row.source || 'TenderMatch')}`, 'END:VEVENT'].join('\r\n');
    });
    const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TenderMatch//Deadline Calendar//EN', ...dates, 'END:VCALENDAR', ''].join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tendermatch-deadlines.ics"');
    return res.send(calendar);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// Calendar data for saved, applied, pipeline, and well-matched live tenders
// (same >=30 relevance threshold as /api/matches). It contains only deadlines
// stored on the tender record; absent deadlines are not guessed.
router.get('/calendar', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT t.id, t.title, t.deadline, t.source, t.source_status, t.state,
        a.stage, a.reminder_at,
        (s.id IS NOT NULL) AS is_saved,
        (p.id IS NOT NULL) AS is_applied
      FROM tenders t
      LEFT JOIN saved_tenders s ON s.tender_id = t.id AND s.company_id = $1
      LEFT JOIN applied_tenders p ON p.tender_id = t.id AND p.company_id = $1
      LEFT JOIN tender_applications a ON a.tender_id = t.id AND a.company_id = $1
      LEFT JOIN matches m ON m.tender_id = t.id AND m.company_id = $1
      WHERE t.deadline IS NOT NULL
        AND (s.id IS NOT NULL OR p.id IS NOT NULL OR a.id IS NOT NULL OR m.overall_score >= 30)
      ORDER BY t.deadline ASC
    `, [req.auth!.company_id]);
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

async function listRelationship(companyId: string, table: 'saved_tenders' | 'applied_tenders') {
  const timeColumn = table === 'applied_tenders' ? 'applied_at' : 'created_at';
  return query(`
    SELECT r.*, m.overall_score, m.score_certifications, m.score_sector, m.score_financial,
           m.score_geography, m.score_past_projects, m.score_personnel, row_to_json(t.*) as tender
    FROM ${table} r
    JOIN tenders t ON t.id = r.tender_id
    LEFT JOIN matches m ON m.tender_id = r.tender_id AND m.company_id = r.company_id
    WHERE r.company_id = $1
    ORDER BY r.${timeColumn} DESC
  `, [companyId]);
}

router.get('/saved', async (req: AuthenticatedRequest, res) => {
  try { return res.json((await listRelationship(req.auth!.company_id, 'saved_tenders')).rows); }
  catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/applied', async (req: AuthenticatedRequest, res) => {
  try { return res.json((await listRelationship(req.auth!.company_id, 'applied_tenders')).rows); }
  catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/:tenderId/relationship', async (req: AuthenticatedRequest, res) => {
  try {
    const [saved, applied] = await Promise.all([
      query('SELECT 1 FROM saved_tenders WHERE company_id = $1 AND tender_id = $2', [req.auth!.company_id, req.params.tenderId]),
      query('SELECT 1 FROM applied_tenders WHERE company_id = $1 AND tender_id = $2', [req.auth!.company_id, req.params.tenderId]),
    ]);
    return res.json({ saved: (saved.rowCount ?? 0) > 0, applied: (applied.rowCount ?? 0) > 0 });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// POST /api/matches/:id/save - Save a tender
router.post('/:tenderId/save', async (req: AuthenticatedRequest, res) => {
  const companyId = req.auth!.company_id;
  const tenderId = req.params.tenderId;

  try {
    const { rows } = await query(`
      INSERT INTO saved_tenders (company_id, tender_id)
      VALUES ($1, $2)
      ON CONFLICT (company_id, tender_id) DO NOTHING
      RETURNING *
    `, [companyId, tenderId]);
    
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:tenderId/save', async (req: AuthenticatedRequest, res) => {
  try {
    await query('DELETE FROM saved_tenders WHERE company_id = $1 AND tender_id = $2', [req.auth!.company_id, req.params.tenderId]);
    return res.status(204).end();
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// POST /api/matches/:id/apply - Apply for a tender
router.post('/:tenderId/apply', async (req: AuthenticatedRequest, res) => {
  const companyId = req.auth!.company_id;
  const tenderId = req.params.tenderId;

  try {
    const { rows } = await query(`
      INSERT INTO applied_tenders (company_id, tender_id)
      VALUES ($1, $2)
      ON CONFLICT (company_id, tender_id) DO NOTHING
      RETURNING *
    `, [companyId, tenderId]);

    return res.status(201).json(rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:tenderId/apply', async (req: AuthenticatedRequest, res) => {
  try {
    await query('DELETE FROM applied_tenders WHERE company_id = $1 AND tender_id = $2', [req.auth!.company_id, req.params.tenderId]);
    return res.status(204).end();
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/applications/board', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(`
      SELECT a.*, row_to_json(t.*) AS tender
      FROM tender_applications a JOIN tenders t ON t.id = a.tender_id
      WHERE a.company_id = $1 ORDER BY a.updated_at DESC
    `, [req.auth!.company_id]);
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.put('/:tenderId/application', async (req: AuthenticatedRequest, res) => {
  const stages = ['discovered', 'interested', 'preparing', 'submitted', 'won', 'lost'];
  const stage = typeof req.body.stage === 'string' ? req.body.stage : 'discovered';
  if (!stages.includes(stage)) return res.status(400).json({ error: 'Invalid application stage.' });
  const reminder = req.body.reminder_at ? new Date(req.body.reminder_at) : null;
  if (reminder && Number.isNaN(reminder.getTime())) return res.status(400).json({ error: 'Invalid reminder date.' });
  try {
    const { rows } = await query(`
      INSERT INTO tender_applications (company_id, tender_id, stage, notes, reminder_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_id, tender_id) DO UPDATE SET stage = EXCLUDED.stage,
        notes = EXCLUDED.notes, reminder_at = EXCLUDED.reminder_at, updated_at = NOW()
      RETURNING *
    `, [req.auth!.company_id, req.params.tenderId, stage, typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null, reminder]);
    return res.json(rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

export default router;
