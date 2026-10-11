# Vérification finale avant intégration

> Audit préproduction actuel : [PREPRODUCTION_REVIEW.md](PREPRODUCTION_REVIEW.md), 130 tests et blocages de dépendances documentés. Les validations ci-dessous sont conservées comme historique.

> Mise à jour PR #2 : la revue complémentaire a révélé un contrôle manquant lors du maintien du même userId. Correction et validation actuelle (**105 tests**) dans [PR2_ACCOUNT_EMAIL_REVIEW.md](PR2_ACCOUNT_EMAIL_REVIEW.md). Les résultats ci-dessous décrivent la vérification initiale à 95 tests.

11 octobre 2026 — branche `fix/single-professional-planning`, cible `main`. Aucun secret réel lu/modifié, aucune base de production ouverte, aucune fusion ni déploiement.

## Fonctionnalités vérifiées

| Contrôle | Résultat et preuve |
| --- | --- |
| Présence des corrections de sécurité | VALIDÉ : après git fetch origin, `git merge-base --is-ancestor origin/fix/security-bookings-auth HEAD` retourne 0. Les commits 57d0b97 et 3d6615b sont des ancêtres du planning ; aucune modification du code de sécurité n'a été retirée dans la branche fille. |
| Fidélité et réservation invitée | VALIDÉ : relecture de POST bookings, PATCH admin et bookings_award_points. L'email libre ne lie aucun compte ; userId fourni au public refusé. Association automatique seulement pour un compte authentifié vérifié correspondant à l'adresse ; association admin explicite possible. Crédit par userId une seule fois. Adresse d'un tiers, faux jeton, compte non vérifié, modification de contact et course entre finalisation/réaffectation couverts par tests. Aucune nouvelle correction nécessaire sur ce point. |
| Une seule professionnelle | VALIDÉ : intervalles communs à toutes les prestations, départs publics toutes les 15 minutes, durées administrables, limites 09:00–19:00, réservations consécutives autorisées selon [début, fin), pauses/fermetures datées, annulation et déplacement admin. Triggers SQLite conservés, contrôle atomique même entre services différents. |
| Europe/Paris | VALIDÉ : cinq nouvelles régressions HTTP, été/hiver et lendemains de changements d'heure, 09:00 refusé à 09:07 Paris et 09:15 accepté. À 22:30 UTC en été, le jour précédent est fermé et le nouveau jour Paris est réservable. Tests existants sur minuit et changements d'heure des rappels conservés. Chrome configuré Honolulu : le jour marqué aujourd'hui reste le jour Paris. |
| Interface et administration | VALIDÉ : seuls availableSlots sont affichés, sans boutons bloqués. Durée et indisponibilité modifiées depuis l'administration, réservation invitée puis consultation client. Login administrateur avec challenge 2FA/TOTP vérifié dans Chrome. |
| Migrations | VALIDÉ sur copie synthétique : cinq anciennes réservations, annulation canceled, réservation terminée déjà créditée et conflits historiques. Copie disque distincte du fichier source, conservation des lignes/soldes, normalization cancelled, cinq triggers, integrity_check ok, foreign_key_check vide, source inchangée et redémarrage idempotent. Une seule insertion gagnante sur deux connexions. Échec injecté/rollback/reprise, état partiellement migré et refus production sans autorisation testés dans la suite complète. |
| Livraison maîtrisée | VALIDÉ pour le dépôt : workflow limité aux tests, aucun déploiement sur push main. En NODE_ENV=production, migration en attente refusée ; commande séparée exigeant approbation explicite de version avant ouverture de base. Procédure dans DEPLOYMENT_RUNBOOK.md. |

## Tests réellement exécutés pour cette intégration

- `npm test -- --silent` depuis backend : **9 suites, 95 tests réussis**, dont cinq nouveaux tests Paris. Bases en mémoire ou fichiers synthétiques temporaires ; dotenv réel ignoré, fournisseurs simulés. Les quatre tests diagnostiques FINDING prouvent des limites de notifications encore présentes, pas leur résolution.
- `node tests/browser-smoke.mjs` : Chrome headless réel, serveur local, base/profil temporaires, fuseau navigateur Pacific/Honolulu. 2FA admin, durée configurable, indisponibilité, calendrier Paris, grille identique aux seuls horaires disponibles, durée/fermeture, réservation invitée sans userId, login/historique client ; zéro exception JavaScript non interceptée. HTTPS externe bloqué, aucun envoi réel.
- `node tests/review-migration.mjs normal` exécuté également hors Jest : 5 lignes conservées, solde initial 10 inchangé après transitions historiques, crédit explicite ultérieur +5, source inchangée, intégrité correcte, course avec un gagnant et un booking_overlap. Les champs rollbackVerified/productionBlocked sont false dans ce scénario normal ; ces contrôles appartiennent aux scénarios distincts rollback/production exécutés par Jest.
- Syntaxe Node des deux fichiers de tests modifiés et `git diff --check` : succès. Ascendance Git vérifiée après actualisation des références distantes.

## Risques restants et non-testé

- **À CORRIGER** : JWT dans localStorage et CSP autorisant encore des scripts inline ; TOTP stocké selon l'architecture actuelle. La révocation des sessions après changement de mot de passe est effective mais ne supprime pas l'exposition aux scripts de même origine.
- **À CORRIGER** : notifications sans file durable/idempotence fournisseur ; push suspendu pouvant retarder la réponse, doublons après erreur de marquage ou scheduler multi-instance, absence de rattrapage après arrêt couvrant minuit. Maintenir un seul scheduler.
- **À examiner avant production** : conflits historiques conservés, soldes anciens non réconciliés faute de registre comptable. Les rendez-vous historiquement completed sont considérés déjà crédités. Une fermeture bloquant un rendez-vous actif exige son déplacement/annulation explicite.
- **NON TESTÉ** : base réelle anonymisée et volumétrie de production, sauvegarde/restauration VPS, environnement PM2/SQLite, TLS/proxy, automatisations externes, fournisseurs réels, mobile/PWA déjà installée et scan QR via application TOTP externe. La copie représentative est structurelle et synthétique, sans données de production.
- Disponibilités rafraîchies sur interaction/premier plan et toutes les 30 secondes ; HTTP 409 si réservation concurrente entre affichage et validation. Dimanche fermé existant et fermetures exceptionnelles datées ; pas de nouvel éditeur hebdomadaire récurrent.

**Fusion : GO pour revue et intégration de ces changements**, avec limites documentées. **Production : NO-GO** avant validation opérationnelle, sauvegarde/restauration, acceptation des risques et autorisation explicite de migration. Cette vérification ne réalise ni n'autorise la fusion ou le déploiement.
