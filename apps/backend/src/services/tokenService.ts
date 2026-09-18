import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'owner' | 'admin' | 'bid_manager' | 'viewer';

export interface AuthTokenPayload {
  user_id: string;
  company_id: string;
  role: UserRole;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
