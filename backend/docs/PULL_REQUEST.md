Les réservations concurrentes pouvaient occuper un même créneau, les points être crédités plusieurs fois ou au compte d’un tiers par un email libre, et la 2FA ne demandait pas de preuve du mot de passe. Cette PR protège créneaux/crédits dans SQLite, impose un secret JWT sécurisé et introduit un challenge 2FA court à usage unique. Les droits courants et versions de session sont vérifiés ; un changement de mot de passe révoque sessions et challenges.

La réservation reste ouverte de 09:00 à 19:00, avec départs toutes les 15 minutes et blocage de toute la durée. Les prestations existantes sont reprises dans schedules, durées/prix configurables depuis l’administration. Rendez-vous, indisponibilités et fermeture sont contrôlés côté serveur, même en concurrence. Modifier une durée ne réécrit pas les anciennes réservations. Les invités restent acceptés ; compte vérifié authentifié ou association explicite admin requis pour la fidélité, créditée une seule fois.

Corrections complémentaires : cancelled, validation admin, données API, HTML email, erreurs OTP, espace client et cache PWA. Styles existants conservés. Rappels Europe/Paris ; limites de reprise restantes documentées.

Validation : **9 suites / 84 tests réussis**, bases neuves et copies disque synthétiques d’un ancien schéma ; reprise d’interruption, rollback injecté, idempotence, concurrence sur deux connexions et refus de migration non approuvée. Chrome headless : 2FA admin, configuration durée, indisponibilité, grille dynamique, réservation invitée, historique client ; aucune exception non interceptée. Quatre tests FINDING reproduisent des limites de notification et ne prouvent pas leur correction. Aucun secret réel ni donnée de production touchés.

Le workflow ne lance que les tests : **aucun déploiement sur fusion/push main** dans ce dépôt. NODE_ENV=production refuse les migrations en attente ; commande distincte exigeant approbation explicite de la version après sauvegarde/validation sur copie. Aucune fusion ni aucun déploiement effectués.

Risques : JWT localStorage, stockage TOTP existant, notifications sans file durable/idempotence interprocessus, pas de rattrapage après arrêt couvrant minuit, soldes/conflits historiques non réconciliés, configuration/livraisons production non testées. Un seul scheduler actif nécessaire.

Rapport actuel : [PR1_FOLLOWUP.md](backend/docs/PR1_FOLLOWUP.md). Procédure : [DEPLOYMENT_RUNBOOK.md](backend/docs/DEPLOYMENT_RUNBOOK.md). Revues précédentes conservées comme instantanés historiques.

Recommandation : **GO fusion**, **NO-GO production** avant contrôles opérationnels, acceptation des risques et autorisation explicite de migration.
