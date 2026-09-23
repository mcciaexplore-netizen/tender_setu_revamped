import { query } from '../utils/db';
import { sendMatchNotification } from './notificationService';

// Smart local evaluator for personnel/experience requirements matching
export function evaluatePersonnelMatch(tenderReq: string | null, companyCred: string | null): boolean {
  if (!tenderReq || tenderReq.trim().length === 0) return true; // No requirement = match
  if (!companyCred || companyCred.trim().length === 0) return false; // Requirement exists but company has none = no match

  const reqLower = tenderReq.toLowerCase();
  const credLower = companyCred.toLowerCase();

  // Extract years of experience requirement (e.g., "5 years", "10 years", "3 years")
  const yearRegex = /(\d+)\s*year/i;
  const reqYearMatch = reqLower.match(yearRegex);
  if (reqYearMatch) {
    const requiredYears = parseInt(reqYearMatch[1], 10);
    // Find the maximum years of experience mentioned in the company credentials
    const credYearMatches = credLower.matchAll(/(\d+)\s*year/gi);
    let maxCompanyYears = 0;
    for (const match of credYearMatches) {
      const yrs = parseInt(match[1], 10);
      if (yrs > maxCompanyYears) maxCompanyYears = yrs;
    }

    // Also support numbers alone in credentials if they represent high experience
    if (maxCompanyYears === 0) {
      const numberMatches = credLower.match(/\b(\d{1,2})\b/g);
      if (numberMatches) {
        maxCompanyYears = Math.max(...numberMatches.map(n => parseInt(n, 10)));
      }
    }

    if (maxCompanyYears < requiredYears) {
      console.log(`Personnel mismatch: requires ${requiredYears} years, company has ${maxCompanyYears} years.`);
      return false;
    }
  }

  // Check degrees/qualifications (B.Tech, MBBS, MBA, PhD, etc.)
  const degrees = ['b.tech', 'm.tech', 'btech', 'mtech', 'mbbs', 'mba', 'mca', 'phd', 'b.sc', 'm.sc', 'md', 'b.e', 'diploma'];
  for (const deg of degrees) {
    if (reqLower.includes(deg) && !credLower.includes(deg)) {
      console.log(`Personnel mismatch: requires qualification "${deg}", company lacks it.`);
      return false;
    }
  }

  // Check key roles/keywords if explicitly specified (e.g. manager, engineer, doctor, nurse)
  const roles = ['manager', 'engineer', 'doctor', 'nurse', 'architect', 'developer', 'technician', 'specialist'];
  for (const role of roles) {
    if (reqLower.includes(role) && !credLower.includes(role)) {
      console.log(`Personnel mismatch: requires role "${role}", company lacks it.`);
      return false;
    }
  }

  return true;
}

interface ScoreBreakdown {
  scoreCertifications: number;
  scoreSector: number;
  scoreFinancial: number;
  scoreGeography: number;
  scorePastProjects: number;
  scorePersonnel: number;
  personnelMatch: boolean;
  overallScore: number;
}

