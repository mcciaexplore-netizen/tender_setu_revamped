import { NextFunction, Request, Response } from 'express';
import { query } from '../utils/db';
import { AuthTokenPayload, verifyAccessToken } from '../services/tokenService';

export type AuthenticatedRequest = Request & { auth?: AuthTokenPayload };

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication is required.' });
    return;
  }

  try {
    req.auth = verifyAccessToken(authorization.slice('Bearer '.length));
    next();
  } catch {
    res.status(401).json({ error: 'Your session is invalid or has expired.' });
  }
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  requireAuth(req, res, async () => {
    try {
      const { rows } = await query(
        'SELECT role, is_active FROM company_users WHERE id = $1 AND company_id = $2',
        [req.auth!.user_id, req.auth!.company_id],
      );
      const user = rows[0];
      if (!user?.is_active || user.role !== 'admin') {
        res.status(403).json({ error: 'Administrator access is required.' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });
}
