import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { db } from "../config/database.js";
import dotenv from "dotenv";
import { authLimiter } from "../middleware/rateLimiter.js";
import { verifyToken } from "../middleware/auth.js";
import { sendBrevoEmail } from "../utils/brevo.js";

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const SITE_URL = process.env.SITE_URL || "http://localhost:4000";

// ── REGISTER ──
router.post(
  "/register",
  authLimiter,
  body("email").isEmail(),
  body("password").isLength({ min: 10 }),
  body("name").trim().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { email, password, name } = req.body;
      const existingUser = await db.get(
        "SELECT id FROM users WHERE email = ?",
        email,
      );
      if (existingUser)
        return res.status(409).json({ message: "Email déjà utilisé." });
      const passwordHash = await bcrypt.hash(password, 12);
      const id = uuidv4();
      const createdAt = new Date().toISOString();
      const emailVerificationToken = uuidv4();
      await db.run(
        "INSERT INTO users (id, email, passwordHash, name, createdAt, emailVerificationToken) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        email,
        passwordHash,
        name,
        createdAt,
        emailVerificationToken,
      );

      const verifyUrl = `${process.env.SITE_URL || "http://localhost:4000"}/verifier-email.html?token=${emailVerificationToken}`;
      try {
        await sendBrevoEmail(
          email,
          "Confirmez votre adresse email — IS Beauty",
          `<p>Bonjour ${name},</p><p>Merci de votre inscription chez IS Beauty.</p><p>Pour confirmer votre adresse email, cliquez sur le lien ci-dessous :</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#B6F4FF;color:#070B14;font-weight:700;border-radius:8px;text-decoration:none">Confirmer mon email</a></p>`,
          `Bonjour ${name},\nMerci de votre inscription chez IS Beauty.\nPour confirmer votre adresse email, cliquez sur ce lien : ${verifyUrl}`,
        );
      } catch (emailError) {
        console.warn(
          "Erreur Brevo email (verification):",
          emailError.message || emailError,
        );
      }

      res.status(201).json({ message: "Compte créé avec succès." });
    } catch (error) {
      next(error);
    }
  },
);

// ── LOGIN ──
router.post(
  "/login",
  authLimiter,
  body("email").isEmail(),
  body("password").isString().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const user = await db.get("SELECT * FROM users WHERE email = ?", email);
      if (!user)
        return res.status(401).json({ message: "Identifiants invalides." });

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch)
        return res.status(401).json({ message: "Identifiants invalides." });

      if (user.twoFactorEnabled) {
        return res
          .status(200)
          .json({ twoFactorRequired: true, userId: user.id });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          points: user.points,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── LOGIN 2FA ──
router.post(
  "/login/2fa",
  authLimiter,
  body("userId").isUUID(),
  body("token").isString().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { userId, token } = req.body;
      const user = await db.get("SELECT * FROM users WHERE id = ?", userId);
      if (!user || !user.twoFactorEnabled)
        return res
          .status(401)
          .json({ message: "Utilisateur introuvable ou 2FA non configuré." });

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token,
        window: 1,
      });

      if (!verified)
        return res.status(401).json({ message: "Code 2FA invalide." });

      const authToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
      );

      res.json({
        token: authToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          points: user.points,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── VERIFY EMAIL ──
router.post(
  '/verify-email',
  body('token').isUUID(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { token } = req.body;
      const user = await db.get('SELECT * FROM users WHERE emailVerificationToken = ?', token);

      if (!user) {
        return res.status(404).json({ message: 'Lien de vérification invalide ou déjà utilisé.' });
      }

      if (user.emailVerified) {
        return res.status(409).json({ message: 'Cet email est déjà vérifié.' });
      }

      await db.run(
        'UPDATE users SET emailVerified = 1, emailVerificationToken = NULL WHERE id = ?',
        user.id
      );

      res.json({ message: 'Email vérifié avec succès.' });
    } catch (error) {
      next(error);
    }
  }
);

// ── RESEND VERIFICATION ──
router.post(
  '/resend-verification',
  authLimiter,
  body('email').isEmail(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email } = req.body;
      const user = await db.get('SELECT * FROM users WHERE email = ?', email);

      // Toujours répondre OK pour ne pas révéler si l'email existe
      if (!user || user.emailVerified) {
        return res.json({ message: 'Si ce compte existe et n\'est pas encore vérifié, un email a été envoyé.' });
      }

      const emailVerificationToken = uuidv4();
      await db.run('UPDATE users SET emailVerificationToken = ? WHERE id = ?', emailVerificationToken, user.id);

      const verifyUrl = `${process.env.SITE_URL || 'http://localhost:4000'}/verifier-email.html?token=${emailVerificationToken}`;
      try {
        await sendBrevoEmail(
          email,
          'Confirmez votre adresse email — IS Beauty',
          `<p>Bonjour ${user.name},</p><p>Voici un nouveau lien pour confirmer votre adresse email :</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#B6F4FF;color:#070B14;font-weight:700;border-radius:8px;text-decoration:none">Confirmer mon email</a></p>`,
          `Bonjour ${user.name},\nVoici un nouveau lien pour confirmer votre adresse email : ${verifyUrl}`
        );
      } catch (emailError) {
        console.warn('Erreur Brevo email (resend verification):', emailError.message || emailError);
      }

      res.json({ message: 'Si ce compte existe et n\'est pas encore vérifié, un email a été envoyé.' });
    } catch (error) {
      next(error);
    }
  }
);

