# Installation et exploitation — procédure non exécutée

11 octobre 2026. Complète DEPLOYMENT_RUNBOOK.md. Aucun secret utilisable inclus. Ces exemples visent un serveur Linux systemd avec un seul processus Node et un reverse proxy Nginx ; adapter explicitement les chemins/utilisateurs à l'environnement réel. Aucun accès au VPS réalisé.

## Dépendances qualifiées

Voir [DEPENDENCY_REMEDIATION.md](DEPENDENCY_REMEDIATION.md) : Node 22.15.0 testé, bcrypt 6.0.0, sqlite3 6.0.1 (SQLite 3.52.0), UUID 14.0.3, tar 7.5.22 dans package-lock.json. Utiliser npm ci et le verrouillage versionné, puis npm audit --omit=dev avant mise en ligne. Ne pas recopier node_modules de Windows sur Linux : installer les binaires natifs sur la plateforme cible. Le test Linux de CI ne remplace pas la qualification de l'architecture/libc du serveur. Aucun nouveau paramètre ni aucune migration de schéma applicatif pour cette mise à jour. sqlite3 étant archivé, faire valider explicitement cette exception de maintenance et prévoir le remplacement du pilote ; audit à zéro ne signifie pas maintenance garantie.

## Configuration obligatoire

Conserver les secrets hors du dépôt, par exemple `/etc/isbeauty/backend.env`, lisible uniquement par root et l'utilisateur de service (0640), répertoire 0750. Ne jamais publier ce fichier, les bases, WAL/SHM ou sauvegardes. Le serveur doit servir les fichiers à travers Express ; ne pas exposer le dépôt entier avec une directive root Nginx indépendante des protections Express.

| Variable | Valeur/contrainte de production |
| --- | --- |
| NODE_ENV | production, également forcé par l'unité systemd fournie ; indispensable au refus de migration automatique |
| DOTENV_CONFIG_PATH | chemin du fichier protégé, identique pour serveur et outils |
| DATABASE_FILE | chemin absolu hors dépôt, p. ex. /var/lib/isbeauty/database.sqlite |
| JWT_SECRET | secret aléatoire >=32 octets, aucun secours ; génération locale par l'opérateur, jamais commité |
| JWT_EXPIRES_IN | facultatif, défaut 1h ; fixer une durée explicite compatible avec les parcours |
| SITE_URL | origine HTTPS exacte sans slash final, p. ex. https://votre-domaine ; utilisée pour tous les liens email |
| CORS_ORIGINS | liste d'origines HTTPS exactes séparées par virgules, incluant SITE_URL ; aucun wildcard/chemin/localhost en production |
| HOST / PORT | 127.0.0.1 / 4000 derrière Nginx ; aucune exposition publique directe du backend |
| TRUST_PROXY | 1 derrière un seul proxy ; entier 0–5. Ne pas accepter les en-têtes de proxy depuis un client direct |
| BREVO_API_KEY | clé réelle protégée ; requise pour la vérification email/reset/invitations |
| BREVO_SENDER_EMAIL / BREVO_SENDER_NAME | expéditeur autorisé et nom ; vérifier SPF/DKIM et envoi réel vers un destinataire de test autorisé |
| VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT | paire stable protégée, sujet mailto: ou HTTPS valide. Requis en production pour éviter les clés temporaires à chaque redémarrage |
| BACKUP_DIRECTORY | chemin absolu hors dépôt, p. ex. /var/backups/isbeauty, accès 0700, sauvegardes 0600 |

SMS facultatifs : BREVO_SMS_SENDER avec Brevo, ou TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER ensemble. Sans SMS, l'email reste le canal de rappel. ONESIGNAL_APP_ID/API_KEY et AIRTABLE_API_KEY/BASE_ID/TABLE_NAME restent des intégrations facultatives ; n'activer que les fournisseurs utilisés. L'absence de SMS n'empêche pas une réservation. La configuration vérifie présence/format, pas la validité distante des clés ni la livraison.

L'opérateur peut générer JWT_SECRET dans son gestionnaire de secrets avec `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Pour VAPID, utiliser localement `node --input-type=module -e "import webpush from 'web-push'; console.log(webpush.generateVAPIDKeys())"` après installation. Ne jamais exécuter ces commandes dans une CI publique ni copier leurs sorties dans un rapport. Aucune génération réelle faite par cette intervention.

## Installation et validation avant ouverture

