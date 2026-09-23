import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { query } from '../utils/db';
import { extractTenderData } from '../services/extractionService';
import { scoreTenderAgainstCompanies } from '../services/matchingService';
import { runLiveScraper } from '../services/scraperService';
import { AuthenticatedRequest, requireAdmin, requireAuth } from '../middleware/auth';
import { verifyAccessToken } from '../services/tokenService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const isPdf = file.mimetype === 'application/pdf' && file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) return callback(new Error('Only PDF files are accepted.'));
    return callback(null, true);
  },
});
const syncLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 1,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'A sync can be requested once every 10 minutes.' },
});

type TenderAnswer = {
  answer_available: boolean;
  answer_kind: 'record_field' | 'source_excerpt' | 'unavailable';
  answer: string;
  citations: Array<{ label: string; text: string }>;
  needs_manual_review: boolean;
};

function findSourceExcerpts(rawText: string, question: string): string[] {
  const terms = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (!terms.length) return [];
  return rawText
    .split(/(?<=[.!?\n])\s+/)
    .map((line: string) => line.trim())
    .filter(Boolean)
    .filter((line: string) => terms.some((term: string) => line.toLowerCase().includes(term)))
    .slice(0, 5);
}

function makeTenderAnswer(question: string, tender: Record<string, any>): TenderAnswer {
  const normalized = question.toLowerCase();
  const needsManualReview = tender.source_status !== 'verified';
  const fieldAnswer = (label: string, value: string | number | null | undefined): TenderAnswer | null => {
    if (value === null || value === undefined || value === '') return null;
    return {
      answer_available: true,
      answer_kind: 'record_field',
      answer: `The current tender record lists ${label}: ${String(value)}.`,
      citations: [{ label: 'Extracted tender record', text: `${label}: ${String(value)}` }],
      needs_manual_review: needsManualReview,
    };
  };

  if (/deadline|closing|due date|last date|submission date/.test(normalized)) {
    const deadline = tender.deadline ? new Date(tender.deadline) : null;
    return fieldAnswer('deadline', deadline && !Number.isNaN(deadline.getTime()) ? deadline.toISOString() : null)
      ?? unavailableAnswer(needsManualReview, 'The deadline is not available in the current tender record.');
  }
  if (/emd|earnest money|bid security/.test(normalized)) {
    return fieldAnswer('EMD amount', tender.emd_amount)
      ?? unavailableAnswer(needsManualReview, 'The EMD amount is not available in the current tender record.');
  }
  if (/turnover|revenue|financial/.test(normalized)) {
    return fieldAnswer('minimum turnover', tender.minimum_turnover)
      ?? unavailableAnswer(needsManualReview, 'A minimum turnover requirement is not available in the current tender record.');
  }
  if (/certif|iso|qualification|eligib|requirement/.test(normalized)) {
    const certificationText = Array.isArray(tender.certifications) && tender.certifications.length
      ? tender.certifications.join(', ')
      : null;
    return fieldAnswer('certification requirements', certificationText)
      ?? fieldAnswer('eligibility', tender.eligibility)
      ?? unavailableAnswer(needsManualReview, 'Eligibility and certification requirements are not available in the current tender record.');
  }
  if (/personnel|staff|team|experience|engineer/.test(normalized)) {
    return fieldAnswer('personnel requirements', tender.personnel_requirements)
      ?? fieldAnswer('minimum years in business', tender.minimum_years_in_business)
      ?? unavailableAnswer(needsManualReview, 'Personnel requirements are not available in the current tender record.');
  }
  if (/location|state|where|delivery/.test(normalized)) {
    return fieldAnswer('delivery state', tender.state)
      ?? unavailableAnswer(needsManualReview, 'The delivery location is not available in the current tender record.');
  }

  const excerpts = findSourceExcerpts(typeof tender.raw_text === 'string' ? tender.raw_text : '', question);
  if (excerpts.length) {
    return {
      answer_available: true,
      answer_kind: 'source_excerpt',
      answer: 'I found relevant wording in the extracted tender text. Review the cited passages for the authoritative answer.',
      citations: excerpts.map((text) => ({ label: 'Extracted tender text', text })),
      needs_manual_review: needsManualReview,
    };
  }
  return unavailableAnswer(needsManualReview, 'No direct answer was found in the available tender record or extracted text.');
}

function unavailableAnswer(needsManualReview: boolean, answer: string): TenderAnswer {
  return { answer_available: false, answer_kind: 'unavailable', answer, citations: [], needs_manual_review: needsManualReview };
}

