import { pool, query } from '../utils/db';
import { scoreTenderAgainstCompanies } from './matchingService';
import { extractTenderData } from './extractionService';
import puppeteer from 'puppeteer-core';

const SCRAPER_ADVISORY_LOCK = 82507421;

export async function runLiveScraper(): Promise<{ success: boolean; count: number; skipped?: boolean }> {
  const lockClient = await pool.connect();
  let holdsLock = false;
  try {
    const lockResult = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [SCRAPER_ADVISORY_LOCK]);
    if (!lockResult.rows[0]?.locked) {
      console.log('[Scanner] A scraper run is already in progress; skipping this request.');
      return { success: true, count: 0, skipped: true };
    }
    holdsLock = true;
  console.log('🚀 Launching unified headless browser (GeM CPPP + AIIMS Delhi) crawl...');
  let totalNewCount = 0;
  let browser: any = null;

  try {
    let chromePath = process.env.CHROME_PATH || '';
    if (!chromePath) {
      const fs = require('fs');
      if (process.platform === 'win32') {
        const winPaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `C:\\Users\\${process.env.USERNAME || 'Admin'}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ];
        chromePath = winPaths.find((p: string) => fs.existsSync(p)) || '';
      } else if (process.platform === 'darwin') {
        chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
        const linuxPaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser'
        ];
        chromePath = linuxPaths.find((p: string) => fs.existsSync(p)) || '';
      }
    }

    console.log(`[Scanner] Using browser executable path: ${chromePath || 'None (Fallback mode)'}`);

    if (chromePath) {
      try {
        browser = await puppeteer.launch({
          executablePath: chromePath,
          headless: true,
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
          ]
        });
      } catch (launchErr: any) {
        console.warn('[Scanner] Could not launch headless browser directly:', launchErr.message);
      }
    }

    // === SECTION 1: CRAWL GeM CPPP PORTAL ===
    try {
      console.log('\nStep 1: Navigating to live GeM CPPP Portal...');
      const gemPage = await browser.newPage();
      await gemPage.setViewport({ width: 1366, height: 768 });
      await gemPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Remove navigator traces
      await gemPage.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const gemUrls = ['https://gem.gov.in/cppp'];
      for (let p = 2; p <= 10; p++) {
        gemUrls.push(`https://gem.gov.in/cppp/${p}?`);
      }

      for (let p = 0; p < gemUrls.length; p++) {
        const url = gemUrls[p];
        console.log(`\n[GeM CPPP] Crawling page ${p + 1}: ${url}`);
        
        try {
          await gemPage.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
          await gemPage.waitForSelector('table, tr', { timeout: 15000 });

          // Extract details including target links from the dynamic table
          const gemRows = await gemPage.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            return rows.map(row => {
              const cols = Array.from(row.querySelectorAll('td'));
              const titleLink = row.querySelector('td:nth-child(4) a');
              const docLink = row.querySelector('td:nth-child(8) a');
              
              return {
                closingDate: cols[1] ? cols[1].innerText.trim() : '',
                titleAndId: cols[3] ? cols[3].innerText.trim() : '',
                organisation: cols[4] ? cols[4].innerText.trim() : '',
                targetUrl: (titleLink ? titleLink.getAttribute('href') : '') || (docLink ? docLink.getAttribute('href') : '') || 'https://eprocure.gov.in/cppp/tendersearch'
              };
            }).filter(r => r.titleAndId.length > 0);
          });

          console.log(`[GeM CPPP] Page ${p + 1} found ${gemRows.length} active bids online. Processing all...`);

          for (let i = 0; i < gemRows.length; i++) {
            const r = gemRows[i];
            const title = r.titleAndId.split('[')[0].trim() || 'Unknown GeM Tender';
            const cleanTitle = title.replace(/^title\s*&\s*id:\s*/i, '').trim();
            
            // Skip duplicate insertion if title already exists in the database
            const existing = await query(
              `SELECT id FROM tenders WHERE LOWER(title) = LOWER($1) OR LOWER(title) = LOWER($2) OR LOWER(title) LIKE $3`, 
              [title, cleanTitle, `%${cleanTitle.substring(0, 50)}%`]
            );
            if (existing.rows.length > 0) {
              continue;
            }

            console.log(`Ingesting GeM bid [Page ${p + 1}, Bid ${i + 1}/${gemRows.length}]: "${title.substring(0, 60)}..."`);
            const rawText = `Title & ID: ${r.titleAndId}\nOrganisation: ${r.organisation}\nClosing Date: ${r.closingDate}\nPortal URL: ${r.targetUrl}`;

            try {
              const result = await extractTenderData(rawText, 'GeM CPPP', 'live_scraped');
              if (result.success && result.tender) {
                totalNewCount++;
                await query('UPDATE tenders SET url = $1 WHERE id = $2', [r.targetUrl, result.tender.id]);
                await scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
              }
            } catch (err: any) {
              console.error(`Error ingesting GeM bid [Page ${p + 1}, Bid ${i + 1}]:`, err.message);
            }
          }
        } catch (pageErr: any) {
          console.error(`❌ Skipped crawling GeM page ${p + 1} due to error:`, pageErr.message);
        }
      }
      await gemPage.close().catch(() => {});
    } catch (gemError: any) {
      console.error('❌ GeM CPPP live crawling skipped/failed:', gemError.message);
    }

    // === SECTION 2: CRAWL AIIMS DELHI PORTAL ===
    try {
      console.log('\nStep 2: Navigating to live AIIMS Delhi Tenders Portal...');
      const aiimsPage = await browser.newPage();
      await aiimsPage.setViewport({ width: 1366, height: 768 });
      await aiimsPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await aiimsPage.goto('https://www.aiims.edu/index.php/en/tenders/aiims-tender', { waitUntil: 'networkidle2', timeout: 45000 });
      await aiimsPage.waitForSelector('table, tr', { timeout: 15000 });

      const aiimsRows = await aiimsPage.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
          const cols = Array.from(row.querySelectorAll('td'));
          return cols.map(col => col.innerText.trim());
        }).filter(cols => cols.length > 0 && cols.some(c => c.length > 0));
      });

      console.log(`[AIIMS Delhi] Found ${aiimsRows.length} active tenders online. Processing top 20...`);
      const aiimsTargetCount = Math.min(40, aiimsRows.length);

      for (let i = 0; i < aiimsTargetCount; i++) {
        const row = aiimsRows[i];
        const refNo = row[0] || 'N/A';
        const details = row[1] || 'N/A';
        const dates = row.slice(2).join(' | ');

        const titleSnippet = details.substring(0, 100);
        const existCheck = await query('SELECT id FROM tenders WHERE title LIKE $1', [`%${titleSnippet}%`]);
        if (existCheck.rows.length > 0) {
          continue; // Already processed
        }

        console.log(`Ingesting AIIMS tender [${i + 1}/${aiimsTargetCount}]: "${titleSnippet.substring(0, 60)}..."`);
        const rawText = `Ref/Type: ${refNo}\nDescription: ${details}\nDates & Limits: ${dates}\nSource: AIIMS Delhi Portal`;

        try {
          const result = await extractTenderData(rawText, 'AIIMS Delhi', 'live_scraped');
          if (result.success && result.tender) {
            totalNewCount++;
            await scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
          }
        } catch (err: any) {
          console.error(`Error ingesting AIIMS tender ${i + 1}:`, err.message);
        }
      }
      await aiimsPage.close().catch(() => {});
    } catch (aiimsError: any) {
      console.error('❌ AIIMS Delhi live crawling skipped/failed:', aiimsError.message);
    }

    // === SECTION 3: CRAWL IIT DELHI PORTAL ===
    try {
      console.log('\nStep 3: Navigating to live IIT Delhi Tenders Portal...');
      const iitPage = await browser.newPage();
      await iitPage.setViewport({ width: 1366, height: 768 });
      await iitPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await iitPage.goto('https://home.iitd.ac.in/tenders.php', { waitUntil: 'networkidle2', timeout: 45000 });
      await iitPage.waitForSelector('a[href*="/tenders/"]', { timeout: 15000 });

      const iitLinks = await iitPage.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/tenders/"]'));
        return anchors.map(a => {
          const anchor = a as HTMLAnchorElement;
          return {
            title: (anchor.textContent || anchor.innerText || '').trim(),
            url: anchor.getAttribute('href') || ''
          };
        }).filter(item => item.title.length > 0 && item.url.length > 0);
      });

      console.log(`[IIT Delhi] Found ${iitLinks.length} active tenders online. Processing top 30...`);
      const iitTargetCount = Math.min(30, iitLinks.length);

      for (let i = 0; i < iitTargetCount; i++) {
        const link = iitLinks[i];
        const cleanTitle = link.title.replace(/^title\s*&\s*id:\s*/i, '').trim();
        
        // Skip duplicate insertion if title already exists in the database
        const existing = await query(
          `SELECT id FROM tenders WHERE LOWER(title) = LOWER($1) OR LOWER(title) = LOWER($2) OR LOWER(title) LIKE $3`, 
          [link.title, cleanTitle, `%${cleanTitle.substring(0, 50)}%`]
        );
        if (existing.rows.length > 0) {
          continue;
        }

        console.log(`Ingesting IIT Delhi tender [${i + 1}/${iitTargetCount}]: "${link.title.substring(0, 60)}..."`);
        const rawText = `Title: ${link.title}\nSource URL: ${link.url}\nOrganisation: Indian Institute of Technology Delhi (IIT Delhi)\nSource: IIT Delhi Tenders Portal`;

        try {
          const result = await extractTenderData(rawText, 'IIT Delhi', 'live_scraped');
          if (result.success && result.tender) {
            totalNewCount++;
            await query('UPDATE tenders SET url = $1 WHERE id = $2', [link.url, result.tender.id]);
            await scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
          }
        } catch (err: any) {
          console.error(`Error ingesting IIT Delhi tender ${i + 1}:`, err.message);
        }
      }
      await iitPage.close().catch(() => {});
    } catch (iitError: any) {
      console.error('❌ IIT Delhi live crawling skipped/failed:', iitError.message);
    }

    // === SECTION 4: CRAWL C-DAC IT PORTAL ===
    try {
      console.log('\nStep 4: Navigating to live C-DAC Tenders Portal (Pure IT Sector)...');
      const cdacPage = await browser.newPage();
      await cdacPage.setViewport({ width: 1366, height: 768 });
      await cdacPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await cdacPage.goto('https://www.cdac.in/index.aspx?id=tenders', { waitUntil: 'networkidle2', timeout: 45000 });
      await cdacPage.waitForSelector('a[href*="tenders_details"]', { timeout: 15000 });

      const cdacLinks = await cdacPage.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="tenders_details"]'));
        return anchors.map(a => {
          const anchor = a as HTMLAnchorElement;
          return {
            title: (anchor.textContent || anchor.innerText || '').trim(),
            url: anchor.getAttribute('href') || ''
          };
        }).filter(item => item.title.length > 0 && item.url.length > 0);
      });

      console.log(`[C-DAC IT] Found ${cdacLinks.length} active IT tenders online. Processing all...`);

      for (let i = 0; i < cdacLinks.length; i++) {
        const link = cdacLinks[i];
        const cleanTitle = link.title.trim();
        const absoluteUrl = link.url.startsWith('http') ? link.url : `https://www.cdac.in/${link.url}`;
        
        // Skip duplicate insertion if title already exists in the database
        const existing = await query(
          `SELECT id FROM tenders WHERE LOWER(title) = LOWER($1) OR LOWER(title) LIKE $2`, 
          [cleanTitle, `%${cleanTitle.substring(0, 50)}%`]
        );
        if (existing.rows.length > 0) {
          continue;
        }

        console.log(`Ingesting C-DAC IT tender [${i + 1}/${cdacLinks.length}]: "${cleanTitle.substring(0, 60)}..."`);
        const rawText = `Title: ${cleanTitle}\nSource URL: ${absoluteUrl}\nOrganisation: Centre for Development of Advanced Computing (C-DAC)\nSector: IT\nSource: C-DAC Tenders Portal`;

        try {
          const result = await extractTenderData(rawText, 'C-DAC', 'live_scraped');
          if (result.success && result.tender) {
            totalNewCount++;
            await query('UPDATE tenders SET url = $1, sector = $2 WHERE id = $3', [absoluteUrl, 'IT', result.tender.id]);
            await scoreTenderAgainstCompanies(result.tender.id).catch(console.error);
          }
        } catch (err: any) {
          console.error(`Error ingesting C-DAC IT tender ${i + 1}:`, err.message);
        }
      }
      await cdacPage.close().catch(() => {});
    } catch (cdacError: any) {
      console.error('❌ C-DAC IT live crawling skipped/failed:', cdacError.message);
    }

  } catch (globalError: any) {
    console.error('❌ Unified headless browser scraper execution failed:', globalError.message);
  } finally {
    if (browser) {
      console.log('\nClosing browser session...');
      await browser.close().catch(() => {});
    }
  }

  console.log(`\n🎉 Unified Live Sync Complete! Fresh tenders added & matched: ${totalNewCount}`);
  return { success: true, count: totalNewCount };
  } finally {
    if (holdsLock) await lockClient.query('SELECT pg_advisory_unlock($1)', [SCRAPER_ADVISORY_LOCK]).catch(() => undefined);
    lockClient.release();
  }
}

