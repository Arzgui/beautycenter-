# Complément PR #1 — fidélité et réservation dynamique

Branche fix/security-bookings-auth, 10 octobre 2026. Aucun accès à une base de production, aucune modification de secret réel, aucune fusion ni déploiement. SECURITY_REVIEW.md et INDEPENDENT_SECURITY_REVIEW.md sont des instantanés historiques ; ce document décrit l’état complémentaire actuel.

## Corrections et preuves

| Point | État | Résultat |
| --- | --- | --- |
| Crédit par email libre | VALIDÉ | Le trigger créditait clientEmail sans preuve de propriété. Il utilise désormais userId vérifié. POST public refuse un userId fourni ; seule une authentification valide avec email correspondant associe le compte. Invité/non vérifié : réservation conservée sans crédit automatique. Tests avec adresse d’un tiers et faux jeton. |
| Fidélité et administration | VALIDÉ | Crédit atomique une seule fois ; association explicite admin au compte vérifié correspondant. Éditer l’email de contact ne transfère pas les points. Réaffectation après crédit interdite, même si une finalisation intervient entre lecture et écriture admin. |
| Horaires | VALIDÉ | Cinq anciens créneaux de test abandonnés. Départs publics toutes les 15 minutes entre 09:00 et 19:00, durée entière, fin <=19:00. Dimanche fermé existant conservé. API/interface lisent schedules ; neuf prestations initiales reprises sans changer leurs valeurs. |
| Durées administrables | VALIDÉ | Durées entières 15–600 minutes et prix non négatifs configurables, création/désactivation préservant les réservations. Changer une durée ne réécrit pas les fins historiques ; déplacer/changer une prestation recalcule la fin. Horaires à la minute permis à l’admin. Styles existants conservés. |
| Disponibilités et concurrence | VALIDÉ | Rendez-vous et indisponibilités pris en compte sur toute la durée. Triggers atomiques pour insertion/modification et création d’indisponibilité. Tests réservation/réservation et réservation/indisponibilité simultanées. Rafraîchissement date/prestation, premier plan et 30 secondes ; durée sélectionnée devenue obsolète : 409. |
| Migrations | VALIDÉ | Transaction BEGIN IMMEDIATE, version persistante, rollback/reprise/idempotence. Bases neuves et copie disque d’un ancien schéma avec 5 réservations synthétiques, conflits historiques, ancienne annulation et rendez-vous terminé. Soldes conservés, integrity_check ok, foreign_key_check vide. Source synthétique inchangée ; deux connexions concurrentes, un gagnant. |
| Comptes et 2FA | VALIDÉ | Vérification du compte/droits/version de session courants. Mot de passe changé : sessions/challenge invalidés. Démotion admin immédiatement effective. Erreur OTP précise. Annulation client d’un rendez-vous terminé refusée. |
| Espace client/cache | VALIDÉ | Affichage adapté aux champs API réduits ; refus 403 affiché. Libellés client/attributs admin échappés. Service worker versionné, HTML/JS exclus de l’ancien cache-first. |
| Livraison | VALIDÉ | Workflow limité aux tests ; aucun déploiement SSH/PM2. NODE_ENV=production refuse une migration en attente. Commande séparée exigeant approbation explicite de la version avant ouverture de base ; runbook sauvegarde/copie/validation/restauration. |
| Production réelle | NON TESTÉ | Configuration VPS, TLS/proxy, restauration réelle, volumétrie, versions SQLite/PM2 et automatisations extérieures inconnues. Aucun secret lu. |
| Sessions localStorage | À CORRIGER | JWT lisibles par un script de même origine ; risque hérité, révocation améliorée, cookies HttpOnly et CSP stricte restant à faire. Aucune exfiltration tentée. |
| Notifications/reprise | À CORRIGER | Quatre tests diagnostiques FINDING reproduisent doublon après erreur de marquage, scheduler multi-instance, absence de rattrapage après minuit et réponse retardée par push suspendu. Réservation enregistrée conservée, livraison exactement une fois non garantie. |

## Tests exécutés

- **9 suites, 84 tests réussis**. Les quatre tests FINDING prouvent les risques persistants ; ils ne valident pas leur correction.
- Migration disque : ancien schéma extrait du parent de la première correction, copie réelle avant migration, données entièrement synthétiques. Scénarios normal, interruption préalable, échec injecté/rollback/reprise, refus production sans autorisation puis redémarrage sans migration. Fournisseurs simulés, .env réel ignoré.
- Chrome headless réel, serveur local, SQLite/profil temporaires : login admin avec TOTP natif, durée modifiée depuis l’interface, indisponibilité créée, 40 départs, fermeture/chevauchement, invité 09:15–10:15, login client et historique. Aucune exception JavaScript non interceptée ; HTTPS externe bloqué, aucun envoi fournisseur.
- Syntaxe JavaScript et git diff --check. Erreurs booking_overlap/mark_failed attendues dans les scénarios négatifs.
- NON TESTÉ : mobile/PWA déjà installée, scan QR via application externe, livraison réelle des fournisseurs, environnement et restauration de production. Test navigateur facultatif, nécessitant Chrome, hors CI standard.

## Fichiers concernés

- Données/sécurité : config/database.js, middleware/auth.js, routes/auth.js, routes/bookings.js, routes/admin/{bookings,clients,schedules,unavailability}.js, utils/{services,dates}.js et server.js.
- Interfaces : admin.html, js/admin.js, js/script.js, compte.html, espace-client.html, service-worker.js. Ajout des contrôles nécessaires avec les styles existants.
- Livraison : .github/workflows/deploy.yml, backend/.env.example, scripts/migrate.js et documentation.
- Tests : dynamic-booking.test.js, independent-review.test.js, review-migration.mjs, review-legacy-schema.sql, browser-smoke.mjs et adaptation de regressions.test.js à l’authentification réelle.

## Risques et décision

Conflits historiques conservés, pouvant bloquer l’édition active jusqu’à résolution manuelle. Sans registre comptable, anciens doubles crédits et rendez-vous terminés puis revenus à un autre statut non reconstituables. Anciennes réservations completed marquées déjà créditées. Invités sans attribution automatique, association admin nécessaire ; consultation des réservations invitées toujours permise au propriétaire vérifié de l’adresse, sans crédit implicite.

**Fusion main : GO**, pour les corrections/fonctionnalités présentes, avec ces risques hérités documentés. Cela n’autorise aucune migration ni déploiement.

**Production : NO-GO à ce stade**, jusqu’à validation sur copie de l’environnement réel, sauvegarde/restauration, configuration, acceptation explicite des limites sessions/notifications et approbation humaine de migration selon DEPLOYMENT_RUNBOOK.md.
