# Revue de securite IS Beauty

Corrections preparees le 10 octobre 2026. Architecture Node.js / Express / SQLite conservee. Aucun secret reel ni aucune base de production ouverts ou modifies. Aucune fusion ni aucun deploiement effectues.

## Problemes confirmes et corrections

| Priorite | Constat dans le code initial | Correction et regression |
| --- | --- | --- |
| 1 | Secret JWT de secours dans routes/auth.js et middleware/auth.js ; simple avertissement au demarrage. | Configuration commune, demarrage refuse si absent, trop court (<32 octets) ou valeur de remplacement connue ; verification HS256 uniquement. Test des configurations refusees. |
| 2 | SELECT de chevauchement puis INSERT distincts dans routes/bookings.js. | Triggers SQLite INSERT/UPDATE : verification et ecriture dans la meme instruction atomique, conflits HTTP 409. Test de huit creations concurrentes et des creneaux adjacents. |
| 3 | Administration utilisant canceled, client et rappels utilisant cancelled ; espace client utilisant canceled. | cancelled partout, migration des anciennes valeurs, metadonnees d'annulation admin, annulation client conditionnelle atomique. Tests de liberation/reprise du creneau et d'annulation concurrente. |
| 4 | Credits accordes apres lecture du statut precedent ; retour completed -> confirmed -> completed permettant un nouveau credit. | Marqueur persistant pointsAwarded et trigger SQLite creditant les points dans la meme transaction que le statut. Tests de concurrence, transitions repetees et rollback si le credit echoue. |
| 5 | PATCH administratif sans validation ni controle des chevauchements. | Validation des dates/heures/prix, 404 si absent ; trigger de conflit y compris restauration apres annulation ; recalcul des points non attribues et remise a zero du rappel lors d'une modification. Tests des conflits et modifications valides. |
| 6 | Confirmation SMS hors bloc de protection ; erreurs HTTP Brevo ignorees ; informations de rendez-vous diffusees a tous les abonnes push. | Echecs de notification isoles de l'enregistrement, retours explicites des fournisseurs et delais reseau limites ; push generique sans informations du rendez-vous. Tests des pannes et des helpers Brevo reels avec fetch simule. |
| 7 | SELECT * dans les listes de reservations, incluant cancellationToken ; recherche par email sans verifier sa possession ; valeurs de validation renvoyees dans les erreurs. | Listes de champs explicites, email verifie requis pour lire les reservations personnelles, valeurs sensibles retirees des erreurs. Blocage des sources backend dans le serveur statique, y compris chemins encodes. Tests de confidentialite et de fichiers statiques. |
| 8 | Noms et libelles interpoles directement dans le HTML des confirmations, annulations, rappels, inscriptions, invitations et reinitialisations. | escapeHtml commun pour les substitutions HTML, texte brut conserve. Tests des noms contenant une balise HTML. |
| 9 | Demain calcule en UTC, cron dans le fuseau du serveur, rappel marque envoye meme en cas d'echec de tous les canaux. | Calendrier et cron Europe/Paris ; premiere tentative a 09:00, nouvelle tentative toutes les 15 minutes jusqu'a 18:45 ; marquage seulement si au moins un fournisseur accepte le message, exclusion des rendez-vous termines, verrou dans le processus. Tests minuit, changements d'heure, echec puis reprise, execution concurrente et planification. |
| 10 | Login 2FA avec userId + TOTP sans preuve du mot de passe ; setup pouvait remplacer un secret actif ; reset de mot de passe non atomique. | Challenge signe de cinq minutes apres mot de passe, nonce consomme une fois, challenge refuse comme jeton d'acces, protection des transitions setup/enable, reset atomique avec consommation via trigger. Parcours client/admin completes par une saisie OTP native. Tests de login, setup/enable, code invalide, expiration, rejeu et reset concurrent. |

## Validation

