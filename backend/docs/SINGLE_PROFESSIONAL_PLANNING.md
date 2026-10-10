# Planning d'une seule professionnelle

11 octobre 2026 — branche `fix/single-professional-planning`, issue de `fix/security-bookings-auth` (3d6615b). Aucune fusion, aucun déploiement, aucun accès aux données de production.

## Mécanismes réutilisés

Le planning existant est déjà commun à toutes les prestations, sans séparation par zone ou cliente. Les triggers SQLite de réservation vérifient atomiquement les chevauchements via `existingStart < newEnd AND newStart < existingEnd` : intervalle [début, fin), donc rendez-vous consécutifs permis. Les indisponibilités sont contrôlées dans les deux sens, y compris réservation et blocage simultanés. Aucun nouveau schéma ni nouvelle migration nécessaire.

L'API calcule les départs toutes les 15 minutes entre 09:00 et 19:00, selon la durée configurée dans schedules, les réservations et les indisponibilités. La fin ne dépasse pas 19:00 ; les dates et horaires passés sont refusés selon Europe/Paris. Le dimanche fermé existant est conservé. Les autres fermetures datées se configurent dans Administration → Configuration → Indisponibilités, de 09:00 à 19:00 ; une pause utilise une plage plus courte. Un blocage qui chevauche un rendez-vous actif est refusé : déplacer ou annuler explicitement ce rendez-vous avant fermeture.

Les durées (minutes entières, 15–600) se modifient depuis la même page. Une durée peut être de 20 minutes ; seuls les départs publics suivent la grille de 15 minutes. Aucun temps de pause obligatoire. Les anciennes fins enregistrées sont préservées lors d'un changement de durée. Une modification admin de date, début ou prestation recalcule la fin et passe par le trigger ; une simple modification de coordonnées conserve la durée historique. Les administrateurs conservent les départs particuliers à la minute.

## Ajustements

- js/script.js affiche exclusivement availableSlots renvoyés par le serveur ; les horaires bloqués ne sont plus visibles en grisé. Une sélection disparue est retirée lors du rafraîchissement. Le message sans horaires couvre aussi fermetures et durées incompatibles.
- Le rafraîchissement existant sur date/prestation, retour au premier plan et toutes les 30 secondes est conservé. Les annulations/modifications sont visibles à la prochaine requête ; le contrôle atomique reste déterminant au moment de la réservation.
- admin.html explique comment configurer une fermeture entière ou une pause, sans changer les styles.
- Les tests de rappels utilisaient encore « demain UTC » : échec reproduit entre minuit Paris et minuit UTC, fixture alignée sur tomorrowParis. Aucun changement du fonctionnement des rappels.

## Validation

- `npm test -- --silent` dans backend : **9 suites, 90 tests réussis**, dont six nouveaux scénarios : prestations différentes consécutives, concurrence entre prestations différentes, déplacement admin et dépassement de fermeture, journée fermée puis réouverte, fin exacte à 19:00 et annulation, durée de 20 minutes.
- Les régressions déjà présentes couvrent les durées configurables, les limites, les pauses, l'annulation, les modifications et les conflits simultanés. Les tests de migration sur copies anciennes synthétiques restent exécutés dans la suite complète.
- `node tests/browser-smoke.mjs` : Chrome réel sur serveur/base/profil isolés ; grille affichée identique à availableSlots, aucun horaire bloqué ou dépassant la fermeture, configuration durée/indisponibilité, réservation invitée et parcours authentifiés. Aucune exception JavaScript non interceptée ; aucun fournisseur réel sollicité.
- Syntaxe Node et `git diff --check` vérifiés. La suite conserve quatre tests FINDING qui reproduisent des limites connues des notifications ; leur succès ne signifie pas correction de ces risques.

## Limites inchangées

Pas de diffusion instantanée inter-navigateurs : actualisation périodique, puis rejet HTTP 409 si le créneau a été pris entre-temps. Les fermetures exceptionnelles sont datées ; aucun nouvel éditeur de fermeture hebdomadaire récurrente n'est ajouté. Les conflits historiques, localStorage et limites des notifications restent décrits dans PR1_FOLLOWUP.md. Aucune donnée existante réécrite par cette adaptation.