export async function seedInitialTenders(): Promise<number> {
  console.warn('[Scanner] Sample seeding is disabled. No unverified tenders were created.');
  return 0;

  const sampleTenders = [
    {
      title: "Supply of Lightweight Carbon-Fiber Composite Shells for DRDO Drone Platforms",
      source: "DRDO Tenders Portal",
      sector: "Defence",
      value: 3800000,
      deadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Open to security infrastructure or composite manufacturers.",
      certifications: ["ISO 9001", "MSME"],
      personnel_requirements: "Quality assurance technician with 3+ years experience in composite carbon setups",
      raw_text: "DRDO active procurement for Lightweight Carbon-Fiber Composite Shells. Closing soon. Mandatory: ISO 9001, MSME. Requires technical team with composite technician experience.",
      confidence_score: 98,
      url: "https://drdo.gov.in/tenders"
    },
    {
      title: "Avionics Cockpit Displays and Integration Cables for HAL Tejas Mk1A",
      source: "HAL Tenders Portal",
      sector: "Defence",
      value: 9500000,
      deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Aviation or defense electronics certified suppliers.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Avionics systems engineer with B.Tech and 3+ years experience in aerospace wiring",
      raw_text: "HAL Avionics Cockpit Displays procurement. Certification required: ISO 9001 and ISO 27001 mandatory. Staff must include B.Tech engineer.",
      confidence_score: 96,
      url: "https://hal-india.co.in/tenders"
    },
    {
      title: "Comprehensive Enterprise Cloud Infrastructure Migration and Virtual Server Setup",
      source: "NICSI Tenders Portal",
      sector: "IT",
      value: 4800000,
      deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Certified cloud partners and network system integrators.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Cloud migration architect with B.Tech and 5+ years experience",
      raw_text: "NICSI enterprise cloud deployment. Required Certifications: ISO 9001, ISO 27001. Requires cloud migration architect with B.Tech.",
      confidence_score: 98,
      url: "https://nicsi.nic.in/tenders"
    },
    {
      title: "Deployment of Secure Multi-Cloud Web Hosting and Disaster Recovery Portal Software",
      source: "MeitY Tenders Portal",
      sector: "IT",
      value: 6200000,
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Web engineering and high-availability database hosting firms.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Software systems engineer with B.Tech and database credentials",
      raw_text: "MeitY secure cloud hosting and portal disaster recovery. Required Certifications: ISO 9001, ISO 27001. Requires software engineer with B.Tech.",
      confidence_score: 97,
      url: "https://meity.gov.in/tenders"
    },
    {
      title: "Civil Construction of Multi-Storey Residential Barracks and Accommodation blocks",
      source: "MES Construction Portal",
      sector: "Construction",
      value: 28000000,
      deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Grade-A construction companies and civil contractors.",
      certifications: ["ISO 9001", "MSME"],
      personnel_requirements: "Civil site engineer with B.Tech and 5+ years experience in high-rise buildings",
      raw_text: "Construction of residential barracks. Required Certifications: ISO 9001, MSME. Requires B.Tech civil site engineer.",
      confidence_score: 95,
      url: "https://mes.gov.in/tenders"
    },
    {
      title: "Comprehensive Annual Maintenance Contract (AMC) for Diagnostic and Hospital Medical Equipment",
      source: "AIIMS Delhi Portal",
      sector: "Healthcare",
      value: 5200000,
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Certified biomedical engineering and clinical maintenance partners.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Biomedical maintenance technician with 3+ years experience in diagnostics",
      raw_text: "Hospital diagnostic and medical equipment AMC. Required Certifications: ISO 9001, ISO 27001. Requires biomedical technician.",
      confidence_score: 99,
      url: "https://www.aiims.edu/tenders"
    },
    {
      title: "Supply and Commissioning of CNC Milling Machinery and Metal Lathe Tooling Setups",
      source: "C-DAC Tenders Portal",
      sector: "Manufacturing",
      value: 15000000,
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Precision machine tool manufacturers and integration partners.",
      certifications: ["ISO 9001", "MSME"],
      personnel_requirements: "CNC toolings engineer with 3+ years experience in automated mills",
      raw_text: "CNC milling machine and lathe tooling. Required Certifications: ISO 9001, MSME. Requires CNC toolings engineer.",
      confidence_score: 96,
      url: "https://www.cdac.in/index.aspx?id=tenders"
    }
  ];

  let addedCount = 0;
  for (const t of sampleTenders) {
    const existing = await query('SELECT id FROM tenders WHERE LOWER(title) = LOWER($1)', [t.title]);
    if (existing.rows.length === 0) {
      const { rows } = await query(`
        INSERT INTO tenders (title, source, sector, value, deadline, eligibility, certifications, personnel_requirements, raw_text, confidence_score, url, source_status, needs_manual_review)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'verified', FALSE)
        RETURNING id
      `, [t.title, t.source, t.sector, t.value, t.deadline, t.eligibility, t.certifications, t.personnel_requirements, t.raw_text, t.confidence_score, t.url]);

      if (rows[0]?.id) {
        addedCount++;
        await scoreTenderAgainstCompanies(rows[0].id).catch(console.error);
      }
    }
  }

  // Rescore all companies against all tenders
  const { rows: companies } = await query('SELECT id FROM companies');
  for (const c of companies) {
    await scoreTenderAgainstCompanies(c.id).catch(console.error);
  }

  console.log(`[Scanner] Seeded ${addedCount} initial active tenders into database.`);
  return addedCount;
}

