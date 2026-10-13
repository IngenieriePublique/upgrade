# CLAUDE.md : projet UPGRADE

**But** : système personnel 100 % gratuit pour l'utilisateur (M2 ingénierie du développement territorial, Bordeaux) qui vise l'évaluation et le pilotage des politiques publiques (département, région, SGAR, Paris). Il remplace ses réseaux sociaux par une boucle quotidienne finie de 60 minutes : actualité (Brief), cartes à répétition espacée, mini-jeu des territoires, curriculum (institutions, finances locales, évaluation, culture générale), dictées, atelier d'écriture, oral et réseau, radar métier. Le plan complet est dans `PLAN.md` : **lisez `PLAN.md` puis ce fichier avant toute séance**.

## ÉTAT ACTUEL (2026-10-12) : système Upgrade EN VEILLE, « First Upgrade » en service
L'utilisateur a changé d'usage : plus de boucle de 60 minutes ni d'obligation. **Le site public est maintenant First Upgrade** (`site/index.html`, code dans `site/first/`) : une page d'accueil sobre avec quatre hexagones (jeu des territoires, cartes de culture, brief d'actualité, lecture territoriale), chaque activité tenant sur un écran qui ne défile pas, charte graphique de VEILLE (sombre, accent bleu, sans volet de navigation). Il appelle le noyau d'Upgrade (`site/js/` : `srs.js`, `store.js`, `territoires.js`, `carte-svg.js`, `data.js`, `router.js`, `ui.js`) et ses données (`site/data/`). Détails : `docs/first-upgrade.md`. Mise à jour du 2026-10-13 : cinquième hexagone au centre de l'accueil (bords bleus) = suivi de la méthode de travail (`site/first/js/{suivi,methode,seances}.js`, voir `docs/first-upgrade.md`). Mise à jour du 2026-10-12 (soir) : jeu des territoires en trois formats au choix (régions, départements d'une région zoomée, 35 villes ; écran de révision avant chaque série ; `site/first/js/formats.js`, `carte-first.js`, `scripts/build_villes.py`), Brief en accordéon, lectures avec résumé complet de l'auteur dans la page (`scripts/enrich_lectures.py`), accueil à hexagones plus petits et icônes détaillées.
- **Rien n'est supprimé** : l'ancien système (Aujourd'hui, Fondations, Dictées, Atelier, Candidature, Bilan, Sauvegarde…) vit toujours dans `site/upgrade.html` (même dossier, mêmes chemins relatifs), avec la même base IndexedDB `upgrade` (progression commune). Pour le relancer : ouvrir `site/upgrade.html` ; rien d'autre à faire (voir `docs/first-upgrade.md`, section « Relancer Upgrade »).
- Les règles « une séance = une phase », « 70/30 » et le calendrier de croisière sont **suspendus** ; les règles de contenu (sources vérifiées, pas de donnée personnelle dans le dépôt, accord avant push) restent valables.
- Contenu de First Upgrade : lectures dans `content/lectures/lectures.json` (`python scripts/build_lectures.py`) ; Brief inchangé (`scripts/build_brief.py`, cron `brief.yml`).

## Règles de travail (système Upgrade, en veille)
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

## Fonctionnement des Territoires (phase 4)
- Détails dans `docs/territoires.md`. Données : `python -I scripts/fetch_territoires.py` (télécharge dans `data_local/`, hors dépôt) puis `python -I scripts/build_geo.py` → `content/territoires/*.json`, `site/data/territoires/data.json`, `site/data/geo/france.json`. Pas exécuté en intégration continue (réseau). Briques pures et testées : `scripts/geo_lib.py`.
- `scripts/wiki_lib.py` : outil générique de sourçage (extraits, sections, identifiants Wikidata, SPARQL) en ligne de commande, à réutiliser pour toute fiche ou carte ; les cartes sont toujours rédigées à partir des extraits lus.
- Jeu : `site/js/territoires.js` (logique pure), `site/js/carte-svg.js` (carte), `site/js/modules/territoires.js` (écrans `#/territoires/...`). Chaque élément du jeu est une carte SM-2 d'identifiant `terr-<mode>-<code>` dans le même magasin que les autres cartes.
- Les `check_links.py` sur Wikidata renvoient des 429 (limite de débit) : faux échecs.

## Etat
**Phases 0 à 8 terminées** (4 à 6 le 2026-10-11/12 ; 7 et 8 le 2026-10-12) ; **phase 9 (croisière) outillée** : c'est un régime permanent (voir plus bas et `docs/croisiere.md`). Rien de plus à construire pour que le système serve : il reste à **l'utiliser**, et à produire du contenu à raison d'une séance par mois. Dépôt GitHub créé et poussé (2026-10-11) : https://github.com/IngenieriePublique/upgrade (remote `origin`, branche `main` ; **demander l'accord avant tout push**, `git pull --rebase` d'abord car le bot du Brief commite). À faire côté GitHub si ce n'est pas fait : activer Pages et Actions pour que le cron du Brief tourne (vérifier le 2026-12-10). Phase 3 : le contenu personnel (pitch, histoires STAR, entraînements, cibles, entretien d'information, décision provisoire) est à produire par l'utilisateur avant le 2026-11-15 ; une séance peut l'y aider (relecture de ses textes collés dans le chat). Reportés : matrice de compétences VEILLE (trop peu d'offres taguées), compléter les sigles (49 → ~60), employeurs 33+ du radar. Le CPER Sud (communiqué du 21 décembre 2022) déposé à la racine par l'utilisateur est un fichier à lui, non versionné : il a servi de document D1 à l'exercice n02 de l'atelier.

## Fonctionnement des Fondations (phase 5) et reprise (2026-10-12)
- Details dans `docs/fondations.md`. Kits : `content/fondations/*.json` -> `python scripts/build_fondations.py` (valide : fiche en 3 sections minimum, 12 a 30 cartes, 3 questions de debat, 2 sources distinctes). 25 kits faits : A1-A9, B1-B5, C1-C8, D1, E1, F1. Reste : D, E, F (croisiere, 4 kits par mois). Sources lourdes (EUR-Lex, Legifrance) : les lire avec le navigateur integre (`navigate` puis `javascript_tool` pour extraire un article) quand `fetch_text.py` est bloque.
- Phase 5 : socle termine ; la suite (D, E, F : 4 kits par mois) releve de la croisiere (`docs/croisiere.md`).

## Fonctionnement des Dictees (phase 6)
- Details dans `docs/dictees.md`. Selection : `content/dictees/selection.json` -> `python -I scripts/extract_dictees.py` (lit `data_local/dictees/`, hors depot) -> `content/dictees/dictees.json` (versionne) ; regles : `content/dictees/regles.json` (41 cartes, 2 sources distinctes, categorie) ; `python scripts/build_dictees.py` valide et publie `site/data/dictees/`. Briques pures : `scripts/dictee_lib.py` (extraction, decoupage en segments, profil de pieges), `site/js/dictee.js` (essais, statistiques, dictee suivante, regles ciblees), tests `tests/test_dictees.py` et `tests/dictee.test.js`.
- Ecrans `#/dictee`, `#/dictee/ecrire?id=dNN` (voix `speechSynthesis`), `#/dictee/corriger?id=dNN` (marquage des fautes par categorie). Donnees personnelles : notes `dictee:<id>:<ts>` et `regle:<categorie>` ; les cartes de regles d'une categorie n'entrent dans la revision (paquet `regles`) qu'apres une faute marquee ou une activation manuelle. Le bloc Dictee de Aujourd'hui (lun, mer, ven) pointe vers la dictee conseillee.
- Les ids `dNN` suivent l'ordre de `selection.json` : ajouter a la fin. Le profil de pieges d'une dictee est une estimation automatique, pas une analyse linguistique.
- Piege rencontre deux fois : un script Python lance en heredoc, avec une sequence d'echappement (retour a la ligne, `\s` d'une regex) dans une chaine, ecrit un vrai retour a la ligne dans le fichier cible ; utiliser Edit/Write pour tout code contenant des echappements.

