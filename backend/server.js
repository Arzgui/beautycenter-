import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import bookingsRoutes from './routes/bookings.js';
import adminDashboardRoutes from './routes/admin/dashboard.js';
import usersAdminRoutes from './routes/admin/clients.js';
import adminBookingsRoutes from './routes/admin/bookings.js';
import schedulesAdminRoutes from './routes/admin/schedules.js';
import remindersRoutes from './routes/reminders.js';
import notificationsRoutes from './routes/notifications.js';
import { initializeDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { verifyToken, verifyAdmin } from './middleware/auth.js';
import invitationsAdminRoutes from './routes/admin/invitations.js';


// Configuration des variables d'environnement
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 4000;

// Configuration des origines CORS autorisées
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:4000'];

// Alerte de sécurité JWT
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_secret') {
  console.warn('⚠️  JWT_SECRET n’est pas défini ou utilise une valeur par défaut. Définissez une valeur forte dans .env.');
}

// À laisser à 1 si tu es derrière un reverse proxy (Heroku, Render, AWS, Nginx, Cloudflare)
app.set('trust proxy', 1);

// Configuration de base de Helmet (sans la CSP par défaut qu'on gère manuellement)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false, 
}));

// Middleware pour la Content Security Policy (CSP) globale (index.html et assets)
app.use((req, res, next) => {
  // On ignore la route admin car elle a sa propre CSP dédiée plus bas
  if (req.path === '/admin.html') return next();

  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://cdnjs.cloudflare.com; " +
    "style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://api.brevo.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "object-src 'none';"
  );
  next();
});

// Configuration du CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Origin non autorisé'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Parsing des requêtes avec limitation de taille (Protection contre les DoS)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Gestion du cache pour les fichiers de l'application (Optimisé pour Service Worker / PWA)
app.use((req, res, next) => {
  if (req.path.match(/\.(js|css|html)$/)) {
    // Changement de no-store à no-cache pour permettre au Service Worker de gérer les assets en mode hors-ligne
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

app.get('/espace-client.html', (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
    "connect-src 'self';"
  );
  res.sendFile(path.join(publicDir, 'espace-client.html'));
});

app.get('/compte.html', (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
    "connect-src 'self';"
  );
  res.sendFile(path.join(publicDir, 'compte.html'));
});

app.get('/reset-password.html', (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
    "connect-src 'self';"
  );
  res.sendFile(path.join(publicDir, 'reset-password.html'));
});

// Route dédiée pour l'interface Admin avec sa propre CSP
// Remplace ton ancienne route /admin.html par celle-ci :
app.get('/admin.html', (req, res) => {
  res.setHeader('Content-Security-Policy', 
    "default-src 'self' https://cdnjs.cloudflare.com; " +
    // script-src : on autorise le domaine de confiance, les scripts en ligne via le hash Chrome, et unsafe-inline par sécurité
    "script-src 'self' 'unsafe-inline' 'unsafe-hashes' https://cdnjs.cloudflare.com 'sha256-ZggTPWs/X/BAG2zH3Wcfvw0VoPr0Ax3MwomYcnDtmRc='; " +
    // script-src-attr : permet d'autoriser les événements inline comme onclick="..."
    "script-src-attr 'unsafe-inline'; " +
    "style-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; " +
    "font-src 'self' https://cdnjs.cloudflare.com data:;"
  );
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Serveur de fichiers statiques (Le dossier public)
app.use(express.static(publicDir, { index: false }));

// Limitation globale des requêtes (Rate Limiting)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // 120 requêtes max par IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Initialisation de la base de données
await initializeDatabase();

// Déclaration des routes de l'API
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/notifications', notificationsRoutes);

// ...
app.use('/api/admin/dashboard', verifyAdmin, adminDashboardRoutes);
app.use('/api/admin/clients', verifyAdmin, usersAdminRoutes);
app.use('/api/admin/bookings', verifyAdmin, adminBookingsRoutes);
app.use('/api/admin/schedules', verifyAdmin, schedulesAdminRoutes);
app.use('/api/admin/invitations', verifyAdmin, invitationsAdminRoutes);



// Route Catch-All pour les Single Page Applications (SPA)
// Corrigée pour ne pas intercepter le service-worker.js, le manifest ou les images
app.get('*', (req, res, next) => {
  // Si ce n'est pas un GET, ou si c'est l'API, ou si la route contient un point (ex: /service-worker.js, /manifest.json)
  // On passe la main au middleware suivant (express.static ou 404)
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }
  // Sinon, c'est une route de navigation classique (ex: /booking, /profile), on sert index.html
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Gestionnaire d'erreurs global (Middleware final)
app.use(errorHandler);

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`IS Beauty backend démarré sur http://localhost:${PORT}`);
});