// ── 2FA SETUP ──
router.post("/2fa/setup", verifyToken, async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `IS Beauty (${req.user.email})`,
    });
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    await db.run(
      "UPDATE users SET twoFactorSecret = ? WHERE id = ?",
      secret.base32,
      req.user.id,
    );
    res.json({ qrCodeUrl, secret: secret.base32 });
  } catch (error) {
    next(error);
  }
});

// ── 2FA ENABLE ──
router.post(
  "/2fa/enable",
  verifyToken,
  body("token").isString().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const user = await db.get(
        "SELECT * FROM users WHERE id = ?",
        req.user.id,
      );
      if (!user?.twoFactorSecret)
        return res.status(400).json({ message: "2FA non configuré." });

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: req.body.token,
        window: 1,
      });
      if (!verified)
        return res.status(401).json({ message: "Code 2FA invalide." });

      await db.run(
        "UPDATE users SET twoFactorEnabled = 1 WHERE id = ?",
        req.user.id,
      );
      res.json({ message: "2FA activé." });
    } catch (error) {
      next(error);
    }
  },
);

// ── ME ──
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await db.get('SELECT id, email, name, points, role, twoFactorEnabled, emailVerified FROM users WHERE id = ?', req.user.id);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// ── CHANGE PASSWORD ──
router.patch(
  "/password",
  verifyToken,
  body("currentPassword").isString().notEmpty(),
  body("newPassword").isLength({ min: 10 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { currentPassword, newPassword } = req.body;
      const user = await db.get(
        "SELECT * FROM users WHERE id = ?",
        req.user.id,
      );
      if (!user)
        return res.status(404).json({ message: "Utilisateur introuvable." });

      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match)
        return res
          .status(401)
          .json({ message: "Mot de passe actuel incorrect." });

      const newHash = await bcrypt.hash(newPassword, 12);
      await db.run(
        "UPDATE users SET passwordHash = ? WHERE id = ?",
        newHash,
        user.id,
      );

      res.json({ message: "Mot de passe mis à jour." });
    } catch (error) {
      next(error);
    }
  },
);

// ── UPDATE PROFILE ──
router.patch(
  "/profile",
  verifyToken,
  body("name").trim().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { name } = req.body;
      await db.run("UPDATE users SET name = ? WHERE id = ?", name, req.user.id);
      const user = await db.get(
        "SELECT id, email, name, points, role FROM users WHERE id = ?",
        req.user.id,
      );
      res.json({ message: "Profil mis à jour.", user });
    } catch (error) {
      next(error);
    }
  },
);

// ── FORGOT PASSWORD ──
router.post(
  "/forgot-password",
  authLimiter,
  body("email").isEmail(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { email } = req.body;
      const user = await db.get(
        "SELECT id, name FROM users WHERE email = ?",
        email,
      );

      // Toujours répondre OK pour ne pas révéler si l'email existe
      if (!user)
        return res.json({
          message: "Si cet email existe, un lien a été envoyé.",
        });

      const resetToken = uuidv4();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

      await db.run("DELETE FROM password_resets WHERE email = ?", email);
      await db.run(
        "INSERT INTO password_resets (id, email, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
        uuidv4(),
        email,
        resetToken,
        expiresAt,
        new Date().toISOString(),
      );

      const resetUrl = `${SITE_URL}/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;

      await sendBrevoEmail(
        email,
        "Réinitialisation de votre mot de passe IS Beauty",
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#070B14;color:#DCE6F2;padding:40px;border-radius:12px;border:1px solid rgba(26,236,255,0.12)">
          <h1 style="font-size:22px;color:#fff;margin-bottom:8px">Réinitialisation du mot de passe</h1>
          <p style="color:#7488A3;margin-bottom:24px">Bonjour ${user.name},</p>
          <p style="margin-bottom:24px">Vous avez demandé la réinitialisation de votre mot de passe. Ce lien est valable <strong style="color:#B6F4FF">15 minutes</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:#B6F4FF;color:#070B14;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;border-radius:8px;text-decoration:none">
            Réinitialiser mon mot de passe
          </a>
          <p style="margin-top:32px;font-size:12px;color:#7488A3">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
          <p style="font-size:12px;color:#7488A3">IS Beauty — Épilation Médico Laser ICE — Forbach</p>
        </div>`,
      );

      res.json({ message: "Si cet email existe, un lien a été envoyé." });
    } catch (error) {
      next(error);
    }
  },
);

// ── RESET PASSWORD ──
router.post(
  "/reset-password",
  authLimiter,
  body("token").isUUID(),
  body("email").isEmail(),
  body("newPassword").isLength({ min: 10 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { token, email, newPassword } = req.body;

      const reset = await db.get(
        "SELECT * FROM password_resets WHERE token = ? AND email = ?",
        token,
        email,
      );

      if (!reset)
        return res.status(400).json({ message: "Lien invalide ou expiré." });
      if (new Date(reset.expiresAt) < new Date()) {
        await db.run("DELETE FROM password_resets WHERE token = ?", token);
        return res
          .status(400)
          .json({ message: "Ce lien a expiré. Faites une nouvelle demande." });
      }

      const user = await db.get("SELECT id FROM users WHERE email = ?", email);
      if (!user)
        return res.status(404).json({ message: "Utilisateur introuvable." });

      const newHash = await bcrypt.hash(newPassword, 12);
      await db.run(
        "UPDATE users SET passwordHash = ? WHERE id = ?",
        newHash,
        user.id,
      );
      await db.run("DELETE FROM password_resets WHERE token = ?", token);

      res.json({ message: "Mot de passe réinitialisé avec succès." });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
