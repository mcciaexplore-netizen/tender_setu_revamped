import axios from 'axios';
import * as cheerio from 'cheerio';
import { pool, query } from '../utils/db';
import { scoreTenderAgainstCompanies } from './matchingService';
import { extractTenderData } from './extractionService';
import { getGeminiUsageStats } from './geminiService';
import fs from 'fs';

const SCRAPER_ADVISORY_LOCK = 82507421;

// ─── Portal registry ────────────────────────────────────────────────────────
// Each entry describes one government portal to crawl.
// method: 'static'  → Axios + Cheerio (no browser, works on Vercel-style hosts)
// method: 'dynamic' → Puppeteer headless Chrome (for JS-rendered pages)

interface PortalConfig {
  name: string;
  url: string;
  method: 'static' | 'dynamic';
  rowSelector?: string;      // CSS selector for table rows or list items
  maxItems?: number;         // maximum tenders to ingest per run
}

const PORTAL_REGISTRY: PortalConfig[] = [
  // ── Central Government ──────────────────────────────────────────────────
  { name: 'GeM CPPP',       url: 'https://gem.gov.in/cppp',                                  method: 'dynamic', maxItems: 100 },
  { name: 'eProcure CPPP',  url: 'https://eprocure.gov.in/eprocure/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp=SXRyU3QxeGxGcHZFS1BZb1JiMFE9PQ%3D%3D', method: 'static',  rowSelector: 'table tr', maxItems: 80 },
  { name: 'DRDO',           url: 'https://www.drdo.gov.in/tender',                            method: 'static',  rowSelector: 'table tr, .tender-item, li a', maxItems: 50 },
  { name: 'NHAI',           url: 'https://www.nhai.gov.in/tender-notice',                     method: 'static',  rowSelector: 'table tr, .views-row', maxItems: 50 },
  { name: 'CPWD',           url: 'https://cpwd.gov.in/Publication/TenderAwards.aspx',         method: 'static',  rowSelector: 'table tr', maxItems: 50 },
  { name: 'MeitY',          url: 'https://www.meity.gov.in/tenders',                          method: 'static',  rowSelector: 'table tr, .views-row', maxItems: 40 },
  { name: 'NICSI',          url: 'https://www.nicsi.nic.in/nicsi/tender.php',                 method: 'static',  rowSelector: 'table tr', maxItems: 30 },
  { name: 'IREPS Railways', url: 'https://www.ireps.gov.in/ireps/tnd/viewTender.action',      method: 'static',  rowSelector: 'table tr', maxItems: 60 },

  // ── PSU Portals ─────────────────────────────────────────────────────────
  { name: 'NTPC',           url: 'https://ntpctender.ntpc.co.in/APT/tenderSearch.aspx',       method: 'static',  rowSelector: 'table tr', maxItems: 40 },
  { name: 'BHEL',           url: 'https://tenders.bhel.com/BhelTenders/viewtenders.aspx',     method: 'static',  rowSelector: 'table tr', maxItems: 40 },
  { name: 'SAIL',           url: 'https://www.sailtenders.co.in/MainPage.aspx',               method: 'static',  rowSelector: 'table tr', maxItems: 40 },
  { name: 'HAL',            url: 'https://hal-india.co.in/Tender/tenderdetail',               method: 'static',  rowSelector: 'table tr, li a, .tender', maxItems: 30 },
  { name: 'BPCL',           url: 'https://www.bharatpetroleum.in/tender/activetenderdetails.aspx', method: 'static', rowSelector: 'table tr', maxItems: 30 },
  { name: 'ONGC',           url: 'https://www.ongcindia.com/web/ind/tender',                  method: 'static',  rowSelector: 'table tr, .tender-row', maxItems: 30 },
  { name: 'Coal India',     url: 'https://www.coalindia.in/en-us/company/tenders.aspx',       method: 'static',  rowSelector: 'table tr', maxItems: 30 },

  // ── Education & Research ────────────────────────────────────────────────
  { name: 'AIIMS Delhi',    url: 'https://www.aiims.edu/index.php/en/tenders/aiims-tender',   method: 'static',  rowSelector: 'table tr', maxItems: 40 },
  { name: 'IIT Delhi',      url: 'https://home.iitd.ac.in/tenders.php',                       method: 'static',  rowSelector: 'a[href*="/tenders/"]', maxItems: 30 },
  { name: 'IIT Bombay',     url: 'https://www.iitb.ac.in/newacadhome/tenders.jsp',            method: 'static',  rowSelector: 'table tr, li a', maxItems: 30 },
  { name: 'IIT Madras',     url: 'https://www.iitm.ac.in/tenders',                            method: 'static',  rowSelector: 'table tr, li', maxItems: 30 },
  { name: 'C-DAC',          url: 'https://www.cdac.in/index.aspx?id=tenders',                 method: 'static',  rowSelector: 'a[href*="tenders_details"]', maxItems: 30 },
  { name: 'NIC',            url: 'https://www.nic.in/tenders/',                               method: 'static',  rowSelector: 'table tr, li a', maxItems: 20 },

  // ── State Portals ────────────────────────────────────────────────────────
  { name: 'Maharashtra Tenders', url: 'https://mahatenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T', method: 'static', rowSelector: 'table tr', maxItems: 40 },
  { name: 'Delhi Tenders',  url: 'https://govtprocurement.delhi.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T', method: 'static', rowSelector: 'table tr', maxItems: 30 },
  { name: 'Kerala Tenders', url: 'https://etenders.kerala.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T', method: 'static', rowSelector: 'table tr', maxItems: 30 },
  { name: 'Haryana Tenders',url: 'https://etenders.hry.nic.in/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T', method: 'static', rowSelector: 'table tr', maxItems: 30 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function isAlreadyIngested(snippet: string): Promise<boolean> {
  if (!snippet || snippet.length < 10) return true;
  const res = await query(
    `SELECT id FROM tenders WHERE LOWER(title) LIKE $1 LIMIT 1`,
    [`%${snippet.substring(0, 50).toLowerCase()}%`]
  );
  return res.rows.length > 0;
}

async function ingestRawText(rawText: string, source: string, url?: string): Promise<boolean> {
  try {
    const result = await extractTenderData(rawText, source, 'live_scraped');
    if (result.success && result.tender && !result.duplicate) {
      if (url) {
        await query('UPDATE tenders SET url = $1 WHERE id = $2', [url, result.tender.id]).catch(() => {});
      }
      await scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
      return true;
    }
    return false;
  } catch (err: any) {
    console.error(`[Ingestion] Error processing from ${source}:`, err.message);
    return false;
  }
}

// ─── Static scraper (Axios + Cheerio) ────────────────────────────────────────

async function scrapeStaticPortal(portal: PortalConfig): Promise<number> {
  const { name, url, rowSelector = 'table tr, li a, .tender-item', maxItems = 50 } = portal;
  console.log(`\n[Static] Scraping ${name}...`);
  let newCount = 0;

  try {
    const { data: html } = await axios.get(url, {
      timeout: 25000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    const $ = cheerio.load(html);
    const rows: string[] = [];

    $(rowSelector).each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 30) {
        rows.push(text);
      }
    });

    console.log(`[Static] ${name}: found ${rows.length} items. Processing top ${Math.min(maxItems, rows.length)}...`);
    const toProcess = rows.slice(0, maxItems);

    for (const row of toProcess) {
      if (await isAlreadyIngested(row)) continue;
      const rawText = `Source: ${name}\nURL: ${url}\nContent: ${row}`;
      const added = await ingestRawText(rawText, name, url);
      if (added) newCount++;
    }
  } catch (err: any) {
    console.error(`[Static] ❌ ${name} failed: ${err.message}`);
  }

  console.log(`[Static] ${name}: +${newCount} new tenders`);
  return newCount;
}

// ─── Dynamic scraper (Puppeteer) for GeM pages ──────────────────────────────

async function scrapeGeMWithPuppeteer(browser: any, maxPages = 10): Promise<number> {
  console.log('\n[Dynamic] Scraping GeM CPPP portal (headless browser)...');
  let newCount = 0;

  try {
    const gemPage = await browser.newPage();
    await gemPage.setViewport({ width: 1366, height: 768 });
    await gemPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await gemPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const gemUrls = ['https://gem.gov.in/cppp'];
    for (let p = 2; p <= maxPages; p++) gemUrls.push(`https://gem.gov.in/cppp/${p}?`);

    for (let p = 0; p < gemUrls.length; p++) {
      const pageUrl = gemUrls[p];
      console.log(`[GeM] Page ${p + 1}/${gemUrls.length}: ${pageUrl}`);
      try {
        await gemPage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 35000 });
        await gemPage.waitForSelector('table, tr', { timeout: 15000 });

        const rows = await gemPage.evaluate(() => {
          const trs = Array.from(document.querySelectorAll('table tbody tr'));
          return trs.map((row: Element) => {
            const cols = Array.from(row.querySelectorAll('td')) as HTMLElement[];
            const titleLink = row.querySelector('td:nth-child(4) a') as HTMLAnchorElement | null;
            const docLink = row.querySelector('td:nth-child(8) a') as HTMLAnchorElement | null;
            return {
              closingDate: cols[1]?.innerText?.trim() ?? '',
              titleAndId: cols[3]?.innerText?.trim() ?? '',
              organisation: cols[4]?.innerText?.trim() ?? '',
              targetUrl: titleLink?.href || docLink?.href || 'https://eprocure.gov.in/cppp/tendersearch',
            };
          }).filter((r: any) => r.titleAndId.length > 0);
        });

        console.log(`[GeM] Page ${p + 1}: ${rows.length} bids found`);

        for (const r of rows) {
          const title = r.titleAndId.split('[')[0].trim().replace(/^title\s*&\s*id:\s*/i, '').trim();
          if (await isAlreadyIngested(title)) continue;
          const rawText = `Title & ID: ${r.titleAndId}\nOrganisation: ${r.organisation}\nClosing Date: ${r.closingDate}\nPortal URL: ${r.targetUrl}`;
          const added = await ingestRawText(rawText, 'GeM CPPP', r.targetUrl);
          if (added) newCount++;
        }
      } catch (pageErr: any) {
        console.error(`[GeM] Page ${p + 1} error: ${pageErr.message}`);
      }
    }
    await gemPage.close().catch(() => {});
  } catch (err: any) {
    console.error('[GeM] Headless scraper failed:', err.message);
  }

  console.log(`[GeM] +${newCount} new tenders`);
  return newCount;
}

