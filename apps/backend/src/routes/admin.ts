import { Router } from 'express';
import { query } from '../utils/db';
import { requireAdmin } from '../middleware/auth';
import { scoreTenderAgainstCompanies } from '../services/matchingService';

const router = Router();

router.use(requireAdmin);

// GET /api/admin/review-queue - List pending reviews
router.get('/review-queue', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM review_queue 
      WHERE status = 'pending' 
      ORDER BY created_at ASC
    `);
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PATCH /api/admin/review-queue/:id - Resolve or reject a review item
router.patch('/review-queue/:id', async (req, res) => {
  const { status, resolved_tender_data } = req.body;
  const id = req.params.id;

  if (!['resolved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // If resolved, we should insert the tender using the resolved data
    if (status === 'resolved' && resolved_tender_data) {
      const reviewItemRes = await query(`SELECT tender_raw_text FROM review_queue WHERE id = $1`, [id]);
      const reviewItem = reviewItemRes.rows[0];

      if (!reviewItem) {
        return res.status(404).json({ error: 'Review item not found' });
      }

      // Insert to tenders
      const insertTenderQuery = `
        INSERT INTO tenders (title, source, sector, value, deadline, eligibility, certifications, raw_text, confidence_score, source_status, needs_manual_review)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'verified', FALSE)
        RETURNING id
      `;
      const confidence = Number.isInteger(resolved_tender_data.confidence_score)
        ? resolved_tender_data.confidence_score
        : null;
      const insertedTender = await query(insertTenderQuery, [
        resolved_tender_data.title,
        resolved_tender_data.source || 'review_queue',
        resolved_tender_data.sector,
        resolved_tender_data.value,
        resolved_tender_data.deadline,
        resolved_tender_data.eligibility,
        resolved_tender_data.certifications,
        reviewItem.tender_raw_text,
        confidence
      ]);
      await scoreTenderAgainstCompanies(insertedTender.rows[0].id);
    }

    // Update review queue status
    const updateRes = await query(`
      UPDATE review_queue 
      SET status = $1 
      WHERE id = $2 
      RETURNING *
    `, [status, id]);

    return res.json(updateRes.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/stats - Basic dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [tendersRes, companiesRes, matchesRes, reviewsRes] = await Promise.all([
      query(`SELECT count(*) as count FROM tenders`),
      query(`SELECT count(*) as count FROM companies`),
      query(`SELECT count(*) as count FROM matches`),
      query(`SELECT count(*) as count FROM review_queue WHERE status = 'pending'`)
    ]);

    return res.json({
      tenders: parseInt(tendersRes.rows[0].count) || 0,
      companies: parseInt(companiesRes.rows[0].count) || 0,
      matches: parseInt(matchesRes.rows[0].count) || 0,
      pending_reviews: parseInt(reviewsRes.rows[0].count) || 0
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/sources', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT COALESCE(source, 'Unavailable') AS source, COUNT(*)::int AS count,
        BOOL_OR(needs_manual_review) AS has_unreviewed
      FROM tenders GROUP BY COALESCE(source, 'Unavailable') ORDER BY count DESC
    `);
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
