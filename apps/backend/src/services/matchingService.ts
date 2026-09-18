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

export async function scoreTenderAgainstCompanies(tenderId: string) {
  // Fetch tender
  const tenderRes = await query('SELECT * FROM tenders WHERE id = $1', [tenderId]);
  const tender = tenderRes.rows[0];

  if (!tender) {
    console.error(`Tender ${tenderId} not found`);
    return;
  }

  // Fetch all companies and their past projects
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
    let scoreCertifications = 0;
    let scoreSector = 0;
    let scoreFinancial = 0;
    let scoreGeography = 0;
    let scorePastProjects = 0;
    let scorePersonnel = 0;

    // 1. Certifications (20 pts)
    if (tender.certifications && tender.certifications.length > 0) {
      const companyCerts = (company.certifications || []).map((c: string) => c.toLowerCase());
      const matchedCerts = tender.certifications.filter((c: string) => companyCerts.includes(c.toLowerCase()));
      const certRatio = matchedCerts.length / tender.certifications.length;
      scoreCertifications = Math.round(certRatio * 20);
    } else {
      scoreCertifications = 20;
    }

    // 2. Sector Match (25 pts)
    if (tender.sector) {
      const companySectors = (company.sectors || []).map((s: string) => s.toLowerCase());
      if (companySectors.includes(tender.sector.toLowerCase())) {
        scoreSector = 25;
      } else {
        scoreSector = 0;
      }
    } else {
      scoreSector = 25;
    }

    // 3. Financial Capacity (20 pts)
    if (tender.value) {
      const turnovers = [company.turnover_year_1, company.turnover_year_2, company.turnover_year_3].filter(t => t != null);
      if (turnovers.length > 0) {
        const avgTurnover = turnovers.reduce((a, b) => Number(a) + Number(b), 0) / turnovers.length;
        if (avgTurnover >= tender.value) {
          scoreFinancial = 20;
        } else if (avgTurnover >= tender.value * 0.5) {
          scoreFinancial = 10;
        } else {
          scoreFinancial = 0;
        }
      } else {
        scoreFinancial = 0;
      }
    } else {
      scoreFinancial = 20;
    }

    // 4. Geography (10 pts)
    if (tender.state) {
      const companyStates = (company.states || []).map((s: string) => s.toLowerCase());
      if (companyStates.includes(tender.state.toLowerCase()) || companyStates.includes('all india')) {
        scoreGeography = 10;
      } else {
        scoreGeography = 0;
      }
    } else {
      scoreGeography = 10;
    }

    // 5. Past Projects (10 pts)
    const pastProjects = company.past_projects || [];
    const relevantProjects = tender.sector 
      ? pastProjects.filter((p: any) => p.sector && p.sector.toLowerCase() === tender.sector.toLowerCase())
      : pastProjects;
    
    if (relevantProjects.length >= 3) {
      scorePastProjects = 10;
    } else if (relevantProjects.length >= 1) {
      scorePastProjects = 7;
    }

    const personnelMatch = evaluatePersonnelMatch(tender.personnel_requirements, company.personnel_credentials);
    scorePersonnel = personnelMatch ? 15 : 0;
    let overallScore = scoreCertifications + scoreSector + scoreFinancial + scoreGeography + scorePastProjects + scorePersonnel;

    // Strict sector matching
    if (tender.sector && company.sectors && company.sectors.length > 0) {
      const companySectors = (company.sectors || []).map((s: string) => s.toLowerCase());
      if (!companySectors.includes(tender.sector.toLowerCase())) {
        overallScore = 0;
      }
    }

    // Strict Certifications Gate: Check but do not hard-disqualify to 0 to support partial matches visibility on dashboard
    if (tender.certifications && tender.certifications.length > 0) {
      const companyCerts = (company.certifications || []).map((c: string) => c.toLowerCase());
      const hasAllCerts = tender.certifications.every((c: string) => companyCerts.includes(c.toLowerCase()));
      if (!hasAllCerts) {
        // We let the natural score reflect the matching ratio (e.g., 60%) instead of zeroing out
        console.log(`Company ${company.id} has partial certification match for tender ${tender.title}`);
      }
    }

    if (!personnelMatch) {
      console.log(`Company ${company.id} does not meet the personnel requirement for tender ${tender.title}`);
    }

    // Save match
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
      tender.id, company.id, scoreCertifications, scoreSector, scoreFinancial, scoreGeography, scorePastProjects, scorePersonnel, personnelMatch, overallScore
    ]);

    // Send notification if overall score > 70
    if (overallScore >= 70 && company.profile) {
      let companyEmail = '';
      try {
        const profile = typeof company.profile === 'string' ? JSON.parse(company.profile) : company.profile;
        companyEmail = profile.email;
      } catch (e) {
        // Handle parse error
      }

      if (companyEmail) {
        await sendMatchNotification(companyEmail, company.id, tender.title, overallScore);
      }
    }
  }
}

