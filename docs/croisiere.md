# Croisière (phase 9)

La croisière est le régime permanent d'Upgrade : ce n'est pas une phase qui se termine, c'est une routine légère qui garde le contenu juste et le système utile. Règle 70/30 : une séance de code sur trois au plus ; la plupart des séances produisent du contenu sourcé ou de la pratique.

**Ce que ça change pour l'objectif de l'utilisateur** : un curriculum périmé fait dire des choses fausses en entretien ; un système qu'on n'ose pas réduire finit abandonné. La croisière garde le contenu à jour et coupe ce qui ne sert pas.

## Chaque mois (une séance de contenu, environ deux heures de travail de Claude)
1. `python -I scripts/audit_croisiere.py` : faits périssables à revoir (plus de six mois), rythme des kits, fraîcheur du Brief. Revérifier d'abord les contenus signalés, puis écrire du nouveau.
2. **Quatre nouveaux kits** (`docs/fondations.md` : méthode, validateur, sources lourdes à lire dans le navigateur intégré). Cible : 48 kits ; 25 au 2026-10-12, soit environ six mois.
3. **Erreurs signalées** : l'utilisateur donne le chemin d'une sauvegarde récente ; `python -I scripts/signalements.py chemin/sauvegarde.json` affiche les cartes signalées avec leur contenu et leurs sources ; relire la source, corriger `content/`, relancer le `build_*.py` concerné, committer.
4. **Une note de l'atelier** (`docs/atelier.md`) sur un dossier d'actualité : trois documents sourcés, une note modèle dont chaque nombre est dans le corpus.
5. **Quelques dictées** de plus si l'utilisateur a fait la moitié des 40 (`docs/dictees.md`).
6. Tests (`python -m unittest discover -s tests -t .`, `tests/index.html`), commit, mise à jour de l'état dans `CLAUDE.md`. Demander l'accord avant tout `git push`.

## Chaque trimestre
- **Audit d'usage** par l'utilisateur dans `#/bilan/audit` (décisions garder, réduire, supprimer, approfondir) ; la séance suivante applique les décisions (supprimer d'abord).
- Lancer `python -I scripts/check_links.py` sur `content/` et vérifier à la main les sites qui bloquent les robots.
- Relire les paquets de cartes les plus signalés.

## Calendrier connu
| Date | Action |
|---|---|
| 2026-11-15 | fin du sprint de candidature ; l'utilisateur a écrit pitch, histoires STAR, premiers entraînements, décision provisoire |
| 2026-12-10 | vérifier que le cron « Brief quotidien » tourne (règle des 60 jours de GitHub) |
| 2026-12 | premier audit trimestriel ; première revue des faits périssables de l'automne (taux, barèmes, ZAN) |
| trois mois après la première séance de l'utilisateur (vers janvier 2027) | lire les six repères du bilan : `#/bilan` affiche la date exacte |
| 2027-04 | revoir tous les faits périssables du 2026-10-11 et 2026-10-12 (l'audit les liste) |

## Réserve de kits (ordre de valeur pour les entretiens, à vérifier au moment d'écrire)
- **F Métier et marché** : F2 le marché de l'évaluation (cabinets, agences, attributaires de marchés d'études) ; F3 les outils (SQL, R ou Python, Quarto, QGIS) ; F4 conduire un entretien d'information ; F5 les marchés publics d'études.
- **D Histoire, géographie, géopolitique** : D2 repères chronologiques de l'histoire de France (jusqu'à cent jalons) ; D3 géographie de la France (métropolisation, ruralités, littoraux) ; D4 géopolitique (Europe, Moyen-Orient, Indo-Pacifique) ; D5 mondialisation et commerce.
- **E Arts, lettres, idées** : E2 grands courants artistiques ; E3 cent œuvres littéraires ; E4 économie et sociologie (de quelques auteurs et concepts repères) ; E5 philosophie politique.
- Autres : compléter les sigles (49 sur 60 visés), employeurs 33 et plus du radar, spécialités AOP et IGP (INAO), personnalités par département, fleuves sur la carte, matrice de compétences à partir du projet VEILLE quand il aura assez d'offres taguées.
Chaque kit suit la règle du dépôt : sources lues, au moins deux sources distinctes, faits périssables datés.

## Ce que fait l'automatique, et ce qu'il ne fait pas
- Le Brief est reconstruit chaque matin par GitHub Actions (cron) et committé. Si l'audit signale un Brief ancien de plus de trois jours : onglet Actions du dépôt, ou `python -I scripts/build_brief.py` en local puis commit et push (avec accord).
- Rien d'autre ne tourne tout seul : les kits, dictées et notes se produisent en séance.
