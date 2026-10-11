Cette PR regroupe les corrections de sécurité de fix/security-bookings-auth et le planning validé pour une seule professionnelle. La branche de sécurité distante est entièrement ancêtre de cette branche, vérifié après fetch.

Les créneaux sont protégés atomiquement dans SQLite sur l'intervalle [début, fin), commun à toutes les prestations. Réservation de 09:00 à 19:00, départs toutes les 15 minutes, durée configurable par prestation, pauses/fermetures datées administrables, fin limitée à 19:00, annulation libérant la plage et modification admin recalculant les disponibilités. Seuls les horaires disponibles sont proposés. Anciennes réservations conservées.

Le crédit de fidélité repose sur userId vérifié, jamais sur l'email libre d'une invitée. Chaque modification admin vérifie la cohérence compte/email, même si userId ne change pas, avec second contrôle au moment de l'écriture SQL. Changer l'adresse exige une association explicite cohérente ou un détachement explicite avant crédit. Après crédit, aucune réaffectation/dissociation ni changement d'adresse incohérent n'est accepté. Attribution unique préservée, même en concurrence. Sont inclus : secret JWT obligatoire, challenge 2FA à usage unique, révocation après changement de mot de passe, droits actuels contrôlés, cancelled uniforme, validation admin, réduction des données API, échappement HTML et corrections de l'espace client/cache.

Validation exécutée : **9 suites / 105 tests réussis** ; onze scénarios compte/email remplacent un test trop permissif. Migrations sur copies disque synthétiques d'ancien schéma, intégrité, idempotence, interruption, rollback et concurrence sur deux connexions. Chrome réel relancé sur base/serveur isolés, navigateur Honolulu : calendrier Paris, 2FA admin, durées/indisponibilités, grille disponible, réservation invitée et espace client. Tests HTTP Paris été/hiver, changements d'heure et minuit conservés.

Le workflow ne fait que tester : aucun déploiement sur fusion/push main dans le dépôt. NODE_ENV=production refuse toute migration en attente ; approbation explicite de version via commande opérateur après sauvegarde et validation sur copie. Aucun accès/modification de données de production, aucune fusion ni déploiement effectués.

Risques restant documentés : localStorage/CSP et stockage TOTP ; notifications sans file durable, reprise/idempotence imparfaites et un seul scheduler requis ; soldes/conflits historiques non réconciliés. Quatre tests FINDING reproduisent ces risques de notifications et ne prouvent pas leur correction. Environnement réel, restauration et fournisseurs de production non validés.

[Rapport final](backend/docs/FINAL_INTEGRATION.md) · [Procédure opérateur](backend/docs/DEPLOYMENT_RUNBOOK.md) · [Planning](backend/docs/SINGLE_PROFESSIONAL_PLANNING.md)

[Correction complémentaire compte/email](backend/docs/PR2_ACCOUNT_EMAIL_REVIEW.md) : problème confirmé, règle appliquée, préservation des crédits et régressions.

Recommandation : **GO fusion après revue ; NO-GO production avant contrôles opérationnels et autorisation explicite de migration**. La PR #1 reste un historique des corrections de sécurité ; cette PR inclut l'ensemble et constitue la proposition d'intégration finale vers main.
