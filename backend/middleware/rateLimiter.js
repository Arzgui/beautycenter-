import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { message: 'Trop de tentatives. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configuration attempts must not exhaust the login/OTP budget on the same IP.
export const authSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { message: 'Trop de tentatives. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});
