# First Upgrade

Ce que ça change pour l'utilisateur : une page qu'on ouvre quand on en a envie, sans compteur, sans série, sans quota ; quatre activités de dix minutes au plus, chacune sur un seul écran. Le système Upgrade complet (boucle de 60 minutes, curriculum, dictées, atelier, sprint de candidature, bilan) est mis en veille, pas supprimé.

## Les quatre activités

| Hexagone | Route | Ce que c'est | D'où ça vient |
|---|---|---|---|
| Jeu des territoires | `#/territoires` (`?m=melange\|dep\|reg\|pref`) | Séries de 10 questions : placer ou nommer un département ou une région, numéro, région d'un département, préfectures (les « communes importantes » : préfectures de département et de région). | `site/js/territoires.js` + `carte-svg.js` (logique et cartes d'Upgrade) ; données `site/data/territoires`, `geo` |
| Cartes de culture | `#/cartes` (`?t=tout\|territoires\|sigles\|fonction\|finances`) | Séries de 10 cartes à répétition espacée (Encore / Difficile / Bien / Facile). Thèmes : territoires (géographie + kits A03 à A09), sigles, fonction publique (kits A01, A02, F01), finances et évaluation (kits B et C). | `site/js/srs.js`, `store.js` ; données `site/data/cartes`, `fondations` |
| Brief d'actualité | `#/brief` (`?r=tout\|france\|monde\|action_publique`) | Titres, source et chapô de la presse du jour (Le Monde, franceinfo, Cour des comptes…), paginés selon la hauteur de l'écran. | `site/data/brief/latest.json` (produit par `scripts/build_brief.py`, cron `brief.yml`) |
| Lecture territoriale | `#/lecture` (`?t=<thème>&id=<lecture>`) | Une lecture du jour (article, rapport ou presse, 2020-2026), « Une autre lecture », « Marquer comme lue ». | `content/lectures/lectures.json` → `site/data/lectures/` |

La progression (cartes, territoires, lectures lues) est stockée dans IndexedDB (base `upgrade`, la même que l'ancien système) : rien n'est dans le dépôt. Sans stockage disponible (navigation privée), les activités restent jouables, la progression vit en mémoire.

## Ajouter une lecture

1. Trouver le texte, **lire sa notice** (HAL, OpenEdition, Cairn, Sénat, Public Sénat, Cour des comptes…) et vérifier titre, auteurs, revue, année, pages, accès.
2. Ajouter une entrée dans `content/lectures/lectures.json` : `resume` reformulé d'après le résumé de l'auteur (500 caractères au plus pour tenir sur l'écran), `url` ouvrant sur un texte accessible (HAL de préférence) et `doi` (version de l'éditeur, par exemple Cairn) si connu. Période 2020-2026.
3. `python scripts/build_lectures.py` (valide et publie), `python -m unittest discover -s tests -t .`.

Méthode de recherche utilisée le 2026-10-12 : l'API de HAL (`api.archives-ouvertes.fr`, filtres : français, 2020-2026, accès ouvert, résumé présent) car Cairn bloque les robots (403) ; les DOI Cairn sont repris quand HAL les donne. Les 19 lectures initiales ont toutes été retrouvées dans une notice lue ; deux n'ont pas de PDF HAL (Fijalkow : DOI OpenEdition ; rapport du Sénat : notice du Sénat).

## Fichiers

- `site/index.html` : page d'accueil de First Upgrade ; `site/first/css/first.css` (charte VEILLE) ; `site/first/js/` : `main.js` (routeur, magasin), `accueil.js` (hexagones), `cadre.js` (barre, filtres), `territoires.js`, `cartes.js`, `brief.js`, `lecture.js`, `icones.js`.
- Tests : `tests/first.test.js` (JS, via `tests/index.html`) et `tests/test_lectures.py`.
- Serveur local : `.claude/launch.json` (port 8765) ; First Upgrade est sur `http://127.0.0.1:8765/site/`.
- Aucune page ne doit défiler (`html, body { overflow: hidden }`) : vérifier à 1280×720 et à 375×667 après toute modification de mise en page.

## Relancer Upgrade (l'ancien système)

- L'ancienne application est `site/upgrade.html` (ancien `site/index.html` renommé avec `git mv`). Elle fonctionne telle quelle : `http://127.0.0.1:8765/site/upgrade.html` en local.
- Sa base IndexedDB `upgrade` est partagée avec First Upgrade : les cartes et territoires déjà travaillés dans First Upgrade apparaissent dans la révision d'Upgrade (et inversement). Les quotas de « nouvelles cartes par jour » d'Upgrade comptent aussi les nouvelles cartes vues dans First Upgrade.
- Pour en refaire la page d'accueil du site : remettre `upgrade.html` sous le nom `index.html` (et déplacer l'accueil de First Upgrade, par exemple en `first.html`, dont les chemins `first/...` ne changent pas), puis rétablir `cache.match('index.html')` dans `site/sw.js` et changer `VERSION` (sw.js et version.js). Relire `PLAN.md` (tableau d'état) et la section « Croisière » de `CLAUDE.md` : le calendrier est à reprendre à zéro.
- Les workflows (`pages.yml`, `brief.yml`, `validate.yml`) n'ont pas changé : le Brief continue d'être produit chaque jour par le cron, ce qui alimente aussi First Upgrade.

## Service worker

First Upgrade n'a pas de service worker (pas de mode hors ligne pour l'instant). Au chargement, il désenregistre celui de l'ancien système et vide ses caches (`upgrade-*`) pour ne pas servir de vieux fichiers ; le service worker d'Upgrade se réinstalle quand on ouvre `upgrade.html` sur un site publié (pas sur localhost). `sw.js` est passé en `upgrade-0.8.1` (liste CORE : `upgrade.html` ajouté).
