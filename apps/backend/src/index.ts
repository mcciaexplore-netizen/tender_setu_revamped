import express from 'express';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, isConfiguredAdmin } from './config/env';
import { pool, query } from './utils/db';
import { hashPassword, verifyPassword } from './services/passwordService';
import { signAccessToken, UserRole } from './services/tokenService';
import { requireAuth, AuthenticatedRequest } from './middleware/auth';
import { scoreCompanyAgainstTenders } from './services/matchingService';
import { runLiveScraper } from './services/scraperService';

// Import routers
import tendersRouter from './routes/tenders';
import matchesRouter from './routes/matches';
import adminRouter from './routes/admin';
import proxyRouter from './routes/proxy';
import companyRouter from './routes/company';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      env.corsOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS policy.'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again later.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function createToken(user: { id: string; company_id: string; role: UserRole }): string {
  return signAccessToken({ user_id: user.id, company_id: user.company_id, role: user.role });
}

function invitationTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function findOpenInvitation(token: string) {
  if (token.length < 32 || token.length > 200) return null;
  const { rows } = await query(`SELECT i.id, i.company_id, i.email, i.role, c.profile
    FROM company_invitations i JOIN companies c ON c.id = i.company_id
    WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()`, [invitationTokenHash(token)]);
  return rows[0] ?? null;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const { rows } = await query(`
      SELECT u.id, u.company_id, u.password_hash, u.role, u.is_active, c.profile
      FROM company_users u JOIN companies c ON c.id = u.company_id
      WHERE u.email = $1 LIMIT 1
    `, [email]);
    const user = rows[0];
    if (!user?.is_active || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const role: UserRole = isConfiguredAdmin(email) ? 'admin' : user.role;
    if (role !== user.role) await query('UPDATE company_users SET role = $1, updated_at = NOW() WHERE id = $2', [role, user.id]);
    const profile = typeof user.profile === 'string' ? JSON.parse(user.profile) : user.profile;
    return res.json({
      token: createToken({ id: user.id, company_id: user.company_id, role }),
      companyId: user.company_id,
      companyName: profile?.companyName ?? 'Your Company',
      role,
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const companyName = typeof req.body.companyName === 'string' ? req.body.companyName.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || companyName.length < 3 || password.length < 12) {
    return res.status(400).json({ error: 'Use a valid email, company name, and a password of at least 12 characters.' });
  }

  const sectors = Array.isArray(req.body.sectors) ? req.body.sectors.filter((sector: unknown) => typeof sector === 'string') : [];
  const certifications = Array.isArray(req.body.certifications) ? req.body.certifications.filter((certification: unknown) => typeof certification === 'string') : [];
  const personnelCredentials = typeof req.body.personnel_credentials === 'string' ? req.body.personnel_credentials.trim() || null : null;
  const parsedTurnover = Number(req.body.turnover);
  const turnover = Number.isFinite(parsedTurnover) && parsedTurnover >= 0 ? parsedTurnover : 0;
  const role: UserRole = isConfiguredAdmin(email) ? 'admin' : 'owner';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT 1 FROM company_users WHERE email = $1', [email]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An account already exists for this email.' });
    }
    const profile = JSON.stringify({ companyName, email, entityType: 'Private Limited' });
    const companyResult = await client.query(`
      INSERT INTO companies (profile, sectors, certifications, turnover_year_1, personnel_credentials)
      VALUES ($1, $2::text[], $3::text[], $4, $5)
      RETURNING id
    `, [profile, sectors, certifications, turnover, personnelCredentials]);
    const companyId = companyResult.rows[0].id;
    const userResult = await client.query(`
      INSERT INTO company_users (company_id, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, company_id, role
    `, [companyId, email, await hashPassword(password), role]);
    await client.query('COMMIT');
    const user = userResult.rows[0];
    void scoreCompanyAgainstTenders(companyId).catch((error) => console.error('Initial match scoring failed:', error));
    return res.status(201).json({ token: createToken(user), companyId, role: user.role });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Signup failed:', error);
    return res.status(500).json({ error: 'Unable to create this account right now.' });
  } finally {
    client.release();
  }
});

app.get('/api/auth/invitations/:token', async (req, res) => {
  try {
    const invitation = await findOpenInvitation(req.params.token);
    if (!invitation) return res.status(404).json({ error: 'This invitation is invalid, expired, or has been revoked.' });
    const profile = typeof invitation.profile === 'string' ? JSON.parse(invitation.profile) : invitation.profile;
    return res.json({ email: invitation.email, role: invitation.role, companyName: profile?.companyName ?? 'TenderMatch company' });
  } catch (error) {
    console.error('Invitation lookup failed:', error);
    return res.status(500).json({ error: 'Unable to open this invitation right now.' });
  }
});

