import { callGemini, stripJsonFences } from './geminiService';

export interface TenderOnePagerData {
  procurement_specifications: {
    scope_of_work: string;
    key_deliverables: string[];
    technical_requirements: string;
  };
  eligibility_criteria: {
    minimum_turnover: string;
    experience_years: number | null;
    required_certifications: string[];
    emd_amount_and_mode: string;
  };
  payment_terms: {
    payment_schedule: string;
    milestones: string[];
    retention_money_percentage: string;
    expected_payment_timeline: string;
  };
  key_highlights: string[];
  analyzed_at: string;
}

const NOT_AVAILABLE = 'Not available in the tender record.';

export function fallbackOnePager(): TenderOnePagerData {
  return {
    procurement_specifications: {
      scope_of_work: NOT_AVAILABLE,
      key_deliverables: [],
      technical_requirements: NOT_AVAILABLE,
    },
    eligibility_criteria: {
      minimum_turnover: NOT_AVAILABLE,
      experience_years: null,
      required_certifications: [],
      emd_amount_and_mode: NOT_AVAILABLE,
    },
    payment_terms: {
      payment_schedule: NOT_AVAILABLE,
      milestones: [],
      retention_money_percentage: NOT_AVAILABLE,
      expected_payment_timeline: NOT_AVAILABLE,
    },
    key_highlights: [],
    analyzed_at: new Date().toISOString(),
  };
}

const ONE_PAGER_PROMPT = `You are an expert analyst of Indian government tenders. Read the raw tender text below and produce a concise executive 1-page summary for a bidder deciding whether to pursue it.

Return ONLY a single valid JSON object, with no markdown fences and no explanation, matching EXACTLY this shape:
{
  "procurement_specifications": {
    "scope_of_work": "string - a short paragraph summarizing what work/goods/services are being procured",
    "key_deliverables": ["string", "..."],
    "technical_requirements": "string - key technical specifications or standards required"
  },
  "eligibility_criteria": {
    "minimum_turnover": "string - the minimum annual turnover requirement, with amount and unit",
    "experience_years": number or null,
    "required_certifications": ["string", "..."],
    "emd_amount_and_mode": "string - the EMD amount and how it must be submitted"
  },
  "payment_terms": {
    "payment_schedule": "string - how and when payment is released",
    "milestones": ["string", "..."],
    "retention_money_percentage": "string - retention/security deposit percentage, if any",
    "expected_payment_timeline": "string - typical time from invoice/delivery to payment"
  },
  "key_highlights": ["string - 3 to 5 of the single most important facts a bidder must know"]
}

Rules:
- If a field cannot be found in the text, use the exact string "Not available in the tender record." for string fields, an empty array for list fields, and null for experience_years.
- Do not invent numbers, dates, or requirements that are not present in the text.

Raw tender text:
`;

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function coerceOnePager(parsed: any): TenderOnePagerData {
  const fallback = fallbackOnePager();
  return {
    procurement_specifications: {
      scope_of_work: stringOr(parsed?.procurement_specifications?.scope_of_work, fallback.procurement_specifications.scope_of_work),
      key_deliverables: stringArray(parsed?.procurement_specifications?.key_deliverables),
      technical_requirements: stringOr(parsed?.procurement_specifications?.technical_requirements, fallback.procurement_specifications.technical_requirements),
    },
    eligibility_criteria: {
      minimum_turnover: stringOr(parsed?.eligibility_criteria?.minimum_turnover, fallback.eligibility_criteria.minimum_turnover),
      experience_years: typeof parsed?.eligibility_criteria?.experience_years === 'number' ? parsed.eligibility_criteria.experience_years : null,
      required_certifications: stringArray(parsed?.eligibility_criteria?.required_certifications),
      emd_amount_and_mode: stringOr(parsed?.eligibility_criteria?.emd_amount_and_mode, fallback.eligibility_criteria.emd_amount_and_mode),
    },
    payment_terms: {
      payment_schedule: stringOr(parsed?.payment_terms?.payment_schedule, fallback.payment_terms.payment_schedule),
      milestones: stringArray(parsed?.payment_terms?.milestones),
      retention_money_percentage: stringOr(parsed?.payment_terms?.retention_money_percentage, fallback.payment_terms.retention_money_percentage),
      expected_payment_timeline: stringOr(parsed?.payment_terms?.expected_payment_timeline, fallback.payment_terms.expected_payment_timeline),
    },
    key_highlights: stringArray(parsed?.key_highlights),
    analyzed_at: new Date().toISOString(),
  };
}

// Throws on failure (missing API key, rate limit, malformed response) so the
// caller decides whether to serve a fallback without poisoning the cache.
export async function generateTenderOnePager(rawText: string): Promise<TenderOnePagerData> {
  const trimmedText = rawText.length > 12000 ? rawText.substring(0, 12000) + '\n[...truncated]' : rawText;
  const responseText = await callGemini(ONE_PAGER_PROMPT + trimmedText);
  const parsed = JSON.parse(stripJsonFences(responseText));
  return coerceOnePager(parsed);
}