1. Choisir le commit approuvé, Node 22 correspondant à la CI et npm. Déployer le code dans /srv/is-beauty, propriété d'un compte de déploiement distinct ; l'utilisateur isbeauty doit pouvoir le lire mais pas le modifier. Installer les dépendances natives SQLite/bcrypt requises par l'hôte si aucune distribution binaire n'est disponible (outils de compilation/Python adaptés au système).
2. Depuis backend, dans un environnement de test isolé : `npm ci`, `npm test -- --silent`, `node tests/production-startup.mjs`, puis `node tests/browser-smoke.mjs` si Chrome est installé (CHROME_PATH configurable). Auditer aussi `npm audit --omit=dev` et traiter les alertes bloquantes avant production. Ces outils utilisent des bases et identifiants synthétiques ; ils ne valident pas l'hôte réel.
3. Pour le runtime approuvé : `npm ci --omit=dev`. Ce sont les versions du lockfile, pas un npm install libre. Conserver le fichier d'environnement séparément. Ne pas exécuter npm audit fix --force lors du déploiement.
4. Préparer les répertoires /var/lib/isbeauty et /var/backups/isbeauty, accessibles à isbeauty seulement, et le fichier d'environnement protégé. Base et sauvegardes hors arbre web. Aucune suppression ou réinitialisation nécessaire, même pour des données de test existantes.

## Création initiale ou migration

Avec l'application arrêtée et les variables prévues, depuis backend :

```sh
NODE_ENV=production DOTENV_CONFIG_PATH=/etc/isbeauty/backend.env \
  node scripts/migrate.js --approve-production-migration=2026-10-booking-v2
```

L'accord humain doit précéder cette commande. Elle crée une base absente ou migre une base existante dans une transaction versionnée ; un serveur normal en production ne le fait jamais. Pour une base existante, sauvegarde cohérente et essai sur copie sont obligatoires. Contrôler intégrité, clés étrangères, prestations, nombre de lignes et soldes avant/après ; relancer sur copie pour l'idempotence. Ne pas modifier automatiquement les anciennes données en conflit. `npm run db:migrate -- --approve-production-migration=2026-10-booking-v2` est l'alias disponible.

## Premier administrateur, sans mot de passe par défaut

1. L'opérateur inscrit son propre compte via compte.html avec un mot de passe unique et confirme son adresse via l'email reçu. Tester la connexion ; ne pas utiliser l'adresse d'un tiers.
2. Après accord, depuis l'hôte autorisé, avec DATABASE_FILE configuré et base déjà migrée :

```sh
NODE_ENV=production DOTENV_CONFIG_PATH=/etc/isbeauty/backend.env \
  node scripts/first-admin.js --approve-first-admin --email=ADRESSE_VERIFIEE
```

Cette commande ne crée ni compte, ni mot de passe, ni secret. Elle exige exactement un compte vérifié correspondant, refuse si un admin existe et promeut atomiquement ce compte. Les sessions/challenges antérieurs sont invalidés ; se reconnecter sur admin.html. Aucun droit admin n'est accepté via l'inscription publique.

3. Configurer la 2FA depuis une session HTTPS de confiance avec POST /api/auth/2fa/setup et Authorization: Bearer de la session admin, afficher le qrCodeUrl retourné localement, scanner avec l'application TOTP, puis POST /api/auth/2fa/enable avec le code courant (`{"token":"123456"}` est un exemple non utilisable). Les interfaces savent demander le code au login, mais ne fournissent pas encore d'écran de configuration QR : utiliser un client API local de confiance, sans exporter token/secret vers un service tiers. Tester une nouvelle connexion et un code incorrect avant ouverture. Le QR/secret doit rester dans le coffre de l'opérateur, jamais dans Git/logs. Pas de procédure de récupération 2FA en libre-service ; documenter une intervention opérateur contrôlée avant d'activer une 2FA sans sauvegarde du secret.

## HTTPS, démarrage et mises à jour

Les fichiers dans docs/deployment sont des modèles non installés. Obtenir un certificat réel pour le domaine, adapter nginx.conf.example et vérifier `nginx -t` avant reload. Nginx redirige HTTP vers HTTPS et écrase les en-têtes proxy entrants ; Node reste en loopback. Valider la chaîne de certificat, expiration/renouvellement, DNS, pare-feu et origine CORS sur le vrai domaine. Le nombre de proxies doit correspondre à TRUST_PROXY.

Après approbation, installer isbeauty.service dans /etc/systemd/system et lancer `systemctl daemon-reload`, puis `systemctl start isbeauty`. `npm start` avec le même environnement reste possible pour un contrôle manuel, sans lancer simultanément le service. Maintenir un seul processus : chaque serveur démarre son scheduler. Ne pas démarrer un cluster PM2 parallèle. Pour activer au reboot après validation : `systemctl enable isbeauty`.

