# Correction ciblée des dépendances npm — PR #2

11 octobre 2026. Branche `fix/single-professional-planning`. Aucun accès au VPS, aucune fusion, aucun déploiement, aucune base existante ni aucun secret modifié. Ce rapport remplace le bilan des dépendances du rapport de préproduction initial.

## Constat et chemins avant correction

Audit du verrouillage local : **10 alertes : 1 critique, 6 élevées, 1 modérée, 2 faibles**, identiques au décompte communiqué pour le VPS. Ce sont dix paquets signalés, dont plusieurs héritent de la même vulnérabilité ; pas dix attaques indépendantes. L'ancien JSON est conservé dans l'historique Git au commit `3a072e4`.

| Paquets signalés | Chemin depuis une dépendance directe | Exposition constatée dans ce projet |
| --- | --- | --- |
| tar (critique), @mapbox/node-pre-gyp et bcrypt (élevées par propagation) | bcrypt 5.1.1 → @mapbox/node-pre-gyp 1.0.11 → tar 6.2.1 | Installation des binaires natifs : extraction d'archives, traversées de chemins et dénis de service selon les avis tar. Une archive malveillante ou une chaîne de téléchargement compromise est un risque pour l'installateur. Aucun endpoint n'extrait d'archive avec tar ; pas de chemin HTTP d'exploitation identifié. Cela ne rend pas l'installation sûre. |
| sqlite3, node-gyp, make-fetch-happen, cacache (élevées), tar (critique) | sqlite3 5.1.7 → tar 6.2.1 ; sqlite3 → node-gyp 8.4.1 → make-fetch-happen 9.1.0 → cacache 15.3.0 → tar | Installation/compilation et cache d'archives. Les alertes héritées ne démontrent pas une faille de requête SQL ni de l'algorithme bcrypt. |
| @tootallnate/once et http-proxy-agent (faibles) | sqlite3 → node-gyp → make-fetch-happen → http-proxy-agent 4.0.1 → @tootallnate/once 1.1.2 | Gestion des événements/proxy du téléchargement d'installation ; aucun appel applicatif identifié. |
| uuid (modérée) | uuid 9.0.1 direct | Bibliothèque utilisée à l'exécution. L'avis vise v3/v5/v6 avec tampon fourni ; le code applicatif importe uniquement v4 sans tampon. Chemin vulnérable non utilisé, bibliothèque néanmoins mise à jour. |

Les analyses d'atteignabilité ci-dessus résultent des imports applicatifs, de `npm ls` et des avis ; aucun exploit offensif n'a été exécuté. Les risques d'installation ne doivent pas être confondus avec les droits d'un client distant de l'API.

## Choix des versions majeures

| Dépendance | Avant → après | Analyse de compatibilité |
| --- | --- | --- |
| bcrypt | 5.1.1 → **6.0.0** | Dernière version npm consultée ; Node ≥18. Suppression de node-pre-gyp au profit de binaires embarqués/prebuildify et node-gyp-build. API hash/compare conservée ; connexion réelle de test avec hash $2b$ produit par 5.1.1 validée, sans réécriture du hash. |
| sqlite3 | 5.1.7 → **6.0.1** | Dernière version npm consultée ; Node ≥20.17, donc compatible avec Node 22.15.0 testé. API Database/run/get/all/exec conservée. SQLite embarqué constaté : **3.52.0**. Triggers, transactions, concurrence sur deux connexions, migrations, sauvegarde/restauration testés. |
| uuid | 9.0.1 → **14.0.3** | Dernière version npm consultée. Abandon CommonJS depuis v12 et exigence crypto global/Node ≥20 depuis v14 : application déjà ESM et Node 22. Import nommé v4 validé par les parcours de réservation/authentification. |

Le verrouillage résout **tar 7.5.22** ; l'ancienne chaîne @mapbox/node-pre-gyp et @tootallnate/once disparaît. Le node-gyp résolu est 12.4.0. Aucun override de sous-dépendance, aucun `npm audit fix --force`, aucune modification des règles de planning, aucun changement de schéma applicatif.

**Limite de maintenance : sqlite3 est officiellement non maintenu et son dépôt archivé.** La 6.0.1 corrige le verrouillage actuel, mais ne répond pas à une exigence de maintenance durable. Son remplacement par un pilote maintenu exige une qualification distincte du wrapper asynchrone, des transactions et des migrations ; il n'est pas dissimulé dans cette correction ciblée. prebuild-install 7.1.3 est également déclaré non maintenu lors de npm ci. Cette exception est proposée à la revue, sans prétendre à son acceptation par l'exploitant.

## Vérifications réellement exécutées

Environnement local Windows, **Node 22.15.0 / npm 10.9.2**. Bases, profils et comptes synthétiques isolés ; fournisseurs simulés, aucun envoi externe.