// ─── Main exported function ──────────────────────────────────────────────────

export async function runLiveScraper(): Promise<{ success: boolean; count: number; skipped?: boolean }> {
  const lockClient = await pool.connect();
  let holdsLock = false;

  try {
    const lockResult = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [SCRAPER_ADVISORY_LOCK]);
    if (!lockResult.rows[0]?.locked) {
      console.log('[Scanner] Another scraper run is already in progress; skipping.');
      return { success: true, count: 0, skipped: true };
    }
    holdsLock = true;

    const geminiStats = getGeminiUsageStats();
    console.log(`\n🚀 Universal Tender Scraper starting — ${PORTAL_REGISTRY.length} portals`);
    console.log(`🤖 Gemini AI extraction: ${geminiStats.isAvailable ? `enabled (${geminiStats.dailyCalls}/${geminiStats.maxDaily} calls used today)` : 'disabled — using local regex fallback'}`);

    let totalNewCount = 0;
    let browser: any = null;

    // ── Launch Puppeteer for JS-rendered sites ─────────────────────────────
    try {
      let chromePath = process.env.CHROME_PATH || '';
      if (!chromePath) {
        if (process.platform === 'win32') {
          const winPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `C:\\Users\\${process.env.USERNAME || 'Admin'}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          ];
          chromePath = winPaths.find((p) => fs.existsSync(p)) || '';
        } else {
          const linuxPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
          chromePath = linuxPaths.find((p) => fs.existsSync(p)) || '';
        }
      }

      if (chromePath) {
        const puppeteer = await import('puppeteer-core');
        browser = await puppeteer.launch({
          executablePath: chromePath,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
        });
        console.log(`[Browser] Launched Chromium at: ${chromePath}`);
      } else {
        console.warn('[Browser] No Chromium found — GeM dynamic scraping will be skipped.');
      }
    } catch (browserErr: any) {
      console.warn('[Browser] Could not launch Chromium:', browserErr.message);
    }

    // ── Run GeM with Puppeteer ─────────────────────────────────────────────
    if (browser) {
      totalNewCount += await scrapeGeMWithPuppeteer(browser, 10);
    }

    // ── Run all static portals with Axios+Cheerio ──────────────────────────
    const staticPortals = PORTAL_REGISTRY.filter(p => p.method === 'static');
    for (const portal of staticPortals) {
      totalNewCount += await scrapeStaticPortal(portal);
      // Small delay between portals to be polite and avoid rate-limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (browser) {
      await browser.close().catch(() => {});
      console.log('[Browser] Chromium session closed.');
    }

    console.log(`\n🎉 Universal Scraper Complete! Total new tenders ingested: ${totalNewCount}`);
    return { success: true, count: totalNewCount };

  } finally {
    if (holdsLock) {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [SCRAPER_ADVISORY_LOCK]).catch(() => undefined);
    }
    lockClient.release();
  }
}

export async function seedInitialTenders(): Promise<number> {
  console.warn('[Scanner] Sample seeding is disabled. No unverified tenders were created.');
  return 0;
}