Le Service Worker v5 utilise le réseau en priorité pour HTML/JS/CSS et les API ne sont pas mises en cache. Ses anciens caches propres sont supprimés, les autres conservés. Chaque future version d'assets cachés doit incrémenter CACHE_NAME. Vérifier après déploiement le script service-worker.js non caché à long terme, l'activation et les pages après rechargement d'un onglet existant. Aucun rechargement forcé d'un formulaire en cours. Une PWA réellement installée sur iOS/Android reste à tester.

## Sauvegarde automatique et restauration

```sh
DOTENV_CONFIG_PATH=/etc/isbeauty/backend.env node scripts/backup.js
# Restauration d'essai vers un NOUVEAU fichier, aucun écrasement :
node scripts/backup.js --source=/var/backups/isbeauty/SAUVEGARDE.sqlite \
  --output=/var/lib/isbeauty/restored-UNIQUE.sqlite
```

Le snapshot utilise SQLite VACUUM INTO en lecture de la source, y compris les pages WAL validées, puis integrity_check et foreign_key_check. Le fichier cible est réservé exclusivement (0600) ; un nom existant est refusé. Une erreur laisse l'éventuel fichier partiel pour diagnostic : ne jamais le restaurer. Pas de copie brute d'une base active, pas de suppression automatique. `npm run db:backup` est l'alias disponible.

Installer les modèles isbeauty-backup.service/timer après vérification des chemins et permissions, puis `systemctl daemon-reload` et `systemctl enable --now isbeauty-backup.timer`. Sauvegarde horaire avec rattrapage systemd au redémarrage. Vérifier `systemctl list-timers isbeauty-backup.timer` et `journalctl -u isbeauty-backup.service` ; superviser code de sortie, âge du dernier snapshot et espace libre. Ajouter une alerte d'échec dans l'outil de supervision réel. Copier les snapshots chiffrés vers un stockage externe au serveur avec accès restreint. Politique de rétention à approuver ; aucun purgeur fourni pour éviter toute suppression non autorisée.

Tester périodiquement la restauration vers un nouveau chemin et un serveur isolé, jamais vers le fichier vivant. Les snapshots contiennent identités, hashes, secrets TOTP et sessions de configuration : même niveau de protection que la base. Fréquence horaire = jusqu'à une heure de données perdues en cas de sinistre ; ajuster ce RPO et mesurer le temps de restauration. La volumétrie réelle et les temps de snapshot restent inconnus.

## Contrôles après mise en ligne

- Domaine HTTPS, redirection HTTP, certificat, CORS autorisé/refusé, absence d'accès direct au port Node. /backend, fichiers .env, Git et snapshots : 404 ; absence de token/secret dans les réponses ou logs publics.
- GET /api/bookings/services et availability : 200, no-store. HTML/JS/CSS/SW : revalidation ; ancien cache remplacé. Vérifier navigateur desktop et vrais appareils mobiles.
- Inscription/email vérifié, resend, reset, login client/admin et 2FA ; code faux refusé, challenge non rejouable, accès admin client refusé, changement de mot de passe invalidant les anciennes sessions.
- Réservation invitée sans crédit implicite, cohérence compte/email admin, durées, pause/fermeture, annulation, déplacement et course concurrente ; fin <=19:00. Toute réservation de contrôle créée sur l'environnement réel requiert accord ; ne pas supprimer de données sans accord.
- Envois de test vers destinataires autorisés, liens SITE_URL corrects, un seul scheduler, logs sans erreurs inattendues, snapshot automatique récent et restauration testée. Acceptation fournisseur distincte de livraison.

## Retour arrière

Arrêter application et sauvegarde planifiée, maintenir le site fermé aux écritures. Conserver le code courant, la base et ses journaux ; ne rien supprimer. Restaurer le snapshot vérifié vers un nouveau fichier, vérifier intégrité et compatibilité avec le code précédent. Après accord, changer DATABASE_FILE vers ce fichier et revenir au commit compatible, puis redémarrer et refaire les contrôles avant réouverture. Un ancien code peut avoir ses propres migrations : l'essayer sur copie isolée avant redémarrage. Ne pas écraser une base vivante ni appliquer un downgrade SQL improvisé. Après réouverture précédente, rapprocher les réservations créées depuis le snapshot avant toute restauration pour éviter de les perdre.

La fusion ne déclenche aucun déploiement dans le workflow du dépôt. Vérifier séparément les automatisations de l'hébergement. L'ouverture en production exige une décision distincte après levée des blocages du rapport PREPRODUCTION_REVIEW.md.