// === NEW: SECTOR-SPECIFIC PORTAL CRAWLER ===
const PORTAL_TENDER_TEMPLATES: Record<string, any[]> = {
  'https://drdo.gov.in/tenders': [
    {
      title: "Supply of Lightweight Carbon-Fiber Composite Shells for DRDO Drone Platforms",
      source: "DRDO Tenders Portal",
      value: 3800000,
      deadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Open to security infrastructure or composite manufacturers.",
      certifications: ["ISO 9001", "MSME"],
      personnel_requirements: "Quality assurance technician with 3+ years experience in composite carbon setups",
      raw_text: "DRDO active procurement for Lightweight Carbon-Fiber Composite Shells. Closing soon. Mandatory: ISO 9001, MSME. Requires technical team with composite technician experience.",
      confidence_score: 98
    }
  ],
  'https://hal-india.co.in/tenders': [
    {
      title: "Avionics Cockpit Displays and Integration Cables for HAL Tejas Mk1A",
      source: "HAL Tenders Portal",
      value: 9500000,
      deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Aviation or defense electronics certified suppliers.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Avionics systems engineer with B.Tech and 3+ years experience in aerospace wiring",
      raw_text: "HAL Avionics Cockpit Displays procurement. Certification required: ISO 9001 and ISO 27001 mandatory. Staff must include B.Tech engineer.",
      confidence_score: 96
    }
  ],
  'https://ireps.gov.in': [
    {
      title: "Automatic Train Protection (ATP) On-Board Electronic Modules and Cabin Cabling",
      source: "IREPS Railways Portal",
      value: 12000000,
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Railway signalling and electrical equipment suppliers.",
      certifications: ["ISO 9001"],
      personnel_requirements: "Signalling field engineer with 3+ years experience in traction controls",
      raw_text: "IREPS Railways active tender for ATP Cabin Modules and Cabling. ISO 9001 mandatory. Requires certified field engineer.",
      confidence_score: 97
    }
  ],
  'https://nhai.gov.in/tenders': [
    {
      title: "NHAI Smart RFID Tolling Lanes and Vehicle Classification Controllers for Delhi-Mumbai Expressway",
      source: "NHAI Tenders Portal",
      value: 15000000,
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Tollway infrastructure or network systems integrators.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Lead systems engineer with B.Tech and 2+ years experience in active lane sensors",
      raw_text: "NHAI active procurement for Delhi-Mumbai Expressway RFID tolling lane installations. Required Certifications: ISO 9001, ISO 27001. Requires lead systems engineer with B.Tech.",
      confidence_score: 99
    }
  ],
  'https://nicsi.nic.in/tenders': [
    {
      title: "NICSI Empanelment of Cloud Computing Integrators and Virtual Server Management Partners",
      source: "NICSI Tenders Portal",
      value: 8500000,
      deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Cloud and cloud-infrastructure integration firms.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Cloud solutions engineer with B.Tech and certified administrator credentials",
      raw_text: "NICSI national cloud empanelment active portal notice. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech systems engineer.",
      confidence_score: 98
    }
  ],
  'https://meity.gov.in/tenders': [
    {
      title: "Establishment of Secure Multi-Cloud Web Hosting and Disaster Recovery Portal for MeitY Projects",
      source: "MeitY Tenders Portal",
      value: 6400000,
      deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: "Secure hosting and web engineering providers.",
      certifications: ["ISO 9001", "ISO 27001"],
      personnel_requirements: "Information security engineer with B.Tech systems credentials",
      raw_text: "MeitY secure multi-cloud web hosting setup. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech systems engineer.",
      confidence_score: 97
    }
  ]
};

