import { query } from '../utils/db';

export interface ExtractedTender {
  title: string | null;
  sector: string | null;
  value: number | null;
  deadline: string | null;
  eligibility: string | null;
  certifications: string[];
  personnel_requirements: string | null;
  confidence_score: number;
}

function matchesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(kw => {
    if (kw.includes(' ') || kw.includes('/') || kw.includes('-') || kw.includes('.')) {
      return text.includes(kw);
    }
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(text);
  });
}

export function parseLocalTenderData(rawText: string, _source: string): ExtractedTender {
  const lines = rawText.split('\n');
  
  // 1. Title Extraction
  let title: string | null = null;
  const descLine = lines.find(l => l.toLowerCase().startsWith('description:'));
  if (descLine) {
    title = descLine.replace(/description:/i, '').trim();
  } else {
    const titleLine = lines.find(l => l.toLowerCase().startsWith('title:'));
    if (titleLine) {
      title = titleLine.replace(/title:/i, '').trim();
    } else if (lines[0] && lines[0].toLowerCase().startsWith('title & id:')) {
      title = lines[0].replace(/title & id:/i, '').trim();
    } else {
      title = lines[0]?.trim() || null;
    }
  }

  if (title && title.length > 150) {
    title = title.substring(0, 147) + '...';
  }

  // Remove numerical indexes from description titles (e.g. "1", "2")
  if (title && /^\d+$/.test(title.trim())) {
    const nextLine = lines.find(l => l.trim().length > 3 && !l.includes('Ref/Type:'));
    if (nextLine) title = nextLine.trim();
  }

  // 2. Sector Classification based on keywords
  let sector: string | null = null;
  const textLower = rawText.toLowerCase();
  
  // High fidelity IT keywords (with whole word boundary matching)
  const itKeywords = [
    'computer', 'software', 'networking', 'server', 'it lab', 'database', 
    'cabling', 'ethernet', 'ups', 'fiber', 'lan', 'wi-fi', 'telecom', 
    'cctv', 'camera', 'display', 'printer', 'hardware', 
    'laptop', 'desktop', 'cloud', 'module', 'sensor', 'laser', 'digital', 
    'electronic', 'fcu', 'it system', 'computer system', 'software system',
    'portal system', 'portal software'
  ];
  
  // High fidelity Defence keywords (with whole word boundary matching)
  const defenceKeywords = [
    'defence', 'defense', 'military', 'radar', 'weapon', 'soldier', 
    'army', 'navy', 'air force', 'mes', 'cvrde', 'leh', 'ladakh', 
    'scouts', 'ordnance', 'drdo', 'border', 'security', 'patrol', 
    'rifles', 'ammunition', 'combat', 'aerospace', 'naval', 'police', 'forces'
  ];
  
  // High fidelity Transport keywords (with whole word boundary matching)
  const transportKeywords = [
    'transit', 'bus', 'road', 'highway', 'traffic', 'transport', 'metro',
    'railway', 'rail', 'track', 'coach', 'signal', 'signalling', 
    'cables/gears', 'toll', 'rfid', 'passenger', 'airport', 'flight', 
    'airlines', 'cargo', 'shipping', 'vessel', 'port', 'dock', 'ferry', 
    'transportation', 'logistics'
  ];

  // High fidelity Healthcare keywords (with whole word boundary matching)
  const healthcareKeywords = [
    'medical', 'health', 'hospital', 'doctor', 'nurse', 'surgical', 
    'diagnostic', 'sensory', 'sensory training', 'sensory kit', 
    'operation theatre', 'pathology', 'nephrology', 'pediatric', 
    'incubator', 'dialysis', 'cardiac', 'sensory blocks', 'therapy', 
    'clinical', 'medicine', 'pharmacy', 'patient'
  ];

  if (matchesKeyword(textLower, defenceKeywords)) {
    sector = 'Defence';
  } else if (matchesKeyword(textLower, transportKeywords)) {
    sector = 'Transport';
  } else if (matchesKeyword(textLower, itKeywords)) {
    sector = 'IT';
  } else if (matchesKeyword(textLower, healthcareKeywords)) {
    sector = 'Healthcare';
  } else if (textLower.includes('school') || textLower.includes('college') || textLower.includes('degree') || textLower.includes('education') || textLower.includes('academic')) {
    sector = 'Education';
  } else if (textLower.includes('construction') || textLower.includes('building') || textLower.includes('civil work') || textLower.includes('barrack')) {
    sector = 'Construction';
  } else if (textLower.includes('housekeeping') || textLower.includes('pantry') || textLower.includes('amc') || textLower.includes('maintenance')) {
    sector = 'Services';
  }

  // 3. Certifications Extraction
  const certifications: string[] = [];
  if (textLower.includes('iso 9001')) certifications.push('ISO 9001');
  if (textLower.includes('iso 27001')) certifications.push('ISO 27001');
  if (textLower.includes('iso 14001')) certifications.push('ISO 14001');
  if (textLower.includes('msme')) certifications.push('MSME');
  if (textLower.includes('arai')) certifications.push('ARAI Approved');
  if (textLower.includes('ce certified') || textLower.includes('ce certification') || textLower.includes('ce mark')) certifications.push('CE Certified');
  if (textLower.includes('fda')) certifications.push('FDA Approved');
  if (textLower.includes('gmp') || textLower.includes('who-gmp')) certifications.push('WHO-GMP Certified');
  
  // 4. Value Estimation
  let value: number | null = null;
  const valueMatch = rawText.match(/(?:inr|rs\.?|value:?)\s*([\d,]+)/i);
  if (valueMatch) {
    const rawVal = valueMatch[1].replace(/,/g, '');
    const parsedValue = parseInt(rawVal, 10);
    value = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }

  // 5. Deadline Parsing
  let deadline: string | null = null;
  const dateMatches = rawText.match(/\b\d{2}-\d{2}-\d{4}\b/g);
  if (dateMatches && dateMatches.length > 0) {
    const lastDateStr = dateMatches[dateMatches.length - 1];
    const parts = lastDateStr.split('-');
    const parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T17:00:00Z`);
    if (!isNaN(parsedDate.getTime())) {
      deadline = parsedDate.toISOString();
    }
  }

  // 6. Personnel Requirements
  let personnel_requirements: string | null = null;
  const expMatch = rawText.match(/([^.\n]*\b(?:\d+\+?\s*years?|experience|qualification|degree|b\.tech|engineer)\b[^.\n]*)/i);
  if (expMatch) {
    personnel_requirements = expMatch[1].trim();
  }

  const confidence_score = (title ? 30 : 0) + (sector ? 20 : 0) + (value !== null ? 20 : 0) + (deadline ? 30 : 0);

  return {
    title,
    sector,
    value,
    deadline,
    eligibility: null,
    certifications,
    personnel_requirements,
    confidence_score,
  };
}

export async function extractTenderData(
  rawText: string,
  source: string,
  sourceStatus: 'live_scraped' | 'needs_review' = 'needs_review',
): Promise<any> {
  try {
    const parsedData = parseLocalTenderData(rawText, source);

    // Check for missing required fields
    const missingFields: string[] = [];
    if (!parsedData.title) missingFields.push('title');
    if (!parsedData.sector) missingFields.push('sector');
    if (!parsedData.deadline) missingFields.push('deadline');

    if (missingFields.length > 0 || parsedData.confidence_score < 70) {
      await query(
        `INSERT INTO review_queue (tender_raw_text, missing_fields, status, confidence_score, review_reason, source, parsed_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [rawText, missingFields, 'pending', parsedData.confidence_score,
          `Missing fields: ${missingFields.join(', ') || 'none'}; confidence: ${parsedData.confidence_score}`,
          source, JSON.stringify(parsedData)]
      );
      
      await query(
        `INSERT INTO ingestion_logs (source, status, error_message) VALUES ($1, $2, $3)`,
        [source, 'failure', `Missing fields: ${missingFields.join(', ')} or low confidence (${parsedData.confidence_score})`]
      );

      return { success: false, message: 'Sent to review queue due to missing fields or low confidence.' };
    }

    // This point is only reached when title, sector and deadline are present.
    const title = parsedData.title;
    if (!title) throw new Error('A title is required before saving a tender.');
    const cleanTitleText = title
      .replace(/^title\s*&\s*id:\s*/i, '')
      .split('[')[0]
      .trim();

    const existingCheck = await query(
      `SELECT * FROM tenders WHERE LOWER(title) = LOWER($1) OR LOWER(title) = LOWER($2) OR LOWER(title) LIKE $3 OR raw_text = $4`,
      [title, cleanTitleText, `%${cleanTitleText.substring(0, 50)}%`, rawText]
    );

    if (existingCheck.rows.length > 0) {
      console.log(`[Ingestion] Skipping duplicate tender insertion: "${title.substring(0, 50)}..."`);
      return { success: true, tender: existingCheck.rows[0], duplicate: true };
    }

    const insertTenderQuery = `
      INSERT INTO tenders (title, source, sector, value, deadline, eligibility, certifications, personnel_requirements, raw_text, confidence_score, url, source_status, needs_manual_review)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, FALSE)
      RETURNING *
    `;
    const tenderRes = await query(insertTenderQuery, [
      title,
      source,
      parsedData.sector,
      parsedData.value,
      parsedData.deadline,
      parsedData.eligibility,
      parsedData.certifications,
      parsedData.personnel_requirements || null,
      rawText,
      parsedData.confidence_score,
      sourceStatus,
    ]);
    
    const tender = tenderRes.rows[0];

    // Log success
    await query(`INSERT INTO ingestion_logs (source, status) VALUES ($1, $2)`, [source, 'success']);

    return { success: true, tender };
  } catch (error: any) {
    console.error('Extraction error:', error);
    await query(`INSERT INTO ingestion_logs (source, status, error_message) VALUES ($1, $2, $3)`, [source, 'failure', error.message]);
    return { success: false, error: error.message };
  }
}
