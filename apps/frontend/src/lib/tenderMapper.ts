/** Converts API records without inventing values for fields not supplied by a source. */
export function mapRelationshipTender(record: any) {
  const tender = record.tender ?? {};
  const rawTitle =
    typeof tender.title === "string" && tender.title.trim()
      ? tender.title
      : "Title unavailable — needs review";
  const organisation =
    typeof tender.source === "string" && tender.source.trim()
      ? tender.source
      : "Source unavailable";
  return {
    id: tender.id ?? record.tender_id,
    title: rawTitle,
    tenderNumber: tender.id
      ? String(tender.id).slice(0, 8).toUpperCase()
      : "Unavailable",
    source: organisation,
    issuingAuthority: organisation,
    sector: tender.sector ?? "Unavailable",
    contractValue:
      tender.value === null || tender.value === undefined
        ? null
        : Number(tender.value),
    deadline: tender.deadline ?? null,
    state: tender.state ?? "Unavailable",
    sourceStatus: tender.source_status ?? "needs_review",
    scopeOfWork: tender.raw_text ?? "Not available",
    eligibility: {
      requiredCertifications: Array.isArray(tender.certifications)
        ? tender.certifications
        : [],
    },
    status: "active",
    matchScore: Number(record.overall_score) || 0,
    breakdown: {
      certifications: Number(record.score_certifications) || 0,
      sectorExperience: Number(record.score_sector) || 0,
      financialCapacity: Number(record.score_financial) || 0,
      geography: Number(record.score_geography) || 0,
      pastProjects: Number(record.score_past_projects) || 0,
    },
  } as any;
}
