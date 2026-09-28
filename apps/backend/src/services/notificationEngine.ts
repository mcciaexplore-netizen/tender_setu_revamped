import { query } from '../utils/db';
import { sendNotificationDigestEmail } from './notificationService';

interface FilterRow {
  id: string;
  company_id: string;
  name: string;
  sectors: string[];
  states: string[];
  districts: string[];
  keywords: string[];
  min_value: string | number | null;
  max_value: string | number | null;
  email_enabled: boolean;
  profile: unknown;
}

interface TenderRow {
  id: string;
  title: string;
  sector: string | null;
  state: string | null;
  district: string | null;
  value: string | number | null;
  raw_text: string | null;
}

function includesCaseInsensitive(list: string[], value: string | null): boolean {
  if (!value) return false;
  const lowerValue = value.toLowerCase();
  return list.some((item) => item.toLowerCase() === lowerValue);
}

function matchesFilter(tender: TenderRow, filter: FilterRow): boolean {
  if (filter.sectors.length > 0 && !includesCaseInsensitive(filter.sectors, tender.sector)) return false;
  if (filter.states.length > 0 && !includesCaseInsensitive(filter.states, tender.state)) return false;
  if (filter.districts.length > 0 && !includesCaseInsensitive(filter.districts, tender.district)) return false;

  if (filter.keywords.length > 0) {
    const haystack = `${tender.title} ${tender.raw_text ?? ''}`.toLowerCase();
    const hasKeyword = filter.keywords.some((keyword) => keyword.trim() && haystack.includes(keyword.trim().toLowerCase()));
    if (!hasKeyword) return false;
  }

  if (filter.min_value !== null || filter.max_value !== null) {
    // A value constraint with no extracted tender value is treated as no
    // match rather than a guess, consistent with this app's evidence-only
    // matching elsewhere (gap-report, tender Q&A).
    if (tender.value === null || tender.value === undefined) return false;
    const value = Number(tender.value);
    if (filter.min_value !== null && value < Number(filter.min_value)) return false;
    if (filter.max_value !== null && value > Number(filter.max_value)) return false;
  }

  return true;
}

export async function runDailyNotificationMatch(): Promise<{ notificationsCreated: number; emailsSent: number }> {
  const [tendersResult, filtersResult] = await Promise.all([
    query(`SELECT id, title, sector, state, district, value, raw_text FROM tenders WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    query(`SELECT f.id, f.company_id, f.name, f.sectors, f.states, f.districts, f.keywords, f.min_value, f.max_value, f.email_enabled, c.profile
           FROM user_notification_filters f JOIN companies c ON c.id = f.company_id`),
  ]);

  const tenders: TenderRow[] = tendersResult.rows;
  const filters: FilterRow[] = filtersResult.rows;

  if (tenders.length === 0 || filters.length === 0) {
    return { notificationsCreated: 0, emailsSent: 0 };
  }

  let notificationsCreated = 0;
  const digestsByCompany = new Map<string, { email: string; items: { tenderId: string; tenderTitle: string; filterName: string }[] }>();

  for (const filter of filters) {
    for (const tender of tenders) {
      if (!matchesFilter(tender, filter)) continue;

      const title = `New match: ${filter.name}`;
      const message = `"${tender.title}" matches your alert rule "${filter.name}".`;
      const inserted = await query(
        `INSERT INTO notifications (company_id, tender_id, filter_id, title, message)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, tender_id, filter_id) DO NOTHING
         RETURNING id`,
        [filter.company_id, tender.id, filter.id, title, message],
      );
      if (!inserted.rowCount) continue; // already notified for this rule + tender

      notificationsCreated++;
      if (!filter.email_enabled) continue;

      let email = '';
      try {
        const profile = typeof filter.profile === 'string' ? JSON.parse(filter.profile) : filter.profile;
        email = typeof profile?.email === 'string' ? profile.email : '';
      } catch {
        // Skip email for this company if the stored profile isn't valid JSON.
      }
      if (!email) continue;

      const digest = digestsByCompany.get(filter.company_id) ?? { email, items: [] };
      digest.items.push({ tenderId: tender.id, tenderTitle: tender.title, filterName: filter.name });
      digestsByCompany.set(filter.company_id, digest);
    }
  }

  let emailsSent = 0;
  for (const digest of digestsByCompany.values()) {
    await sendNotificationDigestEmail(digest.email, digest.items);
    emailsSent++;
  }

  return { notificationsCreated, emailsSent };
}
