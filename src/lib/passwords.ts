/**
 * Password hashes for the demo sign-in (src/config/accounts.ts): scrypt with a random salt, stored as
 * `scrypt$<salt>$<hash>` (base64url). Only hashes are kept; `npm run hash-password -- "<password>"` makes one.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, length, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await derive(password, salt, KEY_LENGTH)).toString('base64url')}`;
}

/** Constant-time comparison; false for a malformed hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length === 0) return false;
  const actual = await derive(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}
