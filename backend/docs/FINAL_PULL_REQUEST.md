Cette PR regroupe la sécurité, la fidélité, le planning pour une professionnelle et la préparation technique d’exploitation d’IS Beauty. La branche fix/security-bookings-auth est incluse ; aucune fusion ni mise en production effectuée.

Réservations : 09:00–19:00, départs toutes les 15 minutes, durées administrables, pauses/fermetures datées, intervalles [début, fin), annulations/déplacements et conflits atomiques SQLite. L’interface ne propose que les horaires disponibles.

Fidélité : userId vérifié, aucun crédit implicite par email d’une invitée. Chaque modification admin revérifie compte/email même si userId reste identique, avec contrôle SQL à l’écriture. Attribution unique et crédits déjà effectués non réaffectables. JWT obligatoire, challenge 2FA unique, révocation après changement de mot de passe et droits courants contrôlés.

Compléments préproduction : scripts de vérification email et annulation extraits pour respecter la CSP ; quota de configuration 2FA séparé du login, chacun limité ; fichiers statiques sensibles bloqués ; configuration production HTTPS/CORS/email/VAPID/path DB contrôlée, écoute loopback par défaut. Service Worker v5, revalidation HTML/JS/CSS et nettoyage limité aux caches de l’application.

Exploitation : promotion du premier compte vérifié en admin sans mot de passe par défaut, avec accord explicite ; sauvegarde SQLite/WAL cohérente et restauration vers nouveau fichier sans écrasement ; modèles systemd (serveur unique, timer horaire) et Nginx. Installation, variables, migration approuvée, 2FA, sauvegarde externe, contrôles et rollback documentés. Aucun service installé, aucune donnée existante supprimée, aucun secret de production créé ou modifié.

Validation : **10 suites / 130 tests réussis** ; Chrome desktop/mobile émulé, 2FA client/admin, vérification email, annulation, CORS, Service Worker, calendrier Paris depuis Honolulu, durées/indisponibilités et réservations. Démarrage réel NODE_ENV=production sur base/identifiants synthétiques, refus de migration sans écriture ; sauvegarde/restauration WAL et migrations anciennes sur copies synthétiques validées. Quatre tests FINDING reproduisent les limites de notification, sans les corriger.

Dépendances : correctifs compatibles de 16 paquets, sans scripts ni --force. Audit production réduit de 19 à **10 alertes (1 critique, 6 élevées, 1 modérée, 2 faibles)** ; chaînes bcrypt/sqlite3/tar et uuid nécessitant selon npm des montées majeures à qualifier et tester. Audit npm toujours en échec (code 1), malgré les tests verts. CI limitée aux tests avec npm ci ; aucun déploiement sur fusion dans le dépôt.

Risques : JWT localStorage/CSP inline et stockage TOTP ; notifications sans file durable/idempotence, un seul scheduler requis ; récupération 2FA, environnement HTTPS/fournisseurs et sauvegardes réellement planifiées/restaurées sur VPS encore à valider. Émulation mobile ne remplaçant pas iOS/Android/PWA installés. Données de test existantes préservées.

[Audit actuel](backend/docs/PREPRODUCTION_REVIEW.md) · [Procédure complète](backend/docs/PRODUCTION_OPERATIONS.md) · [Migration contrôlée](backend/docs/DEPLOYMENT_RUNBOOK.md) · [Correction compte/email](backend/docs/PR2_ACCOUNT_EMAIL_REVIEW.md)

**GO fusion après revue** de cette préparation ; **NO-GO déploiement** avant traitement des alertes, décision sur risques et validation réelle HTTPS/env/email/2FA/sauvegarde/restauration. Fusion ne valant jamais accord de migration/mise en ligne. PR #1 conservée comme historique ; cette PR regroupe les changements.