export async function scoreCompanyAgainstTenders(companyId: string) {
  // Fetch company
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

  // Fetch all active tenders
  const tendersRes = await query('SELECT * FROM tenders');
  const tenders = tendersRes.rows;

  if (!tenders) {
    console.error('Error fetching tenders for matching');
    return;
  }

  for (const tender of tenders) {
    let scoreCertifications = 0;
    let scoreSector = 0;
    let scoreFinancial = 0;
    let scoreGeography = 0;
    let scorePastProjects = 0;
    let scorePersonnel = 0;

    // 1. Certifications (20 pts)
    if (tender.certifications && tender.certifications.length > 0) {
      const companyCerts = (company.certifications || []).map((c: string) => c.toLowerCase());
      const matchedCerts = tender.certifications.filter((c: string) => companyCerts.includes(c.toLowerCase()));
      const certRatio = matchedCerts.length / tender.certifications.length;
      scoreCertifications = Math.round(certRatio * 20);
    } else {
      scoreCertifications = 20;
    }

    // 2. Sector Match (25 pts)
    if (tender.sector) {
      const companySectors = (company.sectors || []).map((s: string) => s.toLowerCase());
      if (companySectors.includes(tender.sector.toLowerCase())) {
        scoreSector = 25;
      } else {
        scoreSector = 0;
      }
    } else {
      scoreSector = 25;
    }

    // 3. Financial Capacity (20 pts)
    if (tender.value) {
      const turnovers = [company.turnover_year_1, company.turnover_year_2, company.turnover_year_3].filter(t => t != null);
      if (turnovers.length > 0) {
        const avgTurnover = turnovers.reduce((a, b) => Number(a) + Number(b), 0) / turnovers.length;
        if (avgTurnover >= tender.value) {
          scoreFinancial = 20;
        } else if (avgTurnover >= tender.value * 0.5) {
          scoreFinancial = 10;
        } else {
          scoreFinancial = 0;
        }
      } else {
        scoreFinancial = 0;
      }
    } else {
      scoreFinancial = 20;
    }

    // 4. Geography (10 pts)
    if (tender.state) {
      const companyStates = (company.states || []).map((s: string) => s.toLowerCase());
      if (companyStates.includes(tender.state.toLowerCase()) || companyStates.includes('all india')) {
        scoreGeography = 10;
      } else {
        scoreGeography = 0;
      }
    } else {
      scoreGeography = 10;
    }

    // 5. Past Projects (10 pts)
    const pastProjects = company.past_projects || [];
    const relevantProjects = tender.sector 
      ? pastProjects.filter((p: any) => p.sector && p.sector.toLowerCase() === tender.sector.toLowerCase())
      : pastProjects;
    
    if (relevantProjects.length >= 3) {
      scorePastProjects = 10;
    } else if (relevantProjects.length >= 1) {
      scorePastProjects = 7;
    }

    const personnelMatch = evaluatePersonnelMatch(tender.personnel_requirements, company.personnel_credentials);
    scorePersonnel = personnelMatch ? 15 : 0;
    let overallScore = scoreCertifications + scoreSector + scoreFinancial + scoreGeography + scorePastProjects + scorePersonnel;

    // Strict sector matching
    if (tender.sector && company.sectors && company.sectors.length > 0) {
      const companySectors = (company.sectors || []).map((s: string) => s.toLowerCase());
      if (!companySectors.includes(tender.sector.toLowerCase())) {
        overallScore = 0;
      }
    }

    // Strict Certifications Gate: Check but do not hard-disqualify to 0 to support partial matches visibility on dashboard
    if (tender.certifications && tender.certifications.length > 0) {
      const companyCerts = (company.certifications || []).map((c: string) => c.toLowerCase());
      const hasAllCerts = tender.certifications.every((c: string) => companyCerts.includes(c.toLowerCase()));
      if (!hasAllCerts) {
        // Keep visible on dashboard with partial score
      }
    }

    // Save match
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
      tender.id, company.id, scoreCertifications, scoreSector, scoreFinancial, scoreGeography, scorePastProjects, scorePersonnel, personnelMatch, overallScore
    ]);
  }
}
