export async function sendMatchNotification(companyEmail: string, companyName: string, tenderTitle: string, score: number) {
  // External delivery is intentionally disabled in the no-key, no-cost baseline.
  // The matched tender remains available in the authenticated dashboard.
  console.info(`[Notification disabled] ${companyName} <${companyEmail}> matched "${tenderTitle}" (${score}/100).`);
}
