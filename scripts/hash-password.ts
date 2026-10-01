/**
 * Prints the hash for a sign-in password (src/config/accounts.ts keeps only hashes).
 *
 *   npm run hash-password -- "new password"
 *
 * Paste the output as the account's passwordHash, then deploy. Use 12 or more characters.
 */
import { hashPassword } from '../src/lib/passwords';

const password = process.argv.slice(2).join(' ');
if (password.length < 12) {
  console.error('Usage: npm run hash-password -- "a password of 12 or more characters"');
  process.exit(1);
}
hashPassword(password).then((hash) => console.log(hash));
