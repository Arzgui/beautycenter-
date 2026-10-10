> Instantan? historique : les corrections compl?mentaires et les r?sultats actuels sont d?crits dans [PR1_FOLLOWUP.md](PR1_FOLLOWUP.md), avec la proc?dure [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

# Revue indépendante des modifications de sécurité IS Beauty

Date : 10 octobre 2026. Révision examinée : `57d0b97` (`fix/security-bookings-auth`, PR #1). Revue contradictoire du diff, du code appelant et des états persistés ; le rapport précédent n'est pas utilisé comme preuve de validation.

Aucun fichier applicatif, secret réel ou donnée de production n'a été modifié pendant cette revue. Seuls ce rapport et trois fichiers de tests/fixtures ont été ajoutés localement. Aucune fusion, publication supplémentaire ou opération de déploiement n'a été effectuée.

## Décision

**Fusion dans main : NO-GO.** La liste des rendez-vous client est cassée et une interruption de migration peut réintroduire le double crédit de fidélité. Ces défauts sont reproduits, pas seulement supposés.

**Déploiement en production : NO-GO.** Les mêmes blocages subsistent, auxquels s'ajoutent une configuration de déploiement non vérifiée, l'absence de contrôle de santé/retour arrière et des défauts de reprise des notifications. Le workflow déploie automatiquement après un push sur main : une fusion peut donc déclencher le déploiement, même si la revue distingue les deux décisions.

## Classement des sept axes demandés

| Axe | Point contrôlé | Classement | Preuve et limite |
| --- | --- | --- | --- |
| 1. Migration SQLite | Migration normale d'une base ancienne synthétique persistée sur disque, conservation des lignes/soldes, normalisation canceled, réouverture et intégrité | VALIDÉ | Schéma extrait du parent du commit, cinq réservations avec statuts mélangés et chevauchements historiques, client synthétique. Deux démarrages ; `integrity_check = ok`, aucune violation de clé étrangère, quatre triggers présents. Ce n'est ni une copie ni un échantillon de production. |
| 1. Migration SQLite | Reprise après interruption entre ALTER TABLE pointsAwarded et initialisation des marqueurs | À CORRIGER | État intermédiaire construit puis migration relancée : un rendez-vous historique déjà crédité reçoit cinq points supplémentaires. Voir R2. |
| 1. Migration SQLite | Volumétrie, versions SQLite du VPS, migration/restauration en préproduction et topologie PM2 réelle | NON TESTÉ | Aucun accès au VPS, à ses secrets ou à sa base. La fixture vérifie la structure et les cas fonctionnels, pas les temps de migration à grande échelle. |
| 2. Triggers | Insertion concurrente sur deux connexions SQLite distinctes, conservation des réservations, redémarrage | VALIDÉ | Une seule insertion concurrente réussit ; l'autre reçoit booking_overlap. Les contrôles existants de mise à jour, restauration, crédit concurrent et rollback sont également rejoués. |
| 2. Triggers | Compatibilité de fidélité avec pointsEarned = 0 pour une réservation payante historique | À CORRIGER | L'ancienne route utilisait le prix en secours ; COALESCE conserve zéro. Décision métier et migration explicite nécessaires. Voir R3. |
| 2. Triggers | Modification des anciens rendez-vous déjà en conflit | À CORRIGER | La migration conserve les conflits, et le trigger bloque ensuite une modification de statut active sur ces lignes. Prévoir détection préalable et procédure de résolution ; aucune correction automatique de données recommandée. |
| 3. Parcours client/admin | Preuve du mot de passe avant 2FA, challenge court et à usage unique, refus du challenge comme jeton d'accès, setup/enable et reset atomique | VALIDÉ | Scénarios HTTP des suites existantes rejoués. Le changement de contrat userId -> challengeToken est cohérent dans les deux fonctions de connexion actuelles. |
| 3. Parcours client/admin | Consultation effective des rendez-vous par le client vérifié et affichage des refus 403 | À CORRIGER | Une réservation est présente dans la réponse HTTP 200 mais le JavaScript réel de la page l'élimine. Un refus de vérification est présenté comme une absence de réservation. R1 et R4. |
| 3. Parcours client/admin | Erreurs OTP et révocation après changement de mot de passe/droits | À CORRIGER | Code invalide présenté comme Serveur inaccessible sur les deux interfaces ; challenge préexistant encore accepté après changement de mot de passe ; ancien JWT admin toujours autorisé après rétrogradation. R5-R7. |
| 3. Parcours client/admin | Navigateur réel, mobile, saisie OTP native, QR code scanné par une application d'authentification et parcours de récupération 2FA | NON TESTÉ | Tests HTTP et exécution des fonctions de page dans Node VM avec DOM simulé ; aucune validation visuelle, CSP effective ou application TOTP externe. |
| 4. Régressions | Client, erreurs de vérification/OTP, fidélité historique et validation administrative | À CORRIGER | Défauts reproduits dans des scénarios complémentaires, voir R1, R3-R5, R8-R9. |
| 4. Régressions | Mise à jour des clients PWA déjà installés | À CORRIGER | Service worker inchangé avec cache-first ; les pages et js/admin.js présents en cache ne sont pas revalidés. Prévoir invalidation/versionnement des ressources lors du changement de contrat d'authentification. Scénario sur appareil déjà installé NON TESTÉ. |
| 5. Déploiement/env | Refus d'une configuration JWT absente ou trop courte | VALIDÉ | Import du module de configuration dans des processus Node isolés : échec explicite. Cela valide le refus, pas le démarrage complet du serveur ou PM2. |
| 5. Déploiement/env | Secret réellement configuré, SITE_URL HTTPS, URL publique, clés VAPID stables et environnement du processus PM2 | NON TESTÉ | Les secrets n'ont pas été lus. SITE_URL n'apparaît pas dans .env.example et les routes retombent sur localhost. Les valeurs effectives du VPS sont inconnues. |
| 5. Déploiement/env | Précontrôle, santé et retour arrière du déploiement | À CORRIGER | Workflow : remplacement du code puis npm install et pm2 restart ; pas de précontrôle du secret, migration sur copie, sauvegarde, contrôle HTTP ou rollback automatisé. Tests CI isolés ignorant le .env, donc incapables de valider les variables du VPS. |
| 6. Sessions localStorage | Exposition des JWT aux scripts de la même origine et persistance | À CORRIGER | admin_token/client_token stockés et lus par JavaScript ; CSP contenant unsafe-inline sur les pages concernées. Risque hérité, pas une nouvelle régression. Révocation également insuffisante, R7. |
| 6. Sessions localStorage | Exploitation XSS réelle et vol d'une session navigateur | NON TESTÉ | Aucun vol ni aucune exfiltration tentés ; la présence de localStorage ne prouve pas à elle seule une XSS exploitable. |
| 7. Rappels/notifications | Calendrier Europe/Paris, refus des rappels terminés, reprise d'un échec total dans le même processus | VALIDÉ | Tests existants rejoués, y compris minuit et changements d'heure ; fournisseurs simulés. |
| 7. Rappels/notifications | Multi-instance, erreur de marquage, arrêt couvrant minuit et notification push suspendue | À CORRIGER | Deux instances de module isolées envoient deux rappels ; acceptation fournisseur suivie d'un échec SQLite provoque un nouvel envoi ; aucun rattrapage après changement de jour ; réponse de réservation retenue par le push. R10-R12. |
| 7. Rappels/notifications | Livraison Brevo/Twilio/push réelle, crash OS/PM2 et rejeu avec idempotence fournisseur | NON TESTÉ | Aucune requête fournisseur réelle. Les fenêtres de panne sont reproduites par injection d'erreur/état et instances isolées, sans tuer un processus de production. |

## Constats détaillés, par priorité

### R1 — Bloquant — Tous les rendez-vous client sont masqués

Références : `backend/routes/bookings.js:226`, `espace-client.html:890`.

L'API renvoie désormais id, service, date, heures, statut, prix et points, sans clientEmail. La page applique toujours `.filter(b => b.clientEmail === user?.email)`. Pour un utilisateur normal, undefined n'est pas égal à son email : chaque réservation est éliminée.

Preuve : création synthétique, consultation HTTP 200 avec une réservation, exécution de la fonction loadBookings réellement extraite de la page ; résultat : « Aucun rendez-vous » et compteur zéro. Les tests précédents ne vérifiaient que la réponse API.

Correction attendue : faire confiance au périmètre client imposé côté serveur et adapter le consommateur au contrat réduit, puis couvrir ensemble API et interface. Ne pas réexposer l'email uniquement pour conserver ce filtre.

### R2 — Bloquant — Migration non atomique, double crédit après interruption

Référence : `backend/config/database.js:133`.

ALTER TABLE ajoute pointsAwarded avec zéro par défaut. Une instruction distincte marque les anciens completed comme déjà crédités. Si le processus s'arrête entre les deux, le redémarrage voit la colonne et ne rejoue pas l'initialisation.

Preuve : fixture ancienne, client à dix points, réservation completed déjà créditée ; ajout de colonne persisté sans initialisation, puis migration réelle. Le marqueur reste zéro ; confirmed puis completed fait passer le solde de dix à quinze. L'interruption est simulée par son état persistant exact, sans crash matériel.

Correction attendue : migration versionnée et transactionnelle, compatible avec un état partiellement migré, avec test d'interruption/reprise. Ne pas remettre aveuglément à un tous les completed à chaque démarrage : cela masquerait de vraies anomalies et rendrait le comportement ambigu.

### R3 — Important — Règle historique de calcul des points modifiée

Référence : `backend/config/database.js:155` ; comparaison avec l'ancienne route administrative.

Avant : pointsEarned || floor(price / 10). Après : COALESCE(pointsEarned, price / 10). Zéro déclenchait le secours auparavant et ne le déclenche plus. La fixture payante à cinquante avec pointsEarned = 0 ne crédite aucun point.

Correction attendue : définir la règle métier sur les anciennes lignes, prévoir un traitement explicite et la tester. Le test prouve une différence de compatibilité ; il ne permet pas de décider si tous les zéros historiques sont erronés.

### R4 — Important — Compte non vérifié sans parcours de reprise visible

Références : `backend/routes/bookings.js:224`, `espace-client.html:886`.

Le serveur refuse correctement la consultation sans preuve de possession de l'email. La page ignore res.ok et traite le corps 403 comme une liste vide. Ni compte.html ni espace-client.html ne proposent actuellement le renvoi de vérification malgré l'endpoint backend. Les anciens comptes à emailVerified = 0 sont particulièrement concernés.

Correction attendue : message explicite et action de renvoi de vérification ; test des anciens comptes, du lien valide et du retour à l'espace client.

### R5 — Modéré — Erreur OTP présentée comme une panne serveur

Références : `compte.html:521`, `js/admin.js:40`.

Les deux fonctions lèvent une erreur pour OTP invalide/annulation puis leur catch affiche Serveur inaccessible. Reproduction en exécutant leurs sources réelles avec une réponse 401 simulée.

Correction attendue : distinguer refus d'authentification, expiration/annulation et erreur réseau, conserver un parcours de nouvelle tentative compréhensible.

### R6 — Important — Challenge 2FA non invalidé après changement de mot de passe

Références : `backend/routes/auth.js:101`, `backend/routes/auth.js:359`, `backend/config/database.js:150`.

Un challenge est obtenu avec l'ancien mot de passe. Le mot de passe est changé. Le même challenge, accompagné d'un TOTP valide, émet encore un JWT. Le trigger de changement de mot de passe supprime les resets mais ne révoque pas loginChallenge.

Correction attendue : invalider les challenges lors d'un changement/reset de mot de passe, couvrir les deux parcours. Le TOTP reste nécessaire : le constat n'est pas un contournement du second facteur à lui seul.

### R7 — Important, hérité — Droits et sessions non révoqués

Référence : `backend/middleware/auth.js:15` et `backend/middleware/auth.js:26`.

Un JWT admin émis avant rétrogradation conserve l'accès HTTP 200 aux réservations admin après passage du compte au rôle client. Le middleware ne relit ni le compte ni son rôle. La réinitialisation du mot de passe ne révoque pas non plus les JWT existants, comme déjà signalé dans le rapport initial.

Correction attendue : stratégie de révocation/version de session et validation des droits courants pour les opérations sensibles. Le défaut est antérieur au commit ; il reste pertinent pour une décision de sécurité en production.

### R8 — Important — Validation administrative incomplète

Référence : `backend/routes/admin/bookings.js:50`.

Un PATCH contenant clientEmail = not-an-email et une durée d'une minute pour visage est accepté HTTP 200. Le contrôle vérifie principalement des valeurs truthy, un prix entier et la plage horaire, pas l'email, le type des champs ni la cohérence avec le service.

Correction attendue : validations métier partagées avec la création ; préciser si une durée personnalisée est autorisée à l'administration avant d'en imposer une. Le fait que l'email invalide soit accepté est établi indépendamment de cette décision métier.

### R9 — Important, hérité — Annulation client d'un rendez-vous terminé

Référence : `backend/routes/bookings.js:272`.

Après completed et attribution de quatre points, le lien d'annulation client répond 200, passe le rendez-vous en cancelled et conserve les points. Cela casse la cohérence du statut/historique si completed est considéré final.

Correction attendue : définir et imposer les transitions métier autorisées ; ne pas débiter automatiquement les points sans règle validée. Cette possibilité existait déjà et n'a pas été fermée par l'uniformisation des statuts.

### R10 — Important — Livraison et marquage des rappels non atomiques

Références : `backend/utils/reminders.js:9`, `backend/utils/reminders.js:52`.

Deux instances isolées du module réel, chacune avec son verrou running, lisent la même réservation et envoient chacune un rappel. Ce test représente deux états de processus, pas un déploiement PM2 réel. Autre preuve : le fournisseur accepte le rappel, un trigger de test refuse reminderSentAt ; l'appel suivant envoie une seconde fois.

Correction attendue : état durable de tentative, acquisition/lease partagée, reprises bornées et idempotence fournisseur lorsque disponible. Un verrou local ou une transaction tenue pendant l'appel réseau ne suffit pas à garantir une livraison exactement une fois.

### R11 — Important — Pas de rattrapage des rappels après minuit

Référence : `backend/utils/reminders.js:16`.

La requête sélectionne uniquement appointmentDate = demain. Une panne couvrant toute la fenêtre J-1, puis une reprise le jour du rendez-vous, laisse les rappels non envoyés hors de la sélection. Aucun rattrapage n'est lancé au démarrage du scheduler.

Correction attendue : définir une fenêtre utile de rattrapage avant le rendez-vous, y compris à la reprise, et éviter l'envoi d'un message « demain » lorsque le rendez-vous est aujourd'hui.

### R12 — Important — Push bloqué, réservation enregistrée mais réponse suspendue

Références : `backend/routes/bookings.js:207`, `backend/utils/push.js:39`.

Les exceptions sont interceptées, mais la réservation attend encore le broadcast push. Avec un fournisseur push ne terminant pas sa promesse, la ligne SQLite existe et la réponse HTTP reste pendante. Contrairement à Brevo/Twilio, web-push ne reçoit pas ici de délai d'attente explicite. Le test libère ensuite la promesse et vérifie le HTTP 201 ; aucune connexion n'est laissée pendante.

Correction attendue : séparer la confirmation HTTP de la livraison persistante des notifications, ou au minimum borner strictement toute attente ; conserver une reprise pour les confirmations en échec.

## Sessions localStorage

La lecture/écriture des JWT est confirmée dans compte.html, espace-client.html et js/admin.js. Une XSS ou un script compromis chargé dans cette origine peut les lire ; une déconnexion locale ne les révoque pas côté serveur. Le stockage persiste au-delà de la fermeture d'un onglet.

[OWASP recommande de ne pas stocker les identifiants de session dans localStorage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html). Une migration vers cookies Secure/HttpOnly/SameSite doit intégrer la protection CSRF et les contraintes d'origine ; remplacer localStorage par sessionStorage ne supprime pas l'accès JavaScript. Une politique CSP plus stricte et une stratégie de révocation sont à prévoir. Aucune XSS exploitable n'est affirmée sur la seule base de ce stockage ou de unsafe-inline.

## Déploiement et prérequis manquants

La validation JWT stricte est correcte mais incompatible avec tout ancien secret court/défaut. Les tests forcent une valeur de test et ignorent le .env réel : leur succès ne dit rien du secret du VPS. Node 22 est utilisé localement et en CI ; la version réelle de production reste inconnue.

Avant déploiement : contrôler sans afficher les secrets la présence/qualité du JWT, l'URL publique HTTPS SITE_URL, les clés VAPID persistantes, DATABASE_FILE et l'environnement du processus PM2 ; migrer une copie de préproduction ; sauvegarder et tester une restauration ; établir un health check et un rollback. Aucun de ces contrôles sur la production n'a été tenté ici.

La CI autorise le déploiement sur push main. Un simple pm2 restart ne valide ni une migration réussie ni la disponibilité HTTP. Les changements d'environnement injectés via PM2 doivent être appliqués selon la configuration effective du service ; cette configuration n'est pas fournie et n'est pas présumée.

## Tests exécutés et portée

- `npm test -- tests/independent-review.test.js` : revue ciblée, puis corrections du seul dispositif de test (compteur de mock).
- `npm test -- --silent` depuis backend : **8 suites, 61 tests passent**, soit les 45 précédents et 16 nouveaux scénarios.
- Parmi les 16 nouveaux scénarios, deux confirment des propriétés positives et quatorze assertions reproduisent des défauts. Les tests intitulés FINDING sont des preuves diagnostiques du comportement actuel, pas des critères d'acceptation sains. Lors de corrections futures, leurs attentes devront être inversées vers le comportement attendu.
- Ancien schéma : extrait de `57d0b97^:backend/config/database.js`, enregistré dans review-legacy-schema.sql. Aucune extraction de données existantes.
- Fixtures disque : dossiers temporaires uniques isbeauty-review-*, uniquement générés pour cette revue et supprimés après fermeture des connexions. Aucun chemin de base réelle utilisé.
- Migration : vraie initializeDatabase, vraies tables/triggers, réouverture, deux connexions concurrentes. Pas de validation de charge ou de coupure matérielle.
- Interfaces : sources réelles des fonctions exécutées dans Node VM ; DOM, fetch et saisie OTP simulés. Ce n'est pas un test navigateur de bout en bout.
- Notifications : fournisseurs simulés ; erreurs de marquage et attente réseau injectées ; deux instances du module réel isolées. Pas d'envoi externe ni de test PM2/OS.
- Vérifications syntaxiques Node des nouveaux fichiers et contrôle de whitespace Git. Le constat sur le cache PWA repose sur la lecture du service worker ; appareils installés non testés.

Fichiers ajoutés pour la revue :

- `backend/docs/INDEPENDENT_SECURITY_REVIEW.md` : ce rapport.
- `backend/tests/independent-review.test.js` : scénarios diagnostiques reproductibles.
- `backend/tests/review-migration.mjs` : sonde isolée de migration sur disque.
- `backend/tests/review-legacy-schema.sql` : schéma ancien, sans données réelles.

## Critères de levée du NO-GO

Pour la fusion : corriger R1 et R2, traiter les régressions de compatibilité et parcours R3-R6, préciser les invariants R8-R9 et ajouter des tests d'acceptation qui vérifient les résultats utilisateur. Documenter le traitement des comptes historiques et l'invalidation du cache PWA. Formaliser le sort des risques hérités R7 et localStorage, sans les confondre avec une validation positive.

Pour la production : satisfaire les critères de fusion, corriger/encadrer R10-R12, valider en préproduction navigateur et environnement de démarrage, migration/restauration, notifications, PM2 et reprise après arrêt. Tant que ces preuves manquent, maintenir l'interdiction de déploiement.

**Recommandation finale pour la fusion dans main : NO-GO.**

**Recommandation finale pour le déploiement en production : NO-GO.**
