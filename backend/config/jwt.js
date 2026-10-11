import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
export function validateJwtSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || /^(change_this_secret|your[_-]?secret)/i.test(secret)) {
    throw new Error('JWT_SECRET must be a secure random secret of at least 32 bytes.');
  }
  return secret;
}
export const JWT_SECRET = validateJwtSecret(process.env.JWT_SECRET);
