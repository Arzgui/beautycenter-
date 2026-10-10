# Déploiement manuel et migration SQLite

Procédure préparée, jamais exécutée ici. Une fusion dans main lance uniquement les tests CI. Aucun job SSH, PM2 ou migration ne reste dans le workflow. Vérifier aussi les éventuelles automatisations d’hébergement extérieures au dépôt.

## Avant toute autorisation

1. Faire approuver le code et une fenêtre de maintenance ; désigner l’opérateur et le responsable de l’autorisation de migration.
2. Vérifier l’environnement du processus sans afficher les secrets : NODE_ENV=production, DATABASE_FILE absolu, JWT_SECRET aléatoire >=32 octets, SITE_URL et CORS_ORIGINS avec l’origine HTTPS réelle, clés VAPID stables, fournisseurs, proxy et port. Ne pas copier l’exemple de développement tel quel.
3. Le serveur en production refuse une migration en attente ou une base absente. **Ce garde-fou dépend de NODE_ENV=production.** Développement/tests conservent l’initialisation automatique.
4. Préparer une sauvegarde SQLite cohérente via l’API backup ou après arrêt de tous les écrivains. Une copie brute pendant des écritures, notamment WAL, ne suffit pas. Tester sa restauration dans un emplacement isolé ; conserver le code précédent et la configuration hors du dépôt.

## Validation sur copie

Utiliser un environnement isolé, DATABASE_FILE pointant explicitement vers une copie, dotenv isolé et fournisseurs désactivés. Ne jamais pointer les tests sur la production. Depuis backend :

```sh
npm test
node scripts/migrate.js --approve-production-migration=2026-10-booking-v2
```

Le paramètre autorise la version précise sur **la copie configurée**. Vérifier integrity_check, foreign_key_check, totaux des lignes/soldes et échantillons de rendez-vous avant/après ; relancer la migration pour contrôler l’idempotence. Examiner les zones de prestations dupliquées et durées/prix invalides : elles provoquent refus et rollback. Rechercher les chevauchements historiques avec une requête SELECT et prévoir leur résolution métier tracée, sans suppression automatique.

Les fins/prix historiques ne sont pas recalculés. Les réservations historiquement completed sont considérées déjà créditées ; aucun rapprochement des soldes n’est effectué. Les invités ne sont jamais associés automatiquement pour la fidélité. L’administrateur peut choisir explicitement un compte vérifié correspondant à l’adresse ; le bénéficiaire ne change plus après crédit.

Valider connexion client/admin et 2FA, email vérifié, reset et révocation, consultation, réservation/annulation, modification admin, durées, indisponibilités et concurrence. Le test facultatif `node tests/browser-smoke.mjs` utilise sa propre base/profil temporaires ; définir CHROME_PATH si nécessaire. Il ne nécessite aucun secret réel.

## Production : approbation humaine obligatoire

1. Présenter les résultats sur copie et obtenir l’autorisation explicite de migrer la production. CI verte ou fusion ne valent pas autorisation.
2. Arrêter tous les écrivains et schedulers, maintenir le site en maintenance, refaire et vérifier la sauvegarde cohérente.
3. Vérifier le chemin absolu DATABASE_FILE dans l’environnement autorisé. Seulement après accord, exécuter manuellement depuis backend : `node scripts/migrate.js --approve-production-migration=2026-10-booking-v2`. Ce paramètre ne remplace ni sauvegarde ni accord humain.
4. Vérifier SQLite et les totaux ; démarrer le code approuvé avec NODE_ENV=production. Vérifier endpoints services/disponibilités, connexion et logs. Une seule instance de scheduler doit fonctionner : chaque serveur démarre actuellement son scheduler.
5. Faire valider les parcours et les envois de test vers des destinataires autorisés avant réouverture.

Un échec de migration annule sa transaction : examiner l’erreur et la copie, sans modifier les données en boucle. Pour revenir en arrière après migration, arrêter les écrivains et restaurer ensemble sauvegarde et code compatible ; vérifier l’intégrité avant réouverture. Une restauration après réouverture peut perdre les nouvelles réservations : prévoir rapprochement et décision explicite. Aucun rollback automatique sur des données vivantes.

## Limites opérationnelles

JWT toujours dans localStorage, donc lisibles par un script de même origine ; CSP conservant des scripts inline. Révocation améliorée, mais cookies HttpOnly/CSP stricte restent un chantier distinct.

Notifications sans file durable : push suspendu pouvant retarder la réponse malgré l’enregistrement ; envoi perdu/dupliqué après arrêt ou échec de marquage. Rappels sans rattrapage après minuit et verrou local au processus. Valider la topologie réelle et faire accepter explicitement ces limites ; une file durable et une idempotence fournisseur restent nécessaires pour les supprimer.
