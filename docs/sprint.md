# Sprint candidature (phase 3)

**Ce que ça change pour tes objectifs** : les stages de mars se publient de novembre à février ; en six étapes courtes (radar, pitch, histoires STAR, oral, un contact humain, une décision provisoire) tu arrives à mi-novembre avec des cibles, un récit prêt et au moins un entretien d'information planifié.

## Écrans (menu « Candidature », `#/sprint`)
| Écran | Fichier | Contenu |
|---|---|---|
| Sprint | `site/js/modules/sprint.js` | six étapes, progression, jours restants (fin le 2026-11-15, `SPRINT_FIN` dans `candidature.js`) |
| Radar | `radar.js` | 32 employeurs sourcés, filtres, fiche, statut et notes personnels, portails d'offres |
| Pitch et STAR | `recit.js` | pitchs 30 s / 90 s / 3 min, 8 emplacements d'histoires STAR, estimation de durée, « prompt à coller » |
| Oral | `oral.js` + `recorder.js` | 82 questions, enregistreur local (MediaRecorder), compteur de tics, auto-évaluation sur 4 critères |
| Réseau | `reseau.js` | guide de l'entretien d'information, message modèle, contacts, règle « un contact par semaine » |
| Concours ou contrat | `choix.js` | note de décision sourcée, grille, décision provisoire |

Pendant le sprint, le bloc « profond » de **Aujourd'hui** devient « Sprint candidature » et affiche la prochaine étape. Après le 15 novembre il redevient le bloc du jour.

## Données
- **Contenu public** (dépôt) : `content/radar/employeurs.json`, `content/radar/note-carriere.json`, `content/oral/questions.json`, `content/oral/gabarits.json`. `python scripts/build_sprint.py` valide et publie dans `site/data/radar/` et `site/data/oral/`. `tests/test_build_sprint.py` vérifie que la publication est à jour.
- **Données personnelles** (jamais dans le dépôt) : pitch, histoires, statuts du radar, contacts, entraînements, décision. Elles vivent dans le magasin IndexedDB `notes` (base version 2) sous un identifiant `genre:clé` : `pitch:p90`, `star:s1`, `radar:<employeur>`, `contact:<ts>`, `oral:<ts>`, `decision`. Elles sont incluses dans l'export JSON (`notes`) ; à l'import la version la plus récente de chaque note l'emporte, et une suppression laisse une pierre tombale pour ne pas ressusciter une vieille note.
- **Audio** : jamais conservé ni envoyé. Il reste en mémoire dans la page tant qu'elle est ouverte ; le bouton « Télécharger l'audio » le sauve sur le disque de l'utilisateur.

## Règles de contenu appliquées
- Chaque fiche employeur cite ≥ 2 sources distinctes, porte une date de revue et la marque « périssable ». `a_verifier` dit honnêtement ce que les robots n'ont pas pu lire (ademe.fr, prefectures-regions.gouv.fr, cnfpt.fr, Légifrance) ou ce que les pages ne disaient pas.
- La priorité A/B/C et le texte « Lecture Upgrade » sont des jugements de travail, signalés comme tels à l'écran. Les questions d'entretien n'ont pas de réponse rédigée : seulement ce que le jury cherche et une piste de méthode.
- `python -I scripts/check_links.py` teste toutes les adresses de `content/radar` et `content/oral` (86 testées le 2026-10-11, 0 échec ; 3 sites à contrôler à la main).

## Ajouter ou mettre à jour un employeur
1. `python -I scripts/fetch_employeurs.py data_local/employeurs_sources.json` (ajouter la clé dans `CANDIDATS`) : extrait Wikipédia, site officiel (Wikidata), liens de recrutement trouvés sur la page d'accueil.
2. Lire la page de recrutement ; ne rien affirmer que les sources ne disent pas (lieu, effectifs, voies d'entrée).
3. Ajouter la fiche à `content/radar/employeurs.json`, lancer `build_sprint.py` puis `check_links.py`, puis `python -m unittest discover -s tests -t .`.

## Constats de la recherche (2026-10-11)
- France Stratégie a disparu en mai 2025 au profit du Haut-commissariat à la Stratégie et au Plan ; Wikipédia annonce la transformation de la DITP en « direction des Services publics » en 2026 : noms à revérifier avant de candidater.
- La page d'offres de la SFE est la liste la plus ciblée sur l'évaluation ; elle ne comptait ce jour-là qu'une offre d'emploi et aucun stage. La CRC Nouvelle-Aquitaine n'avait que des offres de greffier.
- L'organigramme du SGAR n'a pas pu être lu (accès refusé aux robots) : à ouvrir à la main.
- La veille VEILLE (lecture seule) ne permet pas encore de dater un calendrier de stages : la base ne couvre que quelques semaines de collecte. À reprendre après quelques mois.
