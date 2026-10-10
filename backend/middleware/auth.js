import { JWT_SECRET } from '../config/jwt.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });



export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant ou invalide.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.purpose) return res.status(401).json({ message: 'Token invalide.' });
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expiré.' });
  }
}

export function verifyAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
    }
    next();
  });
}