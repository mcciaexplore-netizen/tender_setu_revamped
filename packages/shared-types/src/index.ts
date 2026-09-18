/** Values identify whether a tender is current source material or requires caution. */
export type TenderSourceStatus = 'live_scraped' | 'template_sample' | 'verified' | 'needs_review';

export type CompanyRole = 'owner' | 'admin' | 'bid_manager' | 'viewer';

export type ApplicationStage = 'discovered' | 'interested' | 'preparing' | 'submitted' | 'won' | 'lost';

export interface TenderEvidence {
  sourceStatus: TenderSourceStatus;
  needsManualReview: boolean;
  extractionConfidence: number | null;
}

export interface MatchScoreBreakdown {
  certification: number;
  sector: number;
  financial: number;
  geography: number;
  pastProjects: number;
  personnel: number;
}

export interface TenderListItem extends TenderEvidence {
  id: string;
  title: string;
  organization: string | null;
  sector: string | null;
  deadline: string | null;
  value: number | null;
  url: string | null;
}
