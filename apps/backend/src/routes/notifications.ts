import { Router } from 'express';
import { query } from '../utils/db';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// GET /api/notifications - in-app notification feed + unread count
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const [notificationsResult, unreadResult] = await Promise.all([
      query(
        `SELECT n.id, n.title, n.message, n.is_read, n.created_at, n.tender_id, n.filter_id,
                t.title AS tender_title, t.deadline AS tender_deadline
         FROM notifications n
         JOIN tenders t ON t.id = n.tender_id
         WHERE n.company_id = $1
         ORDER BY n.created_at DESC
         LIMIT 100`,
        [req.auth!.company_id],
      ),
      query('SELECT COUNT(*)::int AS count FROM notifications WHERE company_id = $1 AND is_read = FALSE', [req.auth!.company_id]),
    ]);
    return res.json({ notifications: notificationsResult.rows, unread_count: unreadResult.rows[0].count });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.put('/read-all', async (req: AuthenticatedRequest, res) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE company_id = $1 AND is_read = FALSE', [req.auth!.company_id]);
    return res.json({ success: true });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.put('/:id/read', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND company_id = $2 RETURNING id, is_read',
      [req.params.id, req.auth!.company_id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Notification not found.' });
    return res.json(rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// GET /api/notifications/filters - the company's custom alert rules
router.get('/filters', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, sectors, states, districts, keywords, min_value, max_value, email_enabled, created_at
       FROM user_notification_filters WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.auth!.company_id],
    );
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// POST /api/notifications/filters - create a new alert rule
router.post('/filters', async (req: AuthenticatedRequest, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Give this alert a name between 2 and 100 characters.' });

  const sectors = stringArray(req.body.sectors);
  const states = stringArray(req.body.states);
  const districts = stringArray(req.body.districts);
  const keywords = stringArray(req.body.keywords);
  const minValue = nullableNumber(req.body.min_value);
  const maxValue = nullableNumber(req.body.max_value);
  if (minValue !== null && maxValue !== null && minValue > maxValue) {
    return res.status(400).json({ error: 'Minimum value cannot be greater than maximum value.' });
  }
  const emailEnabled = req.body.email_enabled !== false;

  try {
    const { rows } = await query(
      `INSERT INTO user_notification_filters (company_id, name, sectors, states, districts, keywords, min_value, max_value, email_enabled)
       VALUES ($1, $2, $3::text[], $4::text[], $5::text[], $6::text[], $7, $8, $9)
       RETURNING id, name, sectors, states, districts, keywords, min_value, max_value, email_enabled, created_at`,
      [req.auth!.company_id, name, sectors, states, districts, keywords, minValue, maxValue, emailEnabled],
    );
    return res.status(201).json(rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// PUT /api/notifications/filters/:id - edit an existing alert rule
router.put('/filters/:id', async (req: AuthenticatedRequest, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Give this alert a name between 2 and 100 characters.' });

  const sectors = stringArray(req.body.sectors);
  const states = stringArray(req.body.states);
  const districts = stringArray(req.body.districts);
  const keywords = stringArray(req.body.keywords);
  const minValue = nullableNumber(req.body.min_value);
  const maxValue = nullableNumber(req.body.max_value);
  if (minValue !== null && maxValue !== null && minValue > maxValue) {
    return res.status(400).json({ error: 'Minimum value cannot be greater than maximum value.' });
  }
  const emailEnabled = req.body.email_enabled !== false;

  try {
    const { rows } = await query(
      `UPDATE user_notification_filters
       SET name = $1, sectors = $2::text[], states = $3::text[], districts = $4::text[], keywords = $5::text[],
           min_value = $6, max_value = $7, email_enabled = $8, updated_at = NOW()
       WHERE id = $9 AND company_id = $10
       RETURNING id, name, sectors, states, districts, keywords, min_value, max_value, email_enabled, created_at`,
      [name, sectors, states, districts, keywords, minValue, maxValue, emailEnabled, req.params.id, req.auth!.company_id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Alert rule not found.' });
    return res.json(rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// DELETE /api/notifications/filters/:id
router.delete('/filters/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const result = await query('DELETE FROM user_notification_filters WHERE id = $1 AND company_id = $2', [req.params.id, req.auth!.company_id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Alert rule not found.' });
    return res.status(204).end();
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

export default router;
