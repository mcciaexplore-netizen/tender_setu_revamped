import { Router } from 'express';
import axios from 'axios';
import { requireAuth } from '../middleware/auth';

const router = Router();
const ALLOWED_PDF_HOSTS = new Set([
  'eprocure.gov.in',
  'gem.gov.in',
  'bidplus.gem.gov.in',
  'www.aiims.edu',
  'home.iitd.ac.in',
  'www.cdac.in',
]);

router.use(requireAuth);

// GET /api/proxy/pdf?url=...
router.get('/pdf', async (req, res) => {
  const targetUrl = req.query.url as string;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'url must be a valid HTTPS URL.' });
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || !ALLOWED_PDF_HOSTS.has(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'The requested document host is not allowed.' });
  }

  try {
    const response = await axios.get(parsedUrl.toString(), {
      responseType: 'stream',
      maxRedirects: 0,
      timeout: 10_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': parsedUrl.hostname.endsWith('gem.gov.in') ? 'https://gem.gov.in/cppp' : undefined,
        'Connection': 'keep-alive'
      }
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !String(contentType).toLowerCase().includes('pdf')) {
      response.data.destroy();
      return res.status(422).json({ error: 'The allowed host did not return a PDF document.' });
    }
    res.setHeader('Content-Type', String(contentType));
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      res.setHeader('Content-Disposition', String(contentDisposition));
    }

    response.data.pipe(res);
  } catch (error: any) {
    console.error('PDF proxy error:', error.message);
    res.status(502).json({ error: 'Unable to fetch the requested PDF.' });
  }
});

export default router;
