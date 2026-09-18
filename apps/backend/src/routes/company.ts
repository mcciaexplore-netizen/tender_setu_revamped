import { Router } from 'express';
import multer from 'multer';
import { createHash, randomBytes } from 'crypto';
import { query } from '../utils/db';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const documentTypes = ['udyam', 'gst', 'pan', 'iso_certificate', 'past_project_proof', 'other'];

function canManage(req: AuthenticatedRequest) {
  return req.auth?.role === 'owner' || req.auth?.role === 'admin' || req.auth?.role === 'bid_manager';
}

function canManageTeam(req: AuthenticatedRequest) {
  return req.auth?.role === 'owner' || req.auth?.role === 'admin';
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

router.get('/documents', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(`SELECT id, document_type, file_name, mime_type, expires_at, verified_at, created_at
      FROM company_documents WHERE company_id = $1 ORDER BY created_at DESC`, [req.auth!.company_id]);
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.post('/documents', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Your team role cannot manage documents.' });
  const documentType = String(req.body.document_type ?? '');
  if (!documentTypes.includes(documentType)) return res.status(400).json({ error: 'Invalid document type.' });
  if (!req.file || !['application/pdf', 'image/jpeg', 'image/png'].includes(req.file.mimetype)) return res.status(415).json({ error: 'Upload a PDF, JPEG, or PNG document up to 5 MB.' });
  try {
    const { rows } = await query(`INSERT INTO company_documents (company_id, document_type, file_name, storage_key, mime_type, content)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, document_type, file_name, mime_type, created_at`,
      [req.auth!.company_id, documentType, req.file.originalname, `postgres:${req.auth!.company_id}:${Date.now()}`, req.file.mimetype, req.file.buffer]);
    return res.status(201).json(rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/documents/:id/download', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query('SELECT file_name, mime_type, content FROM company_documents WHERE id = $1 AND company_id = $2', [req.params.id, req.auth!.company_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Document not found.' });
    res.type(rows[0].mime_type); res.setHeader('Content-Disposition', `attachment; filename="${String(rows[0].file_name).replace(/["\\r\\n]/g, '')}"`);
    return res.send(rows[0].content);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/completeness', async (req: AuthenticatedRequest, res) => {
  try {
    const [companyResult, docsResult] = await Promise.all([
      query('SELECT udyam_number, gstin, pan, gem_registered FROM companies WHERE id = $1', [req.auth!.company_id]),
      query('SELECT document_type FROM company_documents WHERE company_id = $1', [req.auth!.company_id]),
    ]);
    const company = companyResult.rows[0];
    const documented = new Set(docsResult.rows.map((row: { document_type: string }) => row.document_type));
    const checks = [
      { label: 'Udyam registration', complete: Boolean(company?.udyam_number || documented.has('udyam')) },
      { label: 'GST registration', complete: Boolean(company?.gstin || documented.has('gst')) },
      { label: 'PAN', complete: Boolean(company?.pan || documented.has('pan')) },
      { label: 'GeM registration', complete: Boolean(company?.gem_registered) },
      { label: 'ISO certificate', complete: documented.has('iso_certificate') },
      { label: 'Past project proof', complete: documented.has('past_project_proof') },
    ];
    return res.json({ checks, complete: checks.filter((item) => item.complete).length, total: checks.length });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/team', async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query('SELECT id, email, role, is_active, created_at FROM company_users WHERE company_id = $1 ORDER BY created_at', [req.auth!.company_id]);
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.get('/team/invitations', async (req: AuthenticatedRequest, res) => {
  if (!canManageTeam(req)) return res.status(403).json({ error: 'Only an owner or administrator can view invitations.' });
  try {
    const { rows } = await query(`SELECT id, email, role, expires_at, created_at
      FROM company_invitations WHERE company_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
      ORDER BY created_at DESC`, [req.auth!.company_id]);
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.post('/team/invitations', async (req: AuthenticatedRequest, res) => {
  if (!canManageTeam(req)) return res.status(403).json({ error: 'Only an owner or administrator can invite team members.' });
  const email = normalizeEmail(req.body.email);
  const role = typeof req.body.role === 'string' ? req.body.role : '';
  if (!email || !['owner', 'bid_manager', 'viewer'].includes(role)) return res.status(400).json({ error: 'Provide a valid email and team role.' });
  try {
    const existing = await query('SELECT 1 FROM company_users WHERE email = $1', [email]);
    if (existing.rowCount) return res.status(409).json({ error: 'This email already has a TenderMatch account.' });
    const token = randomBytes(32).toString('base64url');
    const { rows } = await query(`INSERT INTO company_invitations (company_id, created_by_user_id, email, role, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
      RETURNING id, email, role, expires_at, created_at`,
      [req.auth!.company_id, req.auth!.user_id, email, role, hashInvitationToken(token)]);
    return res.status(201).json({ ...rows[0], token });
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.delete('/team/invitations/:id', async (req: AuthenticatedRequest, res) => {
  if (!canManageTeam(req)) return res.status(403).json({ error: 'Only an owner or administrator can revoke invitations.' });
  try {
    const result = await query(`UPDATE company_invitations SET revoked_at = NOW()
      WHERE id = $1 AND company_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`, [req.params.id, req.auth!.company_id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Active invitation not found.' });
    return res.status(204).end();
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.patch('/team/:userId', async (req: AuthenticatedRequest, res) => {
  if (!canManageTeam(req)) return res.status(403).json({ error: 'Only an owner or administrator can change team roles.' });
  const role = String(req.body.role ?? '');
  if (!['owner', 'bid_manager', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid team role.' });
  try {
    const existing = await query('SELECT role FROM company_users WHERE id = $1 AND company_id = $2', [req.params.userId, req.auth!.company_id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Team member not found.' });
    if (existing.rows[0].role === 'owner' && role !== 'owner') {
      const owners = await query(`SELECT COUNT(*)::int AS count FROM company_users
        WHERE company_id = $1 AND role = 'owner' AND is_active = TRUE`, [req.auth!.company_id]);
      if (owners.rows[0].count < 2) return res.status(409).json({ error: 'Keep at least one active owner on the company account.' });
    }
    const { rows } = await query('UPDATE company_users SET role = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING id, email, role, is_active', [role, req.params.userId, req.auth!.company_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Team member not found.' });
    return res.json(rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

export default router;
