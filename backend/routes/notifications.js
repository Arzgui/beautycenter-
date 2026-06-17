import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { db } from '../config/database.js';
import { getVapidPublicKey } from '../utils/push.js';

const router = express.Router();

// Rate limiting : 10 abonnements max par IP toutes les 15 minutes
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Trop de requêtes, veuillez réessayer plus tard.' },
});

// ─── Validation ───────────────────────────────────────────────────────────────

const subscribeValidation = [
  body('subscription').isObject().withMessage('subscription doit être un objet.'),
  body('subscription.endpoint').isURL().withMessage('endpoint doit être une URL valide.'),
  body('subscription.keys.p256dh').notEmpty().withMessage('Clé p256dh manquante.'),
  body('subscription.keys.auth').notEmpty().withMessage('Clé auth manquante.'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Email invalide.'),
];

const unsubscribeValidation = [
  body('endpoint').isURL().withMessage('endpoint doit être une URL valide.'),
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/subscribe', subscribeLimiter, subscribeValidation, async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { subscription, email } = req.body;
    const subscriptionString = JSON.stringify(subscription);
    const endpoint = subscription.endpoint;
    const now = new Date().toISOString();

    // Préserve createdAt si l'endpoint existe déjà
    await db.run(
      `INSERT INTO push_subscriptions (endpoint, subscription, email, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         subscription = excluded.subscription,
         email        = excluded.email,
         updatedAt    = excluded.updatedAt`,
      endpoint,
      subscriptionString,
      email || null,
      now,
      now
    );

    res.status(201).json({ message: 'Abonnement push enregistré.' });
  } catch (error) {
    next(error);
  }
});

router.post('/unsubscribe', unsubscribeValidation, async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const { endpoint } = req.body;
    const result = await db.run(
      'DELETE FROM push_subscriptions WHERE endpoint = ?',
      endpoint
    );

    // Distingue "supprimé" de "introuvable"
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Abonnement introuvable.' });
    }

    res.json({ message: 'Abonnement push supprimé.' });
  } catch (error) {
    next(error);
  }
});

export default router;