- `npm install bcrypt@^6.0.0 sqlite3@^6.0.1 uuid@^14.0.3`, puis **`npm ci` avec scripts natifs : succès**. Pas d'installation avec --ignore-scripts utilisée comme preuve de compatibilité.
- **`npm audit --omit=dev --json` : zéro vulnérabilité**, résultat dans [dependency-audit.json](dependency-audit.json). Audit à renouveler sur le verrouillage exact lors de l'installation autorisée.
- **`npm test -- --silent` : 10 suites, 131 tests réussis**. Premier passage : 130 succès, un échec du nouveau test faute de createdAt dans sa fixture ; fixture corrigée, suite complète relancée avec succès.
- Régression ajoutée dans auth.test.js : connexion avec hash bcrypt 5.1.1 enregistré avant mise à jour, rejet d'un mauvais mot de passe, hash conservé. Création/changement/réinitialisation et 2FA restent couverts par les autres tests.
- Concurrence : créations concurrentes/chevauchements entre prestations, réservation contre indisponibilité, crédit unique, annulation ; migrations anciennes avec concurrence sur deux connexions. Les créneaux adjacents [début, fin) restent permis ; fin ≤19:00 et départs publics toutes les 15 minutes conservés.
- Migration sur **copies d'une base synthétique au schéma historique**, cinq réservations représentatives : statuts anciens, crédit historique, conflits anciens ; intégrité/FK, idempotence, interruption et rollback, refus de migration production sans accord. Ce n'est pas une copie issue du VPS.
- Sauvegarde/restauration SQLite avec WAL, refus d'écrasement et source inchangée : suite preproduction.test.js réussie.
- **`node tests/browser-smoke.mjs` : succès**, Chrome, mobile émulé, client/admin/2FA, email/annulation, calendrier Paris avec navigateur Honolulu, durées/pauses/grille, réservation invitée, zéro exception JavaScript.
- **`node tests/production-startup.mjs` : succès**, démarrage réel local NODE_ENV=production, HTTPS/CORS/accès et refus de migration non approuvée, zéro requête externe.
- CI : ajout de `npm audit --omit=dev` après npm ci et les tests. Aucun job de déploiement ; fusion ne déclenche aucune migration.

## Résidu npm et décisions

L'audit complet **incluant dev** retourne encore **33 alertes : 28 élevées, 5 modérées**, et un code 1 ; JSON dans [dependency-audit-all.json](dependency-audit-all.json). Elles viennent de Jest 29 et de ses dépendances, principalement `jest → micromatch → braces` (motifs profondément imbriqués, épuisement de pile) et `jest → @istanbuljs/load-nyc-config → js-yaml → argparse → sprintf-js` (précision non bornée, déni de service). Les multiples alertes Jest sont propagées depuis ces chemins. Absentes de l'arbre audité avec --omit=dev ; elles restent un risque pour CI/développement traitant des motifs ou contenus non fiables. npm recommande notamment Jest 30.5.2, changement majeur de l'outillage à qualifier séparément. **Report proposé pour garder cette intervention ciblée sur production ; aucune acceptation définitive implicite.** Les runners doivent rester isolés, sans secrets de production ni exécution de contributions non fiables avec privilèges.

Aucune vulnérabilité npm de production connue de cet audit n'est acceptée : leur nombre est zéro. Cela ne garantit pas l'absence de défauts inconnus, ni la maintenance future de sqlite3. Les quatre tests FINDING sur les notifications continuent de reproduire des limites connues ; leur succès ne les corrige pas. JWT dans localStorage, TOTP au repos, notifications sans file durable/idempotence et scheduler unique restent décrits dans PREPRODUCTION_REVIEW.md.

**GO pour fusion après revue** de cette correction ciblée et CI réussie. **NO-GO pour déploiement automatique ou immédiat** : validation humaine de l'exception de maintenance et des risques restants, installation Linux/architecture réelle avec le verrouillage, HTTPS/env/fournisseurs, sauvegarde et restauration sur environnement autorisé restent nécessaires. Aucun contrôle réalisé ici sur le VPS.

## Sources primaires consultées

- [bcrypt 6 : changement des binaires et retrait node-pre-gyp](https://github.com/kelektiv/node.bcrypt.js/releases/tag/v6.0.0).
- [sqlite3 : versions 6 et avis de non-maintenance/archivage](https://github.com/TryGhost/node-sqlite3/releases).
- [UUID : changements ESM et Node/crypto](https://github.com/uuidjs/uuid/releases), [avis UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
- [tar : décompression/parse sans limite](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [tar : récursion non bornée](https://github.com/advisories/GHSA-r292-9mhp-454m), [once](https://github.com/advisories/GHSA-vpq2-c234-7xj6).
- [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

Versions et contraintes engines vérifiées via npm view ; résultats d'audit valables à la date d'exécution, pas garantie permanente.
