# PR #2 — cohérence du compte et de l'adresse email

11 octobre 2026, branche fix/single-professional-planning. Correction complémentaire à FINAL_INTEGRATION.md ; les validations précédentes décrivent leur instantané avant cette revue.

## Défaut confirmé

PATCH /api/admin/bookings/:id ne vérifiait le compte vérifié et son adresse que si userId changeait. Modifier clientEmail en conservant ou omettant userId pouvait maintenir une association incohérente. L'ancien test acceptait ce comportement en vérifiant seulement l'absence de transfert de points ; il a été remplacé.

## Comportement corrigé

- Chaque modification avec un userId non nul exige un compte vérifié dont l'adresse correspond à clientEmail, sans distinction de casse. Une association incohérente donne HTTP 400, sans modification du rendez-vous.
- Avant attribution des points, changer l'adresse exige de retirer explicitement l'association (userId null) ou de choisir explicitement un autre compte vérifié correspondant. Aucun rattachement ou détachement silencieux.
- Une réservation invitée sans compte peut changer d'adresse sans être associée automatiquement au propriétaire de cette adresse.
- Après attribution, la protection existante interdit réaffectation/détachement (409). Conserver le bénéficiaire avec une autre adresse est désormais refusé (400). Solde, bénéficiaire, pointsEarned et pointsAwarded restent inchangés. Les coordonnées non conflictuelles restent modifiables.
- Le WHERE de l'UPDATE revérifie également l'existence, la vérification et l'adresse du compte ; une modification du compte entre lecture et écriture provoque 409 sans écriture du rendez-vous. Le garde-fou concurrent contre une réaffectation après crédit est conservé.

## Tests exécutés

`npm test -- --silent` : **9 suites, 105 tests réussis**. Onze scénarios de cohérence remplacent un ancien scénario trop permissif : adresse différente avec userId identique ou omis, casse de l'adresse, compte devenu non vérifié, invitée, détachement explicite, remplacement explicite vérifié, trois tentatives sur réservation déjà créditée et changement de compte entre validation/écriture. Les suites de planning, sécurité, migrations sur copies synthétiques et concurrence restent exécutées.

`node tests/browser-smoke.mjs` : succès, zéro exception JavaScript non interceptée ; 2FA admin, durée et indisponibilité configurables, calendrier Paris depuis Honolulu, horaires disponibles, réservation invitée et espace client. Syntaxe Node des fichiers JS modifiés et git diff --check : succès.

## Compatibilité et limites

Aucune migration, aucune modification des soldes historiques, aucune donnée de production touchée. Planning d'une seule professionnelle, 09:00–19:00 et grille de 15 minutes inchangés. Le formulaire existant permet déjà de choisir explicitement le compte ou « aucun compte » ; les erreurs du serveur restent affichées.

Les incohérences historiques éventuelles ne sont pas réparées automatiquement. Une édition générale les refuse tant qu'une association cohérente n'est pas explicitement fournie ; un crédit déjà attribué n'est jamais déplacé. Aucun audit ou rapprochement de production réalisé. Les limites localStorage/CSP, TOTP et notifications décrites dans FINAL_INTEGRATION.md restent présentes ; les quatre tests FINDING continuent de les reproduire.

Aucune fusion ni aucun déploiement.