// Honest scoring: a category only contributes to the score when the tender
// actually specifies a requirement for it. Missing/unparsed tender fields are
// excluded from both the numerator and denominator instead of being granted
// full credit, so the percentage reflects what was genuinely checked rather
// than being inflated by data we simply couldn't extract.
function computeMatchScore(tender: any, company: any): ScoreBreakdown {
  let achieved = 0;
  let applicableWeight = 0;

  let scoreCertifications = 0;
  if (tender.certifications && tender.certifications.length > 0) {
    const companyCerts = (company.certifications || []).map((c: string) => c.toLowerCase());
    const matchedCerts = tender.certifications.filter((c: string) => companyCerts.includes(c.toLowerCase()));
    scoreCertifications = Math.round((matchedCerts.length / tender.certifications.length) * 20);
    applicableWeight += 20;
    achieved += scoreCertifications;
  }

  let scoreSector = 0;
  if (tender.sector) {
    const companySectors = (company.sectors || []).map((s: string) => s.toLowerCase());
    scoreSector = companySectors.includes(tender.sector.toLowerCase()) ? 25 : 0;
    applicableWeight += 25;
    achieved += scoreSector;
  }

  let scoreFinancial = 0;
  if (tender.value) {
    const turnovers = [company.turnover_year_1, company.turnover_year_2, company.turnover_year_3].filter((t) => t != null);
    if (turnovers.length > 0) {
      const avgTurnover = turnovers.reduce((a, b) => Number(a) + Number(b), 0) / turnovers.length;
      if (avgTurnover >= tender.value) scoreFinancial = 20;
      else if (avgTurnover >= tender.value * 0.5) scoreFinancial = 10;
    }
    applicableWeight += 20;
    achieved += scoreFinancial;
  }

  let scoreGeography = 0;
  if (tender.state) {
    const companyStates = (company.states || []).map((s: string) => s.toLowerCase());
    scoreGeography = companyStates.includes(tender.state.toLowerCase()) || companyStates.includes('all india') ? 10 : 0;
    applicableWeight += 10;
    achieved += scoreGeography;
  }

  // Past projects reflect the company's own track record, not a tender field,
  // so this category is always applicable.
  const pastProjects = company.past_projects || [];
  const relevantProjects = tender.sector
    ? pastProjects.filter((p: any) => p.sector && p.sector.toLowerCase() === tender.sector.toLowerCase())
    : pastProjects;
  let scorePastProjects = 0;
  if (relevantProjects.length >= 3) scorePastProjects = 10;
  else if (relevantProjects.length >= 1) scorePastProjects = 7;
  applicableWeight += 10;
  achieved += scorePastProjects;

  let scorePersonnel = 0;
  const personnelMatch = evaluatePersonnelMatch(tender.personnel_requirements, company.personnel_credentials);
  if (tender.personnel_requirements && tender.personnel_requirements.trim().length > 0) {
    scorePersonnel = personnelMatch ? 15 : 0;
    applicableWeight += 15;
    achieved += scorePersonnel;
  }

  let overallScore = applicableWeight > 0 ? Math.round((achieved / applicableWeight) * 100) : 0;

  // Strict sector gate: if the tender names a sector and the company doesn't
  // operate in it, this is not a real candidate regardless of other scores.
  if (tender.sector && company.sectors && company.sectors.length > 0) {
    const companySectors = (company.sectors || []).map((s: string) => s.toLowerCase());
    if (!companySectors.includes(tender.sector.toLowerCase())) {
      overallScore = 0;
    }
  }

  return { scoreCertifications, scoreSector, scoreFinancial, scoreGeography, scorePastProjects, scorePersonnel, personnelMatch, overallScore };
}

async function saveMatch(tenderId: string, companyId: string, s: ScoreBreakdown) {
  await query(`
    INSERT INTO matches (tender_id, company_id, score_certifications, score_sector, score_financial, score_geography, score_past_projects, score_personnel, personnel_match, overall_score)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (tender_id, company_id) DO UPDATE SET
      score_certifications = EXCLUDED.score_certifications,
      score_sector = EXCLUDED.score_sector,
      score_financial = EXCLUDED.score_financial,
      score_geography = EXCLUDED.score_geography,
      score_past_projects = EXCLUDED.score_past_projects,
      score_personnel = EXCLUDED.score_personnel,
      personnel_match = EXCLUDED.personnel_match,
      overall_score = EXCLUDED.overall_score
  `, [
    tenderId, companyId, s.scoreCertifications, s.scoreSector, s.scoreFinancial,
    s.scoreGeography, s.scorePastProjects, s.scorePersonnel, s.personnelMatch, s.overallScore,
  ]);
}

export async function scoreTenderAgainstCompanies(tenderId: string) {
  const tenderRes = await query('SELECT * FROM tenders WHERE id = $1', [tenderId]);
  const tender = tenderRes.rows[0];
  if (!tender) {
    console.error(`Tender ${tenderId} not found`);
    return;
  }

  const companiesRes = await query(`
    SELECT c.*,
      COALESCE((SELECT json_agg(p.*) FROM past_projects p WHERE p.company_id = c.id), '[]'::json) as past_projects
    FROM companies c
  `);
  const companies = companiesRes.rows;
  if (!companies) {
    console.error('Error fetching companies for matching');
    return;
  }

  for (const company of companies) {
    const s = computeMatchScore(tender, company);
    await saveMatch(tender.id, company.id, s);

    if (s.overallScore >= 70 && company.profile) {
      let companyEmail = '';
      try {
        const profile = typeof company.profile === 'string' ? JSON.parse(company.profile) : company.profile;
        companyEmail = profile.email;
      } catch {
        // Skip notification if the stored profile isn't valid JSON.
      }
      if (companyEmail) {
        await sendMatchNotification(companyEmail, company.id, tender.title, s.overallScore);
      }
    }
  }
}

export async function scoreCompanyAgainstTenders(companyId: string) {
  const companyRes = await query(`
    SELECT c.*,
      COALESCE((SELECT json_agg(p.*) FROM past_projects p WHERE p.company_id = c.id), '[]'::json) as past_projects
    FROM companies c WHERE c.id = $1
  `, [companyId]);
  const company = companyRes.rows[0];
  if (!company) {
    console.error(`Company ${companyId} not found`);
    return;
  }

  const tendersRes = await query('SELECT * FROM tenders');
  const tenders = tendersRes.rows;
  if (!tenders) {
    console.error('Error fetching tenders for matching');
    return;
  }

  for (const tender of tenders) {
    const s = computeMatchScore(tender, company);
    await saveMatch(tender.id, company.id, s);
  }
}