app.post('/api/auth/invitations/accept', async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 12) return res.status(400).json({ error: 'Use a password of at least 12 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (token.length < 32 || token.length > 200) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'This invitation is invalid, expired, or has been revoked.' });
    }
    const invitationResult = await client.query(`SELECT i.id, i.company_id, i.email, i.role
      FROM company_invitations i
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()
      FOR UPDATE`, [invitationTokenHash(token)]);
    const invitation = invitationResult.rows[0];
    if (!invitation) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'This invitation is invalid, expired, or has been revoked.' });
    }
    const existing = await client.query('SELECT 1 FROM company_users WHERE email = $1', [invitation.email]);
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This email already has a TenderMatch account.' });
    }
    const userResult = await client.query(`INSERT INTO company_users (company_id, email, password_hash, role)
      VALUES ($1, $2, $3, $4) RETURNING id, company_id, role`,
      [invitation.company_id, invitation.email, await hashPassword(password), invitation.role]);
    await client.query('UPDATE company_invitations SET accepted_at = NOW() WHERE id = $1', [invitation.id]);
    await client.query('COMMIT');
    const user = userResult.rows[0];
    return res.status(201).json({ token: createToken(user), companyId: user.company_id, role: user.role });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Invitation acceptance failed:', error);
    return res.status(500).json({ error: 'Unable to accept this invitation right now.' });
  } finally {
    client.release();
  }
});

app.get('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*, u.email, u.role FROM companies c
      JOIN company_users u ON u.company_id = c.id
      WHERE c.id = $1 AND u.id = $2
    `, [req.auth!.company_id, req.auth!.user_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Company not found.' });
    const company = rows[0];
    const profile = typeof company.profile === 'string' ? JSON.parse(company.profile) : company.profile;
    return res.json({
      ...profile,
      email: company.email,
      role: company.role,
      sectors: company.sectors ?? [],
      certifications: company.certifications ?? [],
      turnover: [company.turnover_year_1 ?? 0, company.turnover_year_2 ?? 0, company.turnover_year_3 ?? 0],
      personnel_credentials: company.personnel_credentials ?? '',
    });
  } catch (error) {
    console.error('Profile lookup failed:', error);
    return res.status(500).json({ error: 'Unable to load the company profile.' });
  }
});

app.put('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(`
      SELECT c.profile, u.email FROM companies c JOIN company_users u ON u.company_id = c.id
      WHERE c.id = $1 AND u.id = $2
    `, [req.auth!.company_id, req.auth!.user_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Company not found.' });
    const previousProfile = typeof rows[0].profile === 'string' ? JSON.parse(rows[0].profile) : rows[0].profile;
    const sectors = Array.isArray(req.body.sectors) ? req.body.sectors.filter((sector: unknown) => typeof sector === 'string') : [];
    const certifications = Array.isArray(req.body.certifications) ? req.body.certifications.filter((certification: unknown) => typeof certification === 'string') : [];
    const values = Array.isArray(req.body.turnover) ? req.body.turnover : [];
    const turnover = values.slice(0, 3).map((value: unknown) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
    });
    const profile = JSON.stringify({
      ...previousProfile,
      companyName: typeof req.body.companyName === 'string' ? req.body.companyName.trim() : previousProfile.companyName,
      email: rows[0].email,
      entityType: typeof req.body.entityType === 'string' ? req.body.entityType : previousProfile.entityType,
    });
    await query(`
      UPDATE companies
      SET profile = $1, sectors = $2::text[], certifications = $3::text[],
          turnover_year_1 = $4, turnover_year_2 = $5, turnover_year_3 = $6,
          personnel_credentials = $7, updated_at = NOW()
      WHERE id = $8
    `, [
      profile, sectors, certifications,
      turnover[0] ?? 0, turnover[1] ?? 0, turnover[2] ?? 0,
      typeof req.body.personnel_credentials === 'string' ? req.body.personnel_credentials.trim() || null : null,
      req.auth!.company_id,
    ]);
    void scoreCompanyAgainstTenders(req.auth!.company_id).catch((error) => console.error('Profile re-score failed:', error));
    return res.json({ success: true });
  } catch (error) {
    console.error('Profile update failed:', error);
    return res.status(500).json({ error: 'Unable to save the company profile.' });
  }
});

app.use('/api/tenders', tendersRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/company', companyRouter);

const frontendDirectory = process.env.FRONTEND_DIST_PATH ?? path.resolve(__dirname, '../public');
if (fs.existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (_req, res) => {
    res.sendFile(path.join(frontendDirectory, 'index.html'));
  });
}

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(port, () => {
  console.log(`TenderMatch backend listening on port ${port}`);
  const scheduledScrape = () => void runLiveScraper().catch((error) => console.error('Scheduled scraper failed:', error));
  setTimeout(scheduledScrape, 5000);
  setInterval(scheduledScrape, 10 * 60 * 1000);
});
