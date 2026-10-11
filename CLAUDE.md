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
- Git : l'identité locale du dépôt est « IngenieriePublique <341136821+IngenieriePublique@users.noreply.github.com> » (déjà configurée, un simple `git commit` suffit). Le dépôt est public : **ne jamais écrire l'adresse mail personnelle ni le prénom de l'utilisateur** (fichiers, User-Agent des scripts, commits, noms de chemins : écrire « l'utilisateur » et `C:\Users\<utilisateur>`). Si un commit doit être refait, utiliser `git -c user.name=IngenieriePublique -c user.email=341136821+IngenieriePublique@users.noreply.github.com commit ...`.

## Règles de contenu (anti-hallucination)
- Une fiche n'est jamais écrite de mémoire : récupérer les sources (Wikipédia/Wikidata, Vie-publique, Légifrance, INSEE, Cour des comptes, data.gouv, INAO), reformuler ce qui a été lu, citer au moins 2 sources, marquer les faits périssables (noms, taux, barèmes) avec une date de revue. Valider avec `scripts/validate_content.py` (à écrire en phase 5).
- Droits : texte Wikipédia = CC BY-SA (attribution) ; données Etalab OK ; presse = titre, lien et une phrase de chapô, jamais d'article payant.
- Pas de LLM local (15 Go de RAM, GPU intégré ; Qwen déjà jugé insuffisant dans Projet AUTONOMIE). IA en ligne gratuite facultative, jamais bloquante, repli « prompt à coller » (voir `docs/decisions.md`).

## Contexte machine et projets voisins
- Windows 11, PowerShell/Git Bash, Python 3.14.1, git 2.56, Edge 155 (voix françaises natives installées : Hortense ; voix « Natural » en ligne dans Edge à tester en phase 6). `gh` (GitHub CLI) n'est pas installé.
- **Projet VEILLE** (`C:\Users\<utilisateur>\Desktop\Projet VEILLE\Code`) : veille d'offres d'emploi, `data/veille.db`, colonne `offres.tag` (oui / peut-etre / non). À utiliser **en lecture seule** pour la matrice de compétences (phase 3). Embeddings `bge-m3` via Ollama déjà installés.
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

## Fonctionnement du Brief (phase 2)
- Détails dans `docs/brief.md`. Config (sources, mots de score, plafonds) : `content/brief/config.json` ; questions : `content/brief/questions.json`. Pipeline : `scripts/fetch_feeds.py` (bibliothèque + `--check`) → `scripts/build_brief.py` → `site/data/brief/{latest,index}.json` + `archive/`.
- Une nouvelle source = test `python -I scripts/fetch_feeds.py --check --url ...` puis une ligne dans `config.json`. Les tests (`tests/test_brief.py`) n'accèdent jamais au réseau.
- Écran : `site/js/modules/brief.js` ; IA facultative : `site/js/ia.js` (clé dans le localStorage, jamais exportée ; repli « prompt à coller »). Aucun texte généré par IA dans le dépôt.
- Le service worker sert `data/brief/` réseau d'abord (le reste : cache puis réseau). Quand on change la liste CORE de `sw.js`, changer aussi `VERSION` (sw.js et version.js).
- Serveur local : `.claude/launch.json` sert la racine du projet, donc le site est sur `http://127.0.0.1:8765/site/` et les tests sur `/tests/index.html`.
- Windows : la console Python est en cp1252, d'où `sys.stdout.reconfigure(encoding="utf-8")` dans les scripts. Ne pas fabriquer de fichiers de code par heredoc ou script Python avec des échappements d'octets (ils sont interprétés et corrompent le fichier) : utiliser les outils Write et Edit.

## Fonctionnement du sprint candidature (phase 3)
- Détails dans `docs/sprint.md`. Contenu public : `content/radar/{employeurs,note-carriere}.json` et `content/oral/{questions,gabarits}.json` → `python scripts/build_sprint.py` (valide et publie dans `site/data/radar|oral/`) ; `python -I scripts/check_links.py` teste les adresses. Un employeur = ≥ 2 sources distinctes, date de revue, `a_verifier` honnête ; priorité A/B/C et « Lecture Upgrade » sont des avis, signalés comme tels.
- Écrans sous `#/sprint/...` (`site/js/modules/{sprint,radar,recit,oral,reseau,choix}.js`), logique pure dans `site/js/candidature.js` (étapes, statuts, fin du sprint 2026-11-15), chargement des données dans `data.js`, micro dans `recorder.js` (l'audio n'est jamais conservé ni envoyé).
- **Données personnelles** : magasin IndexedDB `notes` (base v2), id `genre:clé` (`pitch:p90`, `star:s1`, `radar:<id>`, `contact:<ts>`, `oral:<ts>`, `decision`) ; `store.putNote/getNote/notes/deleteNote` ; export/import fusionnent par `updatedAt` et gardent des pierres tombales. Ne jamais mettre de pitch, d'histoire ni de nom de contact dans le dépôt.
- Pendant le sprint, le bloc « profond » de Aujourd'hui pointe vers la prochaine étape du sprint (voir `aujourdhui.js`).
- Les Edit du harnais peuvent introduire des fins de ligne CRLF : vérifier `git ls-files --eol` et normaliser en LF.

## Etat
Phases 0, 1, 2 et 3 (outils) terminées (2026-10-11). Dépôt GitHub créé et poussé (2026-10-11) : https://github.com/IngenieriePublique/upgrade (remote `origin`, branche `main` ; demander l'accord avant tout push). À faire côté GitHub : activer Pages et Actions pour que le cron du Brief tourne. Phase 3 : le contenu personnel (pitch, histoires STAR, entraînements, cibles, premier entretien d'information, décision provisoire) est à produire par l'utilisateur avant le 2026-11-15 ; la séance suivante peut l'y aider (relecture de ses textes collés dans le chat). Prochaine séance de code : phase 4 (Territoires), après au moins deux séances de contenu ou de pratique (règle 70/30). Reportés : matrice de compétences VEILLE (trop peu d'offres taguées), compléter les sigles (49 → ~60), employeurs 33+ du radar.
