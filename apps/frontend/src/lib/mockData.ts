/**
 * Presentation-only contracts and formatters. Tender records always come from
 * the API; this module deliberately contains no sample companies or tenders.
 */
export type Sector = string;
export type Source = string;

export interface MatchBreakdown {
  certifications: number;
  sectorExperience: number;
  financialCapacity: number;
  geography: number;
  pastProjects: number;
}

export interface Tender {
  id: string;
  title: string;
  tenderNumber: string;
  source: Source;
  issuingAuthority: string;
  sector: Sector;
  contractValue: number | null;
  emdAmount?: number | null;
  deadline: string | null;
  state: string;
  scopeOfWork: string;
  eligibility: {
    minTurnover?: number | null;
    minYearsInBusiness?: number | null;
    entityTypes?: string[];
    requiredCertifications: string[];
  };
  evaluationCriteria?: { technical: number; financial: number } | null;
  status: "active" | "closed";
  sourceStatus?:
    "live_scraped" | "template_sample" | "verified" | "needs_review";
  matchScore: number;
  breakdown: MatchBreakdown;
}

export const formatINR = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "Not available";
  if (value >= 10_000_000) return `Rs. ${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `Rs. ${(value / 100_000).toFixed(2)} L`;
  return `Rs. ${value.toLocaleString("en-IN")}`;
};

export const daysUntil = (iso: string | null | undefined) => {
  if (!iso || Number.isNaN(new Date(iso).getTime()))
    return Number.POSITIVE_INFINITY;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};