export function generateDynamicSectorTemplates(portalUrl: string, sector: string): any[] {
  // Template tenders are deliberately disabled: unverified sources must not create plausible data.
  console.warn(`[Scanner] No verified template data is available for ${portalUrl} (${sector}).`);
  return [];

  const domain = portalUrl.replace('https://', '').split('/')[0];
  const source = `${domain.toUpperCase()} Portal`;

  const templates: Record<string, any[]> = {
    IT: [
      {
        title: "Comprehensive Enterprise Cloud Infrastructure Migration and Virtual Server Setup",
        value: 4800000,
        eligibility: "Certified cloud partners and network system integrators.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Cloud migration architect with B.Tech and 5+ years experience",
        raw_text: `Enterprise cloud deployment. Required Certifications: ISO 9001, ISO 27001. Requires cloud migration architect with B.Tech.`
      },
      {
        title: "Managed Security Operations Center (SOC) Firewall Installation and Cybersecurity Monitoring",
        value: 3500000,
        eligibility: "Information security and managed network service providers.",
        certifications: ["ISO 27001"],
        personnel_requirements: "Security operations center specialist with 3+ years experience",
        raw_text: `SOC firewall setup and network cybersecurity. Required Certifications: ISO 27001. Requires security operations specialist.`
      },
      {
        title: "CCTV surveillance installation, cabling and active storage servers for office complex",
        value: 2900000,
        eligibility: "Electronic security and hardware surveillance installers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Hardware installation technician with 2+ years experience in high-definition CCTV",
        raw_text: `High-definition CCTV and storage servers. Required Certifications: ISO 9001, MSME. Requires hardware technician.`
      },
      {
        title: "Supply and Commissioning of Smart Classroom Digital Boards, Projectors and routers",
        value: 1800000,
        eligibility: "Smart educational hardware and interactive equipment suppliers.",
        certifications: ["MSME"],
        personnel_requirements: "Audio-visual setup specialist with 2+ years experience",
        raw_text: `Smartboards and projector installation. Required Certifications: MSME. Requires AV setup specialist.`
      },
      {
        title: "Deployment of Secure Multi-Cloud Web Hosting and Disaster Recovery Portal Software",
        value: 6200000,
        eligibility: "Web engineering and high-availability database hosting firms.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Software systems engineer with B.Tech and database credentials",
        raw_text: `Secure cloud hosting and portal disaster recovery. Required Certifications: ISO 9001, ISO 27001. Requires software engineer with B.Tech.`
      },
      {
        title: "Annual Maintenance Contract (AMC) for desktop computers, printers, and active UPS network",
        value: 1200000,
        eligibility: "Certified IT hardware support and maintenance partners.",
        certifications: ["ISO 9001"],
        personnel_requirements: "IT support technician with 2+ years experience in desktop troubleshooting",
        raw_text: `IT hardware and network UPS AMC. Required Certifications: ISO 9001. Requires IT support technician.`
      },
      {
        title: "Implementation of Enterprise Resource Planning (ERP) and Student Academic Portal",
        value: 7500000,
        eligibility: "Enterprise software development and system integration firms.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Lead database developer with B.Tech and 3+ years experience",
        raw_text: `ERP database software and student portal. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech lead database developer.`
      },
      {
        title: "Structured Ethernet LAN Cabling, fiber installations, and Wi-Fi mesh routers setup",
        value: 3800000,
        eligibility: "Network infrastructure and fiber-optic cabling vendors.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Network cabling technician with 3+ years experience in fiber splice",
        raw_text: `LAN cabling and Wi-Fi mesh router deployment. Required Certifications: ISO 9001, MSME. Requires cabling technician.`
      },
      {
        title: "Corporate email migration, cloud active directory synchronization and Office suite setup",
        value: 1500000,
        eligibility: "Cloud mail migration and workplace collaboration partners.",
        certifications: ["ISO 27001"],
        personnel_requirements: "Workplace migration specialist with 2+ years experience in active directory",
        raw_text: `Active directory cloud sync and mail migration. Required Certifications: ISO 27001. Requires migration specialist.`
      },
      {
        title: "Helpdesk customer support staff outsourcing and technical coordinator deployment",
        value: 2200000,
        eligibility: "Staffing, training, and customer service outsourcing vendors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Customer relationship manager with 3+ years experience",
        raw_text: `Helpdesk support and coordinator staffing. Required Certifications: ISO 9001. Requires customer relationship manager.`
      }
    ],
    Construction: [
      {
        title: "Civil Construction of Multi-Storey Residential Barracks and OTM Accommodation blocks",
        value: 28000000,
        eligibility: "Grade-A construction companies and civil contractors.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Civil site engineer with B.Tech and 5+ years experience in high-rise buildings",
        raw_text: `Construction of residential barracks. Required Certifications: ISO 9001, MSME. Requires B.Tech civil site engineer.`
      },
      {
        title: "Renovation of office interiors, partition modular boards and painting works",
        value: 4500000,
        eligibility: "Commercial interior design and fit-out contractors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Interior fit-out supervisor with 3+ years experience",
        raw_text: `Interior partition modular panels and painting. Required Certifications: ISO 9001. Requires fit-out supervisor.`
      },
      {
        title: "Structural repair, waterproofing, and roofing leakage treatment for campus building",
        value: 2400000,
        eligibility: "Building rehabilitation and structural waterproofing vendors.",
        certifications: ["MSME"],
        personnel_requirements: "Waterproofing technician with 3+ years experience",
        raw_text: `Roofing leakage structural repair and waterproofing. Required Certifications: MSME. Requires waterproofing technician.`
      },
      {
        title: "Road paving, concrete path laying, and drainage pipeline channel construction",
        value: 12000000,
        eligibility: "Registered road construction and municipal drainage contractors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Road construction foreman with 4+ years experience",
        raw_text: `Concrete paving and municipal drainage pipes. Required Certifications: ISO 9001. Requires road construction foreman.`
      },
      {
        title: "Plumbing, sanitation fitting, water storage tanks, and pump room piping network",
        value: 3200000,
        eligibility: "Certified plumbing and water systems integration contractors.",
        certifications: ["MSME"],
        personnel_requirements: "Plumbing piping technician with 3+ years experience",
        raw_text: `Sanitation fittings and water tank pump room. Required Certifications: MSME. Requires plumbing technician.`
      },
      {
        title: "Electrical wiring, lighting panel installation, copper earthing, and lighting arrestors",
        value: 5800000,
        eligibility: "Licensed electrical works contractors and cable installers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Electrical project engineer with 3+ years experience",
        raw_text: `Electrical wiring, lighting panels, and earthing. Required Certifications: ISO 9001, MSME. Requires electrical project engineer.`
      },
      {
        title: "Installation of fire protection systems, escape exit doors and automatic fire alarms",
        value: 6500000,
        eligibility: "Certified fire safety infrastructure and sprinkler installers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Fire safety inspector with 2+ years experience in commercial setups",
        raw_text: `Automatic sprinkler and fire alarm installation. Required Certifications: ISO 9001. Requires fire safety inspector.`
      },
      {
        title: "Supply, installation and ducting of HVAC central ventilation systems for new annex",
        value: 9500000,
        eligibility: "Industrial HVAC heating and ventilation contractors.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "HVAC design engineer with B.Tech and 3+ years experience",
        raw_text: `Central ventilation HVAC ducting and system. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech HVAC design engineer.`
      },
      {
        title: "Metal fence border security, guard posts, and perimeter wall construction",
        value: 8400000,
        eligibility: "Security fencing and structural boundary wall contractors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Boundary wall project manager with 3+ years experience",
        raw_text: `Border fence security and guard booth masonry. Required Certifications: ISO 9001. Requires boundary wall project manager.`
      },
      {
        title: "Plastering, masonry, and floor tiling renovation works for staff hostel",
        value: 3800000,
        eligibility: "Hostel building repair and masonry civil vendors.",
        certifications: ["MSME"],
        personnel_requirements: "Masonry repair supervisor with 2+ years experience",
        raw_text: `Floor tiling, plastering, and masonry renovation. Required Certifications: MSME. Requires repair supervisor.`
      }
    ],
    Healthcare: [
      {
        title: "Comprehensive Annual Maintenance Contract (AMC) for Diagnostic and Hospital Medical Equipment",
        value: 5200000,
        eligibility: "Certified biomedical engineering and clinical maintenance partners.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Biomedical maintenance technician with 3+ years experience in diagnostics",
        raw_text: `Hospital diagnostic and medical equipment AMC. Required Certifications: ISO 9001, ISO 27001. Requires biomedical technician.`
      },
      {
        title: "Supply of Sterile Disposable Medical Kits, Syringes, and IV Infusion Sets",
        value: 12000000,
        eligibility: "Sterile medical consumable manufacturers and wholesale distributors.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Quality assurance manager with 3+ years experience in cleanroom packaging",
        raw_text: `Sterile disposable syringes and IV sets. Required Certifications: ISO 9001, MSME. Requires quality assurance manager.`
      },
      {
        title: "Supply of Sensory Training Toys, blocks, and therapy kits for Pediatric Ward rehabilitation",
        value: 1500000,
        eligibility: "Specialized sensory educational play and therapy toy suppliers.",
        certifications: ["MSME"],
        personnel_requirements: "Pediatric rehabilitation advisor with 2+ years experience in autism therapy",
        raw_text: `Sensory training toys, blocks, and therapy kits. Required Certifications: MSME. Requires pediatric rehabilitation advisor.`
      },
      {
        title: "Outsourcing of Trained Nursing Staff, ward assistants, and emergency responders",
        value: 8400000,
        eligibility: "Registered healthcare staffing and nurse recruiting agencies.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Healthcare staffing manager with 4+ years experience",
        raw_text: `Nursing staff and ward assistants deployment. Required Certifications: ISO 9001. Requires staffing manager.`
      },
      {
        title: "Diagnostic labs reagents supply, chemical kits, and automated blood analyzers servicing",
        value: 3600000,
        eligibility: "Laboratory chemical reagents and blood analyzer service partners.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Lab technology specialist with 3+ years experience",
        raw_text: `Labs chemical reagents and blood analyzer. Required Certifications: ISO 9001. Requires lab technology specialist.`
      },
      {
        title: "Supply of ICU ventilators, high-flow nasal oxygen devices, and patient monitoring setups",
        value: 18000000,
        eligibility: "Critical care medical equipment manufacturers and direct suppliers.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Critical care equipment engineer with B.Tech and 3+ years experience",
        raw_text: `ICU ventilators and patient monitors setup. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech equipment engineer.`
      },
      {
        title: "Servicing, replacement of components, and AMC of high-frequency Radiology X-Ray systems",
        value: 9200000,
        eligibility: "AERB approved radiology equipment service engineers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Radiology systems engineer with 4+ years experience",
        raw_text: `AMC of radiology X-Ray and imaging systems. Required Certifications: ISO 9001. Requires radiology systems engineer.`
      },
      {
        title: "Supply of modular hospital ICU beds, electronic wheelchairs, and emergency stretchers",
        value: 6800000,
        eligibility: "Hospital furniture and clinical mobility equipment manufacturers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Biomedical assembly technician with 2+ years experience",
        raw_text: `ICU beds, stretchers, and electronic wheelchairs. Required Certifications: ISO 9001, MSME. Requires assembly technician.`
      },
      {
        title: "Sterile air ventilation HVAC systems, HEPA filters and laminars for Operation Theatres",
        value: 11000000,
        eligibility: "Cleanroom HVAC design engineers and clinical ventilation contractors.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Cleanroom ventilation specialist with B.Tech and 3+ years experience",
        raw_text: `OT sterile ventilation and HEPA filters. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech ventilation specialist.`
      },
      {
        title: "Pharmacy ERP software implementation, barcode systems, and medical inventory tracking",
        value: 2900000,
        eligibility: "Healthcare ERP systems developers and database management partners.",
        certifications: ["ISO 27001"],
        personnel_requirements: "Healthcare ERP developer with B.Tech and database credentials",
        raw_text: `Pharmacy ERP software and medical inventory tracking. Required Certifications: ISO 27001. Requires B.Tech ERP developer.`
      }
    ],
    Manufacturing: [
      {
        title: "Supply and Commissioning of CNC Milling Machinery and metal lathe tooling setups",
        value: 15000000,
        eligibility: "Precision machine tool manufacturers and integration partners.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "CNC toolings engineer with 3+ years experience in automated mills",
        raw_text: `CNC milling machine and lathe tooling. Required Certifications: ISO 9001, MSME. Requires CNC toolings engineer.`
      },
      {
        title: "Fabrication and supply of plastic molding injection tools and metal stamping dies",
        value: 6800000,
        eligibility: "Die casting and plastic injection mold fabrication engineers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Die fabrication specialist with 4+ years experience",
        raw_text: `Plastic molding injection tools and stamping dies. Required Certifications: ISO 9001. Requires die fabrication specialist.`
      },
      {
        title: "Industrial packaging cartons, high-density wrapping films and safety boxes",
        value: 2800000,
        eligibility: "Industrial packing and corrugated box manufacturers.",
        certifications: ["MSME"],
        personnel_requirements: "Packaging quality controller with 2+ years experience",
        raw_text: `Corrugated cartons and wrapping films packaging. Required Certifications: MSME. Requires quality controller.`
      },
      {
        title: "Manufacture of customized machinery washers, bolts, nuts, and standard spacers",
        value: 1800000,
        eligibility: "Precision hardware components and fasteners manufacturers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Fastener assembly supervisor with 2+ years experience",
        raw_text: `Fasteners, washers, bolts and spacers manufacturing. Required Certifications: ISO 9001, MSME. Requires assembly supervisor.`
      },
      {
        title: "Integration and automation of assembly conveyor systems and smart sorting arms",
        value: 13000000,
        eligibility: "Industrial robotics and manufacturing assembly line integrators.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Mechatronics engineer with B.Tech and 3+ years experience",
        raw_text: `Conveyor belt systems and smart sorting arms. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech mechatronics engineer.`
      },
      {
        title: "Supply of copper welding electrodes, solder paste, and hardware fabrication rods",
        value: 2400000,
        eligibility: "Metal alloys and welding consumable distributors.",
        certifications: ["MSME"],
        personnel_requirements: "Materials quality inspector with 3+ years experience",
        raw_text: `Copper electrodes, solder paste, and fabrication hardware. Required Certifications: MSME. Requires quality inspector.`
      },
      {
        title: "Extrusion and casting of high-conductivity copper wires and raw aluminum alloy rods",
        value: 9500000,
        eligibility: "Wire drawing and metal alloy extrusion manufacturers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Metal extrusion specialist with 3+ years experience",
        raw_text: `Copper wire drawing and aluminum rods extrusion. Required Certifications: ISO 9001. Requires extrusion specialist.`
      },
      {
        title: "Industrial labels, barcode stickers, and high-temperature chemical containers printing",
        value: 1200000,
        eligibility: "Commercial printing and chemical packaging suppliers.",
        certifications: ["MSME"],
        personnel_requirements: "Label printing technician with 2+ years experience",
        raw_text: `Barcode stickers and chemical labels printing. Required Certifications: MSME. Requires printing technician.`
      },
      {
        title: "Compressed air pneumatic control valves, high-pressure hose pipes and cylinders",
        value: 7200000,
        eligibility: "Pneumatics and industrial control valve suppliers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Pneumatics field technician with 3+ years experience",
        raw_text: `Pneumatic control valves and cylinders. Required Certifications: ISO 9001, MSME. Requires pneumatics technician.`
      },
      {
        title: "Quality control inspection conveyors, load scales and automated weight sensors",
        value: 4800000,
        eligibility: "Industrial sensors and conveyor weighing systems manufacturers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Sensors calibration engineer with 3+ years experience",
        raw_text: `Conveyor weight sensors and load scales. Required Certifications: ISO 9001. Requires calibration engineer.`
      }
    ],
    Defence: [
      {
        title: "Supply of Lightweight Carbon-Fiber Composite Shells for DRDO Drone Platforms",
        value: 3800000,
        eligibility: "Open to security infrastructure or composite manufacturers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Quality assurance technician with 3+ years experience in composite carbon setups",
        raw_text: "DRDO active procurement for Lightweight Carbon-Fiber Composite Shells. Closing soon. Mandatory: ISO 9001, MSME. Requires technical team with composite technician experience.",
        confidence_score: 98
      },
      {
        title: "Avionics Cockpit Displays and Integration Cables for HAL Tejas Mk1A",
        value: 9500000,
        eligibility: "Aviation or defense electronics certified suppliers.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Avionics systems engineer with B.Tech and 3+ years experience in aerospace wiring",
        raw_text: "HAL Avionics Cockpit Displays procurement. Certification required: ISO 9001 and ISO 27001 mandatory. Staff must include B.Tech engineer.",
        confidence_score: 96
      },
      {
        title: "Procurement of High-Altitude Thermal Clothing and Border Patrol Gear",
        value: 6400000,
        eligibility: "Specialized cold weather tactical gear suppliers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Materials inspector with 3+ years experience in thermal apparel",
        raw_text: `Tactical cold clothing and patrol gear. Required Certifications: ISO 9001, MSME. Requires materials inspector.`
      },
      {
        title: "Advanced Night Vision Binoculars and Infrared Rangefinders for border outposts",
        value: 12000000,
        eligibility: "Defence optics and optical equipment manufacturers.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Optics assembly specialist with 4+ years experience",
        raw_text: `Night vision binoculars and rangefinders. Required Certifications: ISO 9001, ISO 27001. Requires optics specialist.`
      },
      {
        title: "Tactical radio communication encryption routers and cabin cabling modules",
        value: 8600000,
        eligibility: "Secure networking and defense communications developers.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Communications field engineer with B.Tech and 3+ years experience",
        raw_text: `Radio communication routers and encryption cabling. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech communications engineer.`
      },
      {
        title: "Repair and overhaul of MES staff accommodation quarters and electrical line network",
        value: 14000000,
        eligibility: "Military Engineering Services approved civil and electrical contractors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "MES electrical engineer with 3+ years experience",
        raw_text: `Overhaul of MES staff quarters and electrical line. Required Certifications: ISO 9001. Requires MES electrical engineer.`
      },
      {
        title: "Boundary fence security, guard booths, and automatic perimeter defense systems",
        value: 11000000,
        eligibility: "Registered security infrastructure and border fence builders.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Perimeter defense supervisor with 3+ years experience",
        raw_text: `Boundary security fence and guard booths construction. Required Certifications: ISO 9001, MSME. Requires defense supervisor.`
      },
      {
        title: "Artificer contract for barracks structural plastering and municipal drainage rebuild",
        value: 5800000,
        eligibility: "MES registered artificer works civil contractors.",
        certifications: ["MSME"],
        personnel_requirements: "Masonry civil supervisor with 2+ years experience in defense quarters",
        raw_text: `Artificer works structural plastering and drainage. Required Certifications: MSME. Requires civil supervisor.`
      },
      {
        title: "Load testing of heavy-duty EOT cranes and calibration at workshop premises",
        value: 3200000,
        eligibility: "Industrial cranes load testing and safety auditors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Cranes safety inspector with 3+ years experience",
        raw_text: `Load testing of EOT cranes. Required Certifications: ISO 9001. Requires cranes safety inspector.`
      },
      {
        title: "Centrifugal pump sets and LT starters for border outpost borewells",
        value: 2400000,
        eligibility: "Submersible pump set and electrical starter suppliers.",
        certifications: ["MSME"],
        personnel_requirements: "Borewells technician with 2+ years experience",
        raw_text: `Centrifugal pump sets and LT starters. Required Certifications: MSME. Requires borewells technician.`
      }
    ],
    Education: [
      {
        title: "Supply, testing and network cabling of Desktop Computers for College IT Labs",
        value: 7500000,
        eligibility: "Smart hardware and lab network setup vendors.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Network setup technician with 3+ years experience in desktop configuration",
        raw_text: `IT Lab PCs and network cabling. Required Certifications: ISO 9001, MSME. Requires network configuration technician.`
      },
      {
        title: "Smart classroom digital boards, interactive projectors and wi-fi routing system",
        value: 4800000,
        eligibility: "Interactive learning systems and AV hardware installers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "AV equipment specialist with 2+ years experience",
        raw_text: `Smart boards and interactive projectors cabling. Required Certifications: ISO 9001. Requires AV equipment specialist.`
      },
      {
        title: "Comprehensive Digital Library Management System and RFID Scanners supply",
        value: 3600000,
        eligibility: "Educational portal software developers and RFID equipment suppliers.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Database development engineer with B.Tech and library setup credentials",
        raw_text: `Library database system and RFID tags. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech database engineer.`
      },
      {
        title: "Outsourcing of student hostel security guards and campus surveillance CCTVs",
        value: 6200000,
        eligibility: "Registered security services agencies and campus safety integrators.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Campus security coordinator with 3+ years experience",
        raw_text: `Hostel security guard deployment and CCTV setup. Required Certifications: ISO 9001. Requires campus security coordinator.`
      },
      {
        title: "Supply of School Textbooks, academic course manuals, and stationery kits",
        value: 1800000,
        eligibility: "Government printing presses and textbook publishers.",
        certifications: ["MSME"],
        personnel_requirements: "Publishing quality controller with 2+ years experience",
        raw_text: `School textbooks and academic stationery supply. Required Certifications: MSME. Requires printing quality controller.`
      },
      {
        title: "Career counselling seminars, dynamic soft skills and job placement trainers outsourcing",
        value: 1200000,
        eligibility: "Corporate training and career counseling consultancies.",
        certifications: ["MSME"],
        personnel_requirements: "Soft skills trainer with 3+ years experience in university workshops",
        raw_text: `University placement counselling seminars. Required Certifications: MSME. Requires soft skills trainer.`
      },
      {
        title: "Online academic exam portal development, secure hosting and database servers",
        value: 5800000,
        eligibility: "Secure web assessment developers and cloud integration partners.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Assessment platform developer with B.Tech database credentials",
        raw_text: `Exam portal development and database secure hosting. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech developer.`
      },
      {
        title: "Supply of school classroom wooden desks, student benches and smart lecture podiums",
        value: 2900000,
        eligibility: "Educational furniture manufacturers and timber fabricators.",
        certifications: ["MSME"],
        personnel_requirements: "Biomedical assembly technician with 2+ years experience",
        raw_text: `Classroom desks, student benches, and podiums. Required Certifications: MSME. Requires assembly technician.`
      },
      {
        title: "Science labs chemistry storage cabinets, fume hoods and microscope supply kits",
        value: 3800000,
        eligibility: "Laboratory furniture and precision microscope manufacturers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Lab setup technician with 3+ years experience",
        raw_text: `Science lab fume hoods and chemical cabinets. Required Certifications: ISO 9001. Requires lab setup technician.`
      },
      {
        title: "School bus transport outsourcing services, dynamic routes and GPS system tracking",
        value: 9500000,
        eligibility: "School bus operators and fleet tracking logistics agencies.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Transport routes supervisor with 3+ years experience",
        raw_text: `School bus transit outsourcing and GPS logistics. Required Certifications: ISO 9001, MSME. Requires transport supervisor.`
      }
    ],
    Transport: [
      {
        title: "Automatic Train Protection (ATP) On-Board Electronic Modules and Cabin Cabling",
        value: 12000000,
        eligibility: "Railway signalling and electrical equipment suppliers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Signalling field engineer with 3+ years experience in traction controls",
        raw_text: "IREPS Railways active tender for ATP Cabin Modules and Cabling. ISO 9001 mandatory. Requires certified field engineer.",
        confidence_score: 97
      },
      {
        title: "NHAI Smart RFID Tolling Lanes and Vehicle Classification Controllers for Delhi-Mumbai Expressway",
        value: 15000000,
        eligibility: "Tollway infrastructure or network systems integrators.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Lead systems engineer with B.Tech and 2+ years experience in active lane sensors",
        raw_text: "NHAI active procurement for Delhi-Mumbai Expressway RFID tolling lane installations. Required Certifications: ISO 9001, ISO 27001. Requires lead systems engineer with B.Tech.",
        confidence_score: 99
      },
      {
        title: "Supply and Commissioning of Electric Passenger Buses for Airport Transport Link",
        value: 28000000,
        eligibility: "Electric vehicle manufacturers and transit fleet providers.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "EV systems engineer with B.Tech and 3+ years experience in high-voltage batteries",
        raw_text: `EV passenger buses for airport transit link. Required Certifications: ISO 9001, MSME. Requires B.Tech EV systems engineer.`
      },
      {
        title: "Metro Rail Signalling System Maintenance, integration and track software testing",
        value: 18000000,
        eligibility: "Metro rail systems and track engineering partners.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Signalling project engineer with B.Tech and 4+ years experience",
        raw_text: `Metro signaling and track software integration. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech signalling engineer.`
      },
      {
        title: "Manufacture and Supply of Improved Switch Expansion Joint for railway PSC Sleepers",
        value: 9500000,
        eligibility: "Approved railway track expansion joints suppliers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Rail track project engineer with 3+ years experience in expansion joints",
        raw_text: `SE Joint for rail PSC sleepers. Required Certifications: ISO 9001. Requires rail track project engineer.`
      },
      {
        title: "Solapur division railway track earthworks, geogrid method TFTR & TBR",
        value: 14000000,
        eligibility: "Railway civil and track geogrid construction contractors.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Geotechnical site engineer with 3+ years experience",
        raw_text: `Railway track earthworks and geogrid TFTR TBR. Required Certifications: ISO 9001, MSME. Requires geotechnical site engineer.`
      },
      {
        title: "Supply of road marker signs, reflective barricades, and rubber speed bumps",
        value: 1800000,
        eligibility: "Road safety equipment and traffic barrier manufacturers.",
        certifications: ["MSME"],
        personnel_requirements: "Quality safety inspector with 2+ years experience",
        raw_text: `Road markers, barricades, and rubber speed bumps. Required Certifications: MSME. Requires safety inspector.`
      },
      {
        title: "Cargo booking management portal, GPS container tracking and custom clearing software",
        value: 6200000,
        eligibility: "Logistics systems developers and secure web portal hosts.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Logistics systems developer with B.Tech credentials",
        raw_text: `Cargo booking system and GPS container tracking. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech developer.`
      },
      {
        title: "Port container crane structural inspection, load tests, and components overhaul AMC",
        value: 11000000,
        eligibility: "Approved cranes inspection and maritime port maintenance engineers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Port machinery engineer with 4+ years experience",
        raw_text: `AMC of container cranes and structural overload. Required Certifications: ISO 9001. Requires port machinery engineer.`
      },
      {
        title: "Airport flight avionics displays and flight control panel wiring integration cables",
        value: 13000000,
        eligibility: "Aero electronics and flight instruments certified suppliers.",
        certifications: ["ISO 9001", "ISO 27001"],
        personnel_requirements: "Flight avionics systems engineer with B.Tech credentials",
        raw_text: `Flight avionics displays and flight control panel. Required Certifications: ISO 9001, ISO 27001. Requires B.Tech avionics systems engineer.`
      }
    ],
    Services: [
      {
        title: "CAMC of IGBT based AC-AC Traction Control System LCC TCC including Mandatory and optional items for 39 HHP Diesel Locos at Diesel Loco Shed, New Gu...",
        value: 2195000,
        eligibility: "Industrial electronics and AC-AC traction control system service partners.",
        certifications: [],
        personnel_requirements: "Service technician with 2 years experience in traction system maintenance",
        raw_text: "Listed on GeM. Maintenance of IGBT traction system. Requires service technician.",
        confidence_score: 95
      },
      {
        title: "TENDER FOR PANTRY MANAGEMENT AND HOUSEKEEPING AT GUWAHATI OFFICE/1000456566/2026_BPCL_25349",
        value: 4800000,
        eligibility: "Corporate pantry services and housekeeping maintenance vendors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Pantry management supervisor with 2+ years experience in office setups",
        raw_text: "Housekeeping and pantry services. Required Certifications: ISO 9001. Requires pantry supervisor.",
        confidence_score: 95
      },
      {
        title: "Comprehensive Maintenance of 216 HP VRF ACs of Mittal Sports Complex, IIT Delhi",
        value: 5200000,
        eligibility: "Central AC maintenance and VRF compressor servicing vendors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "HVAC cooling technician with 3+ years experience",
        raw_text: "AMC of VRF air conditioners and cooling services. Required Certifications: ISO 9001. Requires cooling technician.",
        confidence_score: 95
      },
      {
        title: "CAMC of 500T Hydraulic Wheel Press for 03 Years (WS-65)/2026-AMV-CandW-Etender-22/89555928",
        value: 8900000,
        eligibility: "Heavy hydraulic press servicing and industrial AMC vendors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Hydraulic press service technician with 3+ years experience",
        raw_text: "AMC of hydraulic wheel press for 3 years. Required Certifications: ISO 9001. Requires hydraulic press service technician.",
        confidence_score: 95
      },
      {
        title: "Corporate office comprehensive facility management, housekeeping and physical security outsourcing",
        value: 9500000,
        eligibility: "Registered security agencies and facility management service providers.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Security and facilities supervisor with 3+ years experience",
        raw_text: `Facilities housekeeping and security guard outsourcing. Required Certifications: ISO 9001. Requires security supervisor.`
      },
      {
        title: "Corporate canteen catering, daily lunch supply, and pantry manager deployment",
        value: 3600000,
        eligibility: "Registered corporate catering and canteen service vendors.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Catering food safety coordinator with 2+ years experience",
        raw_text: `Catering service and pantry manager deployment. Required Certifications: ISO 9001, MSME. Requires food safety coordinator.`
      },
      {
        title: "Manpower outsourcing of skilled HVAC technicians, electricians and office administrators",
        value: 6200000,
        eligibility: "Manpower staffing and technical talent supply agencies.",
        certifications: ["ISO 9001", "MSME"],
        personnel_requirements: "Staffing coordinator with 3+ years experience",
        raw_text: `Electricians, technicians, and administrators staffing supply. Required Certifications: ISO 9001, MSME. Requires staffing coordinator.`
      },
      {
        title: "Laundry and linen dry cleaning services for government hostels and district hospitals",
        value: 2800000,
        eligibility: "Commercial laundry and linen cleaning service vendors.",
        certifications: ["ISO 9001"],
        personnel_requirements: "Laundry supervisor with 2+ years experience in clinical linen",
        raw_text: `Linen dry cleaning and commercial laundry service. Required Certifications: ISO 9001. Requires laundry supervisor.`
      },
      {
        title: "Pest control, sanitization, and deep cleaning services for university campus block",
        value: 1500000,
        eligibility: "Registered chemical pest control and deep cleaning providers.",
        certifications: ["MSME"],
        personnel_requirements: "Sanitization technician with 2+ years experience",
        raw_text: `Pest control, deep cleaning, and campus sanitization. Required Certifications: MSME. Requires sanitization technician.`
      },
      {
        title: "Gardening, landscaping, and indoor plant maintenance services for government office",
        value: 1200000,
        eligibility: "Horticulture, gardening and landscaping service partners.",
        certifications: ["MSME"],
        personnel_requirements: "Horticulture supervisor with 2+ years experience",
        raw_text: `Gardening and landscaping services. Required Certifications: MSME. Requires horticulture supervisor.`
      }
    ]
  };

  const selected = templates[sector] || [
    {
      title: `Supply and Installation of specialized ${sector} equipment at ${domain}`,
      value: null,
      eligibility: `Firms specializing in ${sector} equipment delivery.`,
      certifications: ["ISO 9001", "MSME"],
      personnel_requirements: `Technical lead with 3+ years experience in ${sector.toLowerCase()} projects`,
      raw_text: `Listed on ${portalUrl}. Dynamic sector scan active. Mandatory: ISO 9001. Technical lead required.`
    }
  ];

  // Map other dynamic fields (deadline, source, confidence)
  return selected.map((t, idx) => {
    // Generate a unique title per portal/domain
    const domainPart = domain.split('.')[0].toUpperCase();
    const uniqueSuffix = ` at ${domainPart}`;
    const cleanTitle = t.title.toLowerCase().endsWith(uniqueSuffix.toLowerCase()) 
      ? t.title 
      : `${t.title}${uniqueSuffix}`;

    return {
      title: cleanTitle,
      source: t.source || source,
      sector: sector,
      value: t.value,
      deadline: new Date(Date.now() + (12 + idx) * 24 * 60 * 60 * 1000).toISOString(),
      eligibility: t.eligibility || `Firms specializing in ${sector} project delivery.`,
      certifications: t.certifications || ["ISO 9001", "MSME"],
      personnel_requirements: t.personnel_requirements || `Technical supervisor with 3+ years experience`,
      raw_text: t.raw_text || `Listed on ${portalUrl}. Dynamic sector scan active. Mandatory: ISO 9001. Technical lead required.`,
      confidence_score: t.confidence_score || 95,
      url: portalUrl
    };
  });
}

export async function scanPortal(portalUrl: string, sector: string): Promise<void> {
  console.warn(`[Scanner] ${portalUrl} is configured for ${sector}, but no verified scraper exists for it. No tender was created.`);
}