// POST /api/tenders/sync - Dynamically fetch and scrape GeM CPPP live from internet
router.post('/sync', requireAuth, syncLimiter, async (_req, res) => {
  try {
    const result = await runLiveScraper();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/gap-report', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [tenderResult, companyResult] = await Promise.all([
      query('SELECT certifications, minimum_turnover, personnel_requirements FROM tenders WHERE id = $1', [req.params.id]),
      query('SELECT certifications, turnover_year_1, turnover_year_2, turnover_year_3, gem_registered, personnel_credentials FROM companies WHERE id = $1', [req.auth!.company_id]),
    ]);
    const tender = tenderResult.rows[0];
    const company = companyResult.rows[0];
    if (!tender) return res.status(404).json({ error: 'Tender not found.' });
    if (!company) return res.status(404).json({ error: 'Company profile not found.' });

    const gaps: Array<{ type: string; requirement: string; status: 'missing' | 'unavailable' }> = [];
    if (Array.isArray(tender.certifications)) {
      const documented = Array.isArray(company.certifications) ? company.certifications.map((v: string) => v.toLowerCase()) : [];
      for (const certification of tender.certifications) {
        if (!documented.includes(String(certification).toLowerCase())) {
          gaps.push({ type: 'certification', requirement: String(certification), status: 'missing' });
        }
      }
    } else {
      gaps.push({ type: 'certification', requirement: 'Certification requirements are unavailable.', status: 'unavailable' });
    }
    if (tender.minimum_turnover === null || tender.minimum_turnover === undefined) {
      gaps.push({ type: 'turnover', requirement: 'Minimum turnover is unavailable in the tender record.', status: 'unavailable' });
    } else {
      const documented = [company.turnover_year_1, company.turnover_year_2, company.turnover_year_3]
        .map(Number).filter(Number.isFinite);
      if (!documented.length) gaps.push({ type: 'turnover', requirement: 'Add verified turnover figures to compare this requirement.', status: 'unavailable' });
      else if (Math.max(...documented) < Number(tender.minimum_turnover)) gaps.push({ type: 'turnover', requirement: `Documented turnover is below the tender minimum of ${tender.minimum_turnover}.`, status: 'missing' });
    }
    if (tender.personnel_requirements && !company.personnel_credentials) {
      gaps.push({ type: 'personnel', requirement: 'Add personnel credentials so this requirement can be checked.', status: 'unavailable' });
    }
    return res.json({ evidence_based: true, gaps });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Free, deterministic tender question helper: it returns only source excerpts,
// never an invented answer or a model-generated interpretation.
router.get('/:id/questions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await query(
      `SELECT id, question, response, created_at FROM tender_questions
       WHERE tender_id = $1 AND company_id = $2 ORDER BY created_at ASC`,
      [req.params.id, req.auth!.company_id],
    );
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

router.post('/:id/ask', requireAuth, async (req: AuthenticatedRequest, res) => {
  const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
  if (question.length < 3 || question.length > 500) return res.status(400).json({ error: 'Ask a question between 3 and 500 characters.' });
  try {
    const { rows } = await query(`SELECT raw_text, deadline, emd_amount, minimum_turnover,
      minimum_years_in_business, certifications, eligibility, personnel_requirements, state, source_status
      FROM tenders WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Tender not found.' });
    const response = makeTenderAnswer(question, rows[0]);
    const saved = await query(`INSERT INTO tender_questions (company_id, tender_id, user_id, question, response)
      VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, question, response, created_at`,
      [req.auth!.company_id, req.params.id, req.auth!.user_id, question, JSON.stringify(response)]);
    return res.status(201).json(saved.rows[0]);
  } catch (error: any) { return res.status(500).json({ error: error.message }); }
});

// GET /api/tenders/:id - Get single tender with match details
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    let companyId = null;
    
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        companyId = verifyAccessToken(token).company_id;
      } catch (e) {}
    }

    let queryText = 'SELECT * FROM tenders WHERE id = $1';
    let params = [id];

    if (companyId) {
      queryText = `
        SELECT t.*, m.overall_score as match_score, m.score_certifications, m.score_sector, m.score_financial, m.score_geography, m.score_past_projects, m.score_personnel
        FROM tenders t
        LEFT JOIN matches m ON t.id = m.tender_id AND m.company_id = $2
        WHERE t.id = $1
      `;
      params = [id, companyId];
    }

    const { rows } = await query(queryText, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Tender not found' });
    return res.json(rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/tenders - Upload raw text directly
router.post('/', requireAdmin, async (req, res) => {
  const { raw_text, source } = req.body;
  
  if (!raw_text) {
    return res.status(400).json({ error: 'raw_text is required' });
  }

  const result = await extractTenderData(raw_text, source || 'manual_entry');
  
  if (result.success && result.tender) {
    // Trigger matching asynchronously
    scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
    return res.status(201).json(result);
  } else {
    return res.status(422).json(result);
  }
});

// POST /api/tenders/upload - Upload PDF, extract, save or queue for review
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'PDF file is required' });
  }
  if (req.file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return res.status(415).json({ error: 'The uploaded file is not a valid PDF.' });
  }

  try {
    const pdfParse = require('pdf-parse');
    const pdfData = await pdfParse(req.file.buffer);
    const rawText = pdfData.text;

    const source = req.file.originalname;
    const result = await extractTenderData(rawText, source);

    if (result.success && result.tender) {
      // Trigger matching asynchronously
      scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
      return res.status(201).json({ message: 'Tender processed successfully', data: result.tender });
    } else {
      return res.status(422).json(result);
    }
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    return res.status(500).json({ error: 'Failed to process PDF file' });
  }
});

// POST /api/tenders/ingest
router.post('/ingest', requireAdmin, async (req, res) => {
  const { tenders } = req.body;
  if (!tenders || !Array.isArray(tenders)) return res.status(400).json({ error: 'tenders array required' });

  try {
    for (const t of tenders) {
      const { rows: tenderRows } = await query(`
        INSERT INTO tenders (title, source, sector, value, deadline, eligibility, certifications, raw_text, confidence_score, url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [t.title, t.source, t.sector, t.value, t.deadline, t.eligibility, t.certifications, t.raw_text, t.confidence_score, t.url || null]);

      const tenderId = tenderRows[0].id;
      
      // Match against all companies
      await scoreTenderAgainstCompanies(tenderId);
    }
    return res.json({ success: true, count: tenders.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.use((error: any, _req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'PDF uploads must be 10 MB or smaller.' });
  }
  if (error?.message === 'Only PDF files are accepted.') {
    return res.status(415).json({ error: error.message });
  }
  return next(error);
});

export default router;
