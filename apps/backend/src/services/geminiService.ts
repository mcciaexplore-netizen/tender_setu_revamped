import { env } from '../config/env';

// --- Rate-limit state ---
// Gemini free tier: 15 requests per minute, 1500 per day.
// We cap at 14 RPM (leaving 1 buffer) and track daily usage.

const MAX_REQUESTS_PER_MINUTE = 14;
const RATE_WINDOW_MS = 60_000;

let requestTimestamps: number[] = [];
let dailyCallCount = 0;
let dailyCallDate = new Date().toDateString();
const MAX_DAILY_CALLS = 1_400;

// --- Types ---

export interface GeminiExtractedTender {
  title: string | null;
  sector: string | null;
  value: number | null;
  deadline: string | null;
  eligibility: string | null;
  certifications: string[];
  personnel_requirements: string | null;
  confidence_score: number;
}

// --- Rate limiter ---

async function waitForRateLimit(): Promise<void> {
  const today = new Date().toDateString();
  if (today !== dailyCallDate) {
    dailyCallDate = today;
    dailyCallCount = 0;
  }

  if (dailyCallCount >= MAX_DAILY_CALLS) {
    throw new Error('[Gemini] Daily free-tier limit reached. Will resume tomorrow.');
  }

  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(t => now - t < RATE_WINDOW_MS);

  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestTs = requestTimestamps[0];
    const waitMs = RATE_WINDOW_MS - (now - oldestTs) + 100;
    console.log('[Gemini] Rate limit: waiting ' + Math.round(waitMs / 1000) + 's before next call...');
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
  dailyCallCount++;
}

// --- Extraction prompt ---

const EXTRACTION_PROMPT = 'You are an expert at extracting structured information from Indian government tender web pages.\n\nExtract the following fields from the raw text/HTML provided. Return ONLY a single valid JSON object with no markdown, no explanation, just JSON.\n\nFields:\n- title: Full tender title (string, required)\n- sector: One of: IT, Construction, Healthcare, Defence, Transport, Education, Manufacturing, Services, Energy, Agriculture, Other\n- value: Contract value in Indian Rupees as plain number (e.g. 5000000 for 50 lakhs). null if not found.\n- deadline: Submission deadline as ISO 8601 string (e.g. \"2024-12-31T17:00:00Z\"). null if not found.\n- eligibility: Who can apply (string or null)\n- certifications: Array from: [\"ISO 9001\",\"ISO 27001\",\"ISO 14001\",\"MSME\",\"CE Certified\",\"FDA Approved\",\"WHO-GMP Certified\",\"ARAI Approved\"]. Empty array if none.\n- personnel_requirements: Key staff qualifications (string or null)\n- confidence_score: Your confidence 0-100\n\nReturn ONLY this JSON:\n{"title":"...","sector":"...","value":null,"deadline":null,"eligibility":null,"certifications":[],"personnel_requirements":null,"confidence_score":80}\n\nRaw tender text:\n';

export async function extractTenderWithGemini(
  rawText: string,
  source: string,
): Promise<GeminiExtractedTender | null> {
  if (!env.geminiApiKey) {
    console.warn('[Gemini] No GEMINI_API_KEY set — falling back to local regex parser.');
    return null;
  }

  const trimmedText = rawText.length > 8000 ? rawText.substring(0, 8000) + '\n[...truncated]' : rawText;

  await waitForRateLimit();

  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(env.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const result = await model.generateContent(EXTRACTION_PROMPT + trimmedText);
      const responseText = result.response.text().trim();

      recordRequest();

      // Strip markdown code fences that Gemini sometimes wraps JSON in
      const jsonText = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(jsonText) as GeminiExtractedTender;

      if (!Array.isArray(parsed.certifications)) {
        parsed.certifications = [];
      }

      console.log('[Gemini] Extracted: "' + (parsed.title ?? 'unknown').substring(0, 60) + '" from ' + source + ' (confidence: ' + parsed.confidence_score + ')');
      return parsed;
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        console.warn('[Gemini] Attempt ' + attempt + ' failed for ' + source + ': ' + err.message + '. Retrying in 3s...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.error('[Gemini] All attempts failed for ' + source + ': ' + err.message + '. Falling back to regex parser.');
        return null;
      }
    }
  }

  return null;
}

export function getGeminiUsageStats(): { dailyCalls: number; maxDaily: number; isAvailable: boolean } {
  return {
    dailyCalls: dailyCallCount,
    maxDaily: MAX_DAILY_CALLS,
    isAvailable: !!env.geminiApiKey && dailyCallCount < MAX_DAILY_CALLS,
  };
}