- Suite initiale : 22 tests passes sur une base SQLite en memoire, fournisseurs simules.
- Apres les groupes de corrections : suite relancee ; regressions detectees puis corrigees.
- Verification finale : 7 suites, 45 tests passes (`npm test` dans backend), dont 23 nouveaux tests.
- Tests des fournisseurs : sous-processus Node autorise hors bac a sable apres blocage EPERM, configuration de test uniquement et fetch simule ; aucun envoi externe.
- `git diff --check` et verification syntaxique Node des fichiers JavaScript modifies.
- Les connexions SQLite sont fermees apres chaque suite ; les tests ignorent le fichier .env reel.
- CI : syntaxe invalide du workflow corrigee, tests ajoutes aux PR, deploiement limite aux pushes sur main. Cette branche ne declenche aucun deploiement.
- Pas de test visuel navigateur ni d'envoi reel Brevo/Twilio execute. Les styles existants sont conserves, y compris les couleurs du statut annule.

## Migration et compatibilite a examiner avant toute mise en production

- Un secret JWT aleatoire fort est obligatoire. Le fichier .env reel n'a pas ete modifie. L'exemple explique sa generation et ne fournit aucune valeur utilisable par defaut.
- Les comptes non verifies peuvent toujours se connecter et demander un email de verification ; leurs rendez-vous restent masques tant que l'email n'est pas verifie.
- L'API 2FA exige maintenant challengeToken au lieu de userId. Les interfaces client et admin du depot utilisent ce contrat.
- Au prochain demarrage autorise, les migrations ajoutent loginChallenge et pointsAwarded, normalisent canceled et installent les triggers. Elles n'ont ete executees ici que sur des bases en memoire.
- Les rendez-vous historiquement completed sont marques comme deja credites pour eviter une nouvelle attribution. Sans historique comptable, il est impossible de reconstituer les anciens doubles credits ou les anciens rendez-vous redevenus pending/confirmed. Aucune correction des soldes historiques n'est appliquee.
- Les conflits deja presents dans une base existante ne sont ni supprimes ni resolus automatiquement. Leurs modifications actives peuvent etre refusees jusqu'a leur resolution manuelle.

## Risques residuels

- Le verrou des rappels est local au processus. Une execution avec plusieurs instances du scheduler ou un crash apres acceptation du message mais avant son marquage peut encore produire un doublon. Un seul scheduler doit etre actif ; une file durable et un identifiant d'idempotence fournisseur seraient necessaires pour aller plus loin.
- Un rappel est considere traite quand au moins un canal accepte l'envoi. L'acceptation fournisseur ne garantit pas la livraison finale ; le canal echoue n'est pas relance si l'autre reussit. Les confirmations n'ont pas de file de reprise persistante.
- Les jetons JWT existants restent valides jusqu'a expiration apres changement de mot de passe ; aucune nouvelle mecanique globale de revocation de session n'est ajoutee.
- Les secrets TOTP restent stockes selon l'architecture actuelle et les jetons de session restent dans localStorage ; chiffrement au repos, cookies HttpOnly et durcissement CSP demanderaient un chantier distinct.
- Cette intervention verifie les dix priorites et quelques expositions connexes ; elle ne constitue pas un audit exhaustif des dependances ou de toutes les interfaces.

## Fichiers modifies ou ajoutes

- `.github/workflows/deploy.yml`
- `backend/.env.example`
- `backend/config/database.js`
- `backend/config/jwt.js`
- `backend/docs/PULL_REQUEST.md`
- `backend/docs/SECURITY_REVIEW.md`
- `backend/middleware/auth.js`
- `backend/middleware/errorHandler.js`
- `backend/middleware/publicFiles.js`
- `backend/package.json`
- `backend/routes/admin/bookings.js`
- `backend/routes/admin/clients.js`
- `backend/routes/admin/invitations.js`
- `backend/routes/admin/schedules.js`
- `backend/routes/auth.js`
- `backend/routes/bookings.js`
- `backend/routes/notifications.js`
- `backend/routes/reminders.js`
- `backend/server.js`
- `backend/tests/auth.test.js`
- `backend/tests/bookings.test.js`
- `backend/tests/email-verification.test.js`
- `backend/tests/hooks.js`
- `backend/tests/providers.test.js`
- `backend/tests/regressions.test.js`
- `backend/tests/reminders.test.js`
- `backend/tests/security.test.js`
- `backend/tests/setup.js`
- `backend/utils/brevo.js`
- `backend/utils/dates.js`
- `backend/utils/html.js`
- `backend/utils/onesignal.js`
- `backend/utils/push.js`
- `backend/utils/reminders.js`
- `backend/utils/twilio.js`
- `compte.html`
- `espace-client.html`
- `js/admin.js`
