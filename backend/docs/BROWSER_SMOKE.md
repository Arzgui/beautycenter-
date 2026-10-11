# Test navigateur portable — PR #2

Le test utilise Chrome/Chromium headless via CDP, sans dépendance npm supplémentaire. Il ne télécharge et n'installe aucun navigateur sur la machine qui le lance.

Depuis `backend`, avec Node 22 :

```sh
# Linux : chemin d'un navigateur déjà installé, ou commande présente dans PATH
CHROME_PATH=/usr/bin/chromium node tests/browser-smoke.mjs
```

```powershell
# Windows : chemin d'un navigateur déjà installé
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/browser-smoke.mjs
```

Sans CHROME_PATH, le script cherche les commandes Chrome/Chromium dans PATH, les installations Windows sous Program Files/Program Files (x86)/LocalAppData et les emplacements Linux usuels, dont /snap/bin/chromium. Un CHROME_PATH explicitement incorrect provoque une erreur ; il n'est pas remplacé silencieusement. En l'absence de navigateur, le message propose CHROME_PATH ou le job CI et le script échoue avant création de base/serveur. Un VPS sans navigateur n'a donc pas à être modifié : utiliser la CI.

Le workflow `.github/workflows/deploy.yml` ajoute un job indépendant `Browser smoke (Ubuntu)` sur ubuntu-latest, Node **22.22.3**, avec npm ci. [setup-chrome](https://github.com/browser-actions/setup-chrome) installe Chrome stable et ses bibliothèques **sur le runner GitHub uniquement** ; sa sortie chrome-path est transmise via CHROME_PATH. Aucun SSH, accès au VPS, migration distante ou déploiement. Le sandbox Chrome reste actif.

Premier essai CI : installation Chrome, tests backend et audit réussis, mais lancement refusé par AppArmor (`No usable sandbox`). Le job configure donc un profil AppArmor permettant userns pour **le chemin exact du binaire Chrome installé**, uniquement sur le runner éphémère. Aucun sysctl global modifié, aucun --no-sandbox ajouté. Cette configuration suit la [documentation Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md) ; elle ne doit pas être appliquée au VPS pour y faire tourner ce test.

Le test conserve sa base, son profil et ses identifiants synthétiques sous un répertoire temporaire unique. Le fichier .env réel est ignoré ; clés Brevo/Twilio/VAPID neutralisées, requêtes HTTPS du navigateur bloquées, réseau de fond désactivé. Les données temporaires sont nettoyées après arrêt du serveur et du navigateur. Les erreurs de lancement et de sortie prématurée de Chrome sont désormais rapportées avec stderr, sans attente inutile du délai DevTools.

Validation locale Windows, Node 22.15.0 : **11 suites / 138 tests réussis**, dont sept régressions de résolution (CHROME_PATH, priorité/erreur, PATH Linux, emplacement Linux, Program Files Windows, absence Linux sans repli Windows). Test navigateur réel réussi, zéro exception JavaScript ; **npm audit --omit=dev --json : zéro vulnérabilité, code 0**. Aucun changement de dépendance, planning, migration ni secret. Le job Ubuntu vérifie séparément le lancement réel Linux et les parcours client/admin ; son résultat est disponible dans les contrôles de la PR.

Les risques de maintenance sqlite3, les alertes npm dev et les limites de session/notification documentés dans DEPENDENCY_REMEDIATION.md restent inchangés. Ubuntu du runner ne constitue pas un test sur le VPS Ubuntu 26.04 ; celui-ci n'a pas été contacté.