## Fonctionnement de l'atelier d'écriture et du portfolio (phase 7)
- Détails dans `docs/atelier.md`. Contenu : `content/atelier/{grille,notes,courts,portfolio}.json` → `python scripts/build_atelier.py` (valide et publie dans `site/data/atelier/`). **Chaque nombre d'une note modèle doit être dans le corpus, la commande ou la liste `calculs`** (le validateur le vérifie) ; renvois [D1]… obligatoires ; 3 documents d'adresses distinctes par note. Le corpus est un résumé rédigé d'après les documents lus, avec leur limite et le lien de l'original.
- Écrans `#/atelier/...` (`site/js/modules/atelier.js`, `portfolio.js`), logique pure `site/js/atelier.js`. Données personnelles : notes `redac:<exercice>:<ts>` (texte, grille, réécriture) et `portfolio:<projet>` (étapes cochées, adresse publiée). **La note modèle n'apparaît qu'après l'auto-évaluation des sept critères.** Upgrade ne rédige jamais un livrable de portfolio à la place de l'utilisateur.
- `python -I scripts/portfolio_ofgl.py` (comptes des départements OFGL, Licence ouverte 2.0) : données de départ du projet p1 dans `data_local/portfolio/`, et tableau du corpus de la note n01 (`--table 2023-2025`). Les codes de département de l'OFGL n'ont pas de zéro initial.
- Le bloc « profond » du jeudi dans Aujourd'hui pointe vers l'étape suivante de l'atelier (`blocJeudi`) ; le bloc « mot du jour » (jamais réalisé) est devenu une « lecture libre » manuelle.

## Fonctionnement du bilan et des anti-réseaux (phase 8)
- Détails dans `docs/bilan.md`. Contenu : `content/bilan/bilan.json` → `python scripts/build_bilan.py` (repères à trois mois, revue hebdomadaire, audit trimestriel, guide anti-réseaux ; chaque outil de blocage : 3 étapes et 2 sources distinctes, ou « sans source »).
- Écrans `#/bilan`, `/bilan/revue`, `/bilan/audit`, `/bilan/reseaux` (`site/js/modules/bilan.js`), logique pure `site/js/bilan.js`. Notes personnelles : `ecran:base`, `ecran:<lundi>` (minutes saisies à la main), `revue:<lundi>`, `audit:<AAAA-Tn>`, `reseaux:plan`. Le dimanche, le bloc « profond » de Aujourd'hui mène à la revue (sauf pendant le sprint).
- **Blocage des réseaux : l'utilisateur l'applique lui-même** ; l'écran donne les instructions (LeechBlock NG, Bien-être numérique, Temps d'écran), jamais un réglage fait par Claude.

## Croisière (phase 9)
- Détails, calendrier et réserve de kits dans `docs/croisiere.md`. Ouvrir une séance de croisière par `python -I scripts/audit_croisiere.py` (faits périssables à revoir, rythme des kits, fraîcheur du Brief) ; les erreurs signalées par l'utilisateur se lisent avec `python -I scripts/signalements.py <sauvegarde.json>` (la sauvegarde reste hors dépôt).
- Tests : `python -m unittest discover -s tests -t .` (Python, sans réseau) et `tests/index.html` (JS, dans le navigateur). Le service worker : changer `VERSION` (sw.js et version.js) quand la liste CORE change (0.8.0 au 2026-10-12).
