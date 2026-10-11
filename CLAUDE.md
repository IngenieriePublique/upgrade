# CLAUDE.md : projet UPGRADE

**But** : système personnel 100 % gratuit pour l'utilisateur (M2 ingénierie du développement territorial, Bordeaux) qui vise l'évaluation et le pilotage des politiques publiques (département, région, SGAR, Paris). Il remplace ses réseaux sociaux par une boucle quotidienne finie de 60 minutes : actualité (Brief), cartes à répétition espacée, mini-jeu des territoires, curriculum (institutions, finances locales, évaluation, culture générale), dictées, atelier d'écriture, oral et réseau, radar métier. Le plan complet est dans `PLAN.md` : **lisez `PLAN.md` puis ce fichier avant toute séance**.

## Règles de travail
- Une séance = une phase (ou moitié de phase) du tableau de `PLAN.md`. En fin de séance : tests, commit git, mise à jour du tableau de `PLAN.md` et de ce fichier ; l'utilisateur fait `/clear`.
- Règle 70/30 à partir de la phase 2 : au plus une séance de code sur trois, les autres produisent du contenu ou de la pratique. Pas de fonctionnalité sans une phrase « ce que ça change pour les objectifs de l'utilisateur ».
- Réponses à l'utilisateur en français. Chemins relatifs uniquement (dossier déplaçable).
- Site statique : `site/` est la racine publiée (GitHub Pages). JavaScript natif en modules ES, SVG, aucune dépendance externe en production. Python (stdlib de préférence) pour fabriquer les données dans `scripts/`. Node n'est pas installé.
- Python 3.14 : éviter les paquets à extension C sans wheel. Scripts qui lisent des données téléchargées : `python -I`.
- Aucune donnée personnelle dans le dépôt (il sera public) : la progression de l'utilisateur vit dans le navigateur (IndexedDB) et dans des sauvegardes JSON hors dépôt.
- **Demander l'accord avant** : création ou push du dépôt GitHub, téléchargement volumineux, installation d'un outil, réglage système (blocage des réseaux sociaux : l'utilisateur l'applique lui-même, on lui donne les instructions).
- Git : identité non configurée ; committer avec `git -c user.name=IngenieriePublique -c user.email=341136821+IngenieriePublique@users.noreply.github.com commit ...`.

## Règles de contenu (anti-hallucination)
- Une fiche n'est jamais écrite de mémoire : récupérer les sources (Wikipédia/Wikidata, Vie-publique, Légifrance, INSEE, Cour des comptes, data.gouv, INAO), reformuler ce qui a été lu, citer au moins 2 sources, marquer les faits périssables (noms, taux, barèmes) avec une date de revue. Valider avec `scripts/validate_content.py` (à écrire en phase 5).
- Droits : texte Wikipédia = CC BY-SA (attribution) ; données Etalab OK ; presse = titre, lien et une phrase de chapô, jamais d'article payant.
- Pas de LLM local (15 Go de RAM, GPU intégré ; Qwen déjà jugé insuffisant dans Projet AUTONOMIE). IA en ligne gratuite facultative, jamais bloquante, repli « prompt à coller » (voir `docs/decisions.md`).

## Contexte machine et projets voisins
- Windows 11, PowerShell/Git Bash, Python 3.14.1, git 2.56, Edge 155 (voix françaises natives installées : Hortense ; voix « Natural » en ligne dans Edge à tester en phase 6). `gh` (GitHub CLI) n'est pas installé.
- **Projet VEILLE** (`C:/Users/<utilisateur>\Desktop\Projet VEILLE\Code`) : veille d'offres d'emploi, `data/veille.db`, colonne `offres.tag` (oui / peut-etre / non). À utiliser **en lecture seule** pour la matrice de compétences (phase 3). Embeddings `bge-m3` via Ollama déjà installés.
- **Projet AUTONOMIE** : sans rapport ; ne pas y toucher.

## Architecture cible
Voir « Architecture » dans `PLAN.md` (dossiers `site/`, `content/`, `scripts/`, `tests/`, `.github/workflows/`). Décisions techniques clés : cartes SVG précalculées en Python (Lambert-93), répétition espacée maison de type SM-2 avec journal complet des révisions (migration FSRS possible), dictée sur papier avec marquage des fautes à l'écran, Brief plafonné à 13 items par jour.

## Fonctionnement du noyau (phase 1)
- `site/js/srs.js` : fonctions pures (SM-2 à 4 notes). L'état d'une carte se **déduit toujours du journal** (`replay`) ; `store.js` écrit journal + état dans une même transaction IndexedDB. Ne jamais modifier l'état sans écrire au journal.
- Contenu : `content/cartes/<paquet>.json` (source de vérité, 2 sources minimum par carte) → `python scripts/build_content.py` valide et écrit `site/data/cartes/`. Un nouveau paquet = un fichier de plus, rien d'autre à déclarer.
- Tests : `python -m unittest discover -s tests -t .` et `tests/index.html` dans le navigateur (serveur : `python -m http.server 8765 --bind 127.0.0.1` ; le port 8000 est pris sur cette machine).
- Sur localhost le service worker est désactivé (sinon on voit d'anciens fichiers) ; `?sw` l'active. Ne jamais passer `null` à `replaceChildren`/`append` (écrit « null ») : utiliser `fill()` de `ui.js`.
- Sites bloquant les robots (403) : ademe.fr, prefectures-regions.gouv.fr. Certificat incomplet côté Python : cnfpt.fr. Vérifier ces liens à la main.
- Brief (phase 2) : `scripts/fetch_sigles.py` et `find_second_sources.py` montrent la méthode (API Wikipédia + Wikidata P856 + liens externes vérifiés) réutilisable pour les fiches.

## Etat
Phases 0 et 1 terminées (2026-10-11). Dépôt GitHub non créé (l'utilisateur le crée à la main sur github.com, nom « upgrade », public, puis `git remote add origin ...` et push : demander l'accord avant). Prochaine séance : phase 2 (Brief, S3), ou, avant, pratique : l'utilisateur fait ses cartes quelques jours.
