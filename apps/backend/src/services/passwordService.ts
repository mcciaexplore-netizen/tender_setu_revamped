import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derivedKey = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, encodedKey] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !encodedKey) return false;

  const expectedKey = Buffer.from(encodedKey, 'base64url');
  const derivedKey = await scrypt(password, salt, expectedKey.length) as Buffer;
  return expectedKey.length === derivedKey.length && crypto.timingSafeEqual(expectedKey, derivedKey);
}
