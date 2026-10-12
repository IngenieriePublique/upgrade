# PLAN.md : état d'avancement du projet UPGRADE

Tableau d'état (à mettre à jour à la fin de chaque séance). Le plan détaillé approuvé le 2026-10-11 suit plus bas.

| Phase | État |
|---|---|
| 0 Cadrage (S0) | fait le 2026-10-11 (squelette, git, CLAUDE.md, docs/decisions.md) ; dépôt GitHub non créé (accord à demander) |
| 1 Noyau (S1-S2) | fait le 2026-10-11 en une séance : PWA hors ligne, routeur, `store.js`, `srs.js`, révision, Aujourd'hui, export/import, sauvegarde dans un dossier, 49 cartes de sigles sourcées, workflows Pages/validation prêts. **Reste à faire par l'utilisateur** : créer le dépôt GitHub « upgrade » et pousser (déploiement Pages). Reste à compléter plus tard : 49 → ~60 sigles |
| 2 Brief (S3-S4) | fait le 2026-10-11 en une séance : 36 flux testés (`fetch_feeds.py --check`), `build_brief.py` (dédoublonnage, score, plafond 13), `brief.yml` (cron quotidien + redéploiement), écran Brief, dossier de la semaine, truc du jour (Wikipédia), adaptateur IA facultatif (Gemini / Mistral / Groq, repli « prompt à coller »). **Reste à faire** : (1) l'utilisateur crée le dépôt GitHub et pousse, puis lance une fois « Brief quotidien » à la main ; (2) désabonner les newsletters (`docs/brief.md`) ; (3) vérifier le 2026-12-10 que le cron tourne encore (règle des 60 jours). Fonctionnement : `docs/brief.md` |
| 3 Sprint candidature (S5) | outils faits le 2026-10-11 : radar de 32 employeurs sourcés (+ 5 portails d'offres), banque de 82 questions, gabarits pitch / STAR, enregistreur oral local avec auto-évaluation, guide et suivi des entretiens d'information, note concours vs contractuel, base IndexedDB v2 (magasin `notes`, inclus dans les sauvegardes), `build_sprint.py`, `check_links.py`. **Reste à faire par l'utilisateur avant le 2026-11-15** (le contenu personnel ne vient pas de Claude) : choisir 5 cibles, écrire pitch 90 s et 4 histoires STAR, 3 entraînements enregistrés, planifier un premier entretien d'information, écrire une décision provisoire. Matrice de compétences VEILLE reportée (seulement 4 offres « oui » et 16 « peut-être »). Fonctionnement : `docs/sprint.md` |
| 4 Territoires (S6-S8) | fait le 2026-10-11 (sans séance dédiée, à la demande de l'utilisateur) : cartes SVG précalculées (Lambert-93, encarts d'outre-mer), 101 départements et 18 régions sourcés (préfectures, sous-préfectures, voisins calculés et recoupés avec Wikidata, populations), 861 éléments en répétition espacée (11 modes : placer, nommer, numéros, préfectures, région, voisins, anciennes régions), carte de maîtrise, Plus ou moins, Qui suis-je ?, fiches, paquet « géographie » (fleuves, massifs, îles, outre-mer, 36 cartes). Reportés : spécialités AOP/IGP (INAO), personnalités, fleuves sur la carte. Fonctionnement : `docs/territoires.md` |
| 5 Fondations (S9+) | socle fait le 2026-10-12 (sans séance dédiée, à la demande de l'utilisateur) : format de kit, validateur `build_fondations.py`, lecteur, 25 kits sourcés (A1-A9, B1-B5, C1-C8, D1, E1, F1) ; la suite (≈ 4 kits par mois) relève de la croisière, voir `docs/fondations.md` |
| 6 Dictées (S10) | fait le 2026-10-12 : 40 dictées (4 niveaux ; Daudet, Verne, Voltaire, Maupassant, Flaubert, Zola, Rousseau, Tocqueville, Déclaration de 1789, Constitution), lecteur vocal par segments, correction à l'écran avec 7 catégories de fautes, statistiques, choix de la dictée suivante d'après les fautes, 41 cartes de règles sourcées activées par les fautes marquées. Reste (croisière) : plus de dictées, second regard sur les règles. Fonctionnement : `docs/dictees.md` |
| 7 Atelier d'écriture et portfolio (S11-S12) | à faire |
| 8 Bilan et anti-réseaux (S13) | à faire |
| 9 Croisière | à faire |

---

# Plan : système UPGRADE (apprentissage, veille, entraînement), 100 % gratuit

## Contexte
L'utilisateur, M2 ingénierie du développement territorial (Bordeaux), vise l'évaluation et le pilotage des politiques publiques (département, région, SGAR, Paris). Il souffre d'un syndrome de l'imposteur ancré dans cinq lacunes : apprentissage court-termiste, culture générale, institutions et action publique, vente de ses analyses, aisance à l'oral et en société. Il veut un système qui remplace ses réseaux sociaux et le fasse progresser « bien au-delà » de l'objectif.

Dossier de travail : `Documents\_SETUP_IA\Claude\Projet UPGRADE\Code` (vide, hors git). Machine : Windows 11, 15 Go de RAM, GPU intégré (donc pas de LLM local utile ; Qwen a déjà été jugé insuffisant dans Projet AUTONOMIE), Python 3.14, git, Ollama + `bge-m3`. Pas de Node. Projet VEILLE (offres d'emploi, `data/veille.db`, tags oui/peut-être/non) existe et sera réutilisé en lecture seule.

## Décisions prises (réponses de l'utilisateur)
| Sujet | Décision |
|---|---|
| Appareil | PC d'abord. Le site statique marche aussi sur téléphone (même URL) : le téléphone ne servira qu'à lire le Brief. |
| Hébergement | Site statique public gratuit : GitHub Pages + GitHub Actions. Aucune donnée personnelle dans le dépôt : la progression vit dans le navigateur (IndexedDB) et dans des sauvegardes JSON. |
| Rôle de Claude | Producteur de contenu en séances (fiches, cartes, dictées, grilles). Au quotidien l'appli tourne sans IA. |
| IA gratuite en ligne | Facultative, jamais bloquante, seulement là où elle apporte vraiment (voir « IA gratuite »). |
| Temps | 60 min par jour en régime normal. |

## Critique : ce qui peut faire échouer le projet (et la parade)
1. **Construire au lieu d'utiliser.** L'utilisateur a déjà bâti VEILLE (530 tests) et AUTONOMIE (18 Go). Risque n°1 : un outil parfait que personne n'utilise. Parades : (a) usage quotidien dès la fin de la séance S2 avec un simple paquet de cartes ; (b) règle 70/30 après S4 : au plus une séance de code sur trois, le reste est du contenu ou de la pratique ; (c) pas de fonctionnalité sans une phrase « ce que ça change pour mes objectifs ».
2. **Mémoriser n'est pas comprendre ni convaincre.** Les cartes règlent les faits ; le sentiment d'imposture vient surtout du manque de preuves (livrables) et d'exposition (parler à des humains). Le système impose donc de la **production** (note hebdomadaire, portfolio de mini-évaluations) et du **réel** (un contact humain par semaine). Une appli ne remplace pas cela.
3. **Hallucinations dans le contenu généré.** Règle de fondation : Claude ne rédige jamais une fiche de mémoire. Il récupère des sources (Wikipédia/Wikidata, Vie-publique, Légifrance, INSEE, Cour des comptes, data.gouv), reformule ce qu'il a lu, cite ≥ 2 sources par fiche, et marque les faits périssables (noms, taux, barèmes) avec une date de revue. Un validateur automatique refuse une fiche sans sources. Bouton « signaler une erreur » dans l'appli.
4. **Remplacer les réseaux sans friction ni substitut échoue.** Il faut (a) bloquer (extension LeechBlock sur PC, limites Bien-être numérique sur téléphone ; modifications système faites par l'utilisateur, pas par moi) et (b) offrir mieux sur chaque besoin : actualité → Brief, dopamine → carte de maîtrise, curiosité → « le truc du jour », appartenance → contacts réels. Le système est **fini** par construction : une séance de 60 min qui se termine par « C'est fait ».
5. **Sauvegardes.** IndexedDB peut être vidé. Parade : export JSON hebdomadaire vers un dossier choisi (API File System Access d'Edge/Chrome) + rappel.
6. **Dérive technique de GitHub.** Les workflows planifiés d'un dépôt inactif sont désactivés après ~60 jours, et le cron peut avoir du retard : à tester en S3 et à compenser (commit de maintien, repli local `python scripts/build_brief.py`). Droits : texte Wikipédia = CC BY-SA (attribution) ; presse = titre, lien et une phrase de chapô seulement ; jamais d'article payant republié.
7. **Surcharge du curriculum.** 60 min/jour ≈ 300 h/an. Le programme est dimensionné à ~48 « kits » de 2 h, pas plus. On coupe ce qui n'est pas utilisé (audit trimestriel).
8. **Stratégie de carrière à ne pas oublier** (hors outil, à trancher dans la phase 3) : concours (attaché territorial, attaché d'administration de l'État, IRA) vs contractuel ; cabinets d'évaluation et agences (ANCT, DITP, CEREMA…) ; dans un marché où l'IA remplace l'analyse « basique », la valeur restante est le jugement, la connaissance fine des institutions et la capacité à convaincre. Le curriculum vise exactement cela.

## IA gratuite : où oui, où non
- **Oui, utile** : (1) retour sur les notes écrites selon une grille (forme, structure, « so what ») ; (2) résumé de 2 lignes et « angle de conversation » pour chaque article du Brief, uniquement à partir du texte fourni ; (3) jury d'entretien en texte.
- **Non** : fiches factuelles, cartes, dates (hallucination).
- **Mécanisme** : côté Actions, clé en secret GitHub (jamais dans le dépôt) ; côté navigateur, clé personnelle saisie par l'utilisateur et gardée en `localStorage`. Si la clé est absente ou le quota atteint : repli automatique sur le texte brut + bouton **« copier un prompt prêt à coller »** dans n'importe quel chat gratuit (claude.ai, Gemini web). Le système est complet sans aucune API.
- **À vérifier en S0 par recherche web** (mes informations peuvent dater) : quotas et conditions actuels des offres gratuites (Gemini API/AI Studio, Mistral, Groq, OpenRouter `:free`, Cloudflare Workers AI), réutilisation des données pour l'entraînement, support CORS depuis un navigateur. Choisir un fournisseur principal et un de secours.

## Architecture
Site statique sans étape de build, JavaScript natif (modules ES), SVG, aucune dépendance externe en production (bibliothèques éventuelles copiées dans le dépôt, versions figées). Python (stdlib + peu de paquets) uniquement pour fabriquer les données.

```
Code/
  CLAUDE.md  PLAN.md  README.md        mémoire du projet et tableau d'état des phases
  site/                                 racine publiée sur GitHub Pages
    index.html manifest.webmanifest sw.js   (PWA, cache hors ligne)
    js/ app.js router.js store.js srs.js ui.js modules/{aujourdhui,brief,cartes,territoires,fondations,dictee,atelier,oral,radar,bilan}.js
    css/app.css
    data/ territoires.json  geo/*.svg.json  cartes/*.json  fondations/*.json  dictees/*.json  brief/latest.json  brief/archive/
  content/                              sources lisibles (fiches en Markdown avec métadonnées : sources, date, périssable)
  scripts/                              build_geo.py build_brief.py fetch_feeds.py build_content.py validate_content.py check_links.py
  tests/                                unittest (scripts) + tests/index.html (JS, ouvert dans le navigateur)
  .github/workflows/                    pages.yml (déploiement) brief.yml (cron) validate.yml
```
Choix techniques à retenir :
- **Cartes SVG précalculées** : Python projette les contours simplifiés (france-geojson, licence Etalab) en Lambert-93, DROM dans des encarts, et écrit des chemins SVG. Pas de Leaflet ni de tuiles.
- **Répétition espacée maison** : variante SM-2 à 4 notes (Encore / Difficile / Bien / Facile), mais on enregistre un **journal complet de révisions** (carte, date, note) pour pouvoir passer à FSRS plus tard sans perdre l'historique. Un seul moteur sert les cartes, les territoires, les acronymes, les règles de dictée. Pas d'Anki : un seul endroit pour tout, et Anki iOS est payant. Un export CSV/Anki reste une échappatoire.
- **Dictée** : voix françaises du navigateur (Edge a des voix « Natural » gratuites), lecture phrase par phrase ; l'utilisateur écrit **à la main sur papier**, puis le texte s'affiche et il clique chaque faute en la classant (accord du participe passé, homophone grammatical, sujet-verbe, orthographe lexicale, ponctuation, conjugaison). Les statistiques d'erreurs choisissent la dictée suivante et fabriquent des cartes de règles ciblées. Sans OCR (il échoue sur l'écriture manuscrite).
- **Brief** : flux RSS validés → dédoublonnage (similarité de titres, stdlib) → score (priorité de source + mots d'action publique − mots de « jeu politique » : sondage, polémique, petite phrase…) → plafond **13 items par jour** (5 France, 5 monde, 3 action publique) + 1 dossier de fond par semaine + « le truc du jour » (fait, œuvre, mot ou carte).

## Boucle quotidienne (60 min, finie)
| Min | Bloc |
|---|---|
| 8 | Brief (13 items) avec une « question à poser » par item pour nourrir la conversation |
| 12 | Cartes dues (tous paquets) |
| 5 | Territoires : 10 questions de jeu |
| 25 | Bloc profond selon le jour : lun Institutions et action publique · mar Culture générale · mer Évaluation et données · jeu Atelier d'écriture / portfolio · ven Oral · sam Lecture longue ou podcast · dim Revue hebdomadaire |
| 10 | Dictée (3 fois par semaine) ou mot du jour / sigles les autres jours |
Règle de souplesse : 5 jours sur 7 suffisent (pas de série anxiogène).

## Modules
1. **Aujourd'hui** : page d'accueil, liste des blocs, minuteur, fin explicite.
2. **Cartes** : moteur de répétition espacée ; types : basique, texte à trou, QCM, clic sur carte, mise en ordre. Paquets de départ : ~300 sigles de l'administration (ANCT, DGCL, DGFiP, CRC, CESER, SGAR, DREETS, DDT(M), DREAL, EPCI, PETR, CTAP, CPER, FEDER…), compétences par niveau (« qui est compétent pour X ? »), ordres de grandeur (budget de l'État, dépenses locales, dette), chronologie à 100 jalons.
3. **Brief** : voir ci-dessus ; liste noire de newsletters à désabonner, liste blanche de flux (institutionnels, Vie-publique, Banque des Territoires/Localtis, Cour des comptes, The Conversation, médias généralistes France et monde). Chaque flux est testé par script avant adoption (disponibilité, date du dernier article).
4. **Territoires** : mini-jeu. Modes : placer sur la carte, nommer, numéro ↔ département, préfecture ↔ département, voisins, massifs, fleuves, îles, DROM-COM, anciennes régions → régions fusionnées, « Qui suis-je ? » (indices progressifs : spécialité AOP/IGP via INAO, histoire, personnalités, sites), « Plus ou moins » sur données INSEE/OFGL (population, PIB, pauvreté, dette). Carte de maîtrise en couleurs = retour de progrès visible. Fiches territoriales construites depuis Wikidata/Wikipédia/INAO, pas de mémoire du modèle.
5. **Fondations** (curriculum, ~48 kits) : un kit = fiche d'une page + 15 à 25 cartes + 1 ressource externe (podcast, vidéo, rapport) + 3 questions à débattre. Pistes : A Institutions et action publique (Ve République, État déconcentré préfet/SGAR, décentralisation 1982-2003-MAPTAM-NOTRe-3DS, CTAP, CPER, fonds européens, ZAN…) · B Finances publiques et locales (LOLF, lois de finances, DGF, fiscalité locale et ses réformes, épargne brute, capacité de désendettement, analyse financière rétrospective, M57) · C Évaluation et pilotage (critères OCDE-CAD, théorie du changement, cadre logique, ex ante/in itinere/ex post, différences de différences et autres méthodes, Cour des comptes, DITP, SFE, tableaux de bord) · D Histoire, géographie, géopolitique · E Arts, lettres, idées (« 100 œuvres », courants, économie et sociologie) · F Métier et marché. Priorité de production : A, B, C (utiles pour les entretiens).
6. **Dictée** : voir architecture ; corpus : Wikisource (domaine public), textes institutionnels (Constitution, DDHC) pour le vocabulaire professionnel, extraits contemporains libres ; 40 dictées pour commencer, niveaux croissants ; règles : « les 30 règles qui font 90 % des fautes ».
7. **Atelier d'écriture** : cycle hebdomadaire : corpus de 3-4 documents → note de 2 pages en 45-60 min chronométrées → auto-évaluation par grille (problème, plan, hiérarchisation, chiffres clés, recommandation, risques, style) → comparaison avec une note modèle ou retour IA/prompt à coller → réécriture. Exercices courts : titres qui disent quelque chose, réécrire en 10 lignes, note d'une page pour un élu. **Portfolio** : 3 à 5 mini-évaluations publiables sur données ouvertes (ex. analyse financière comparée des départements néo-aquitains avec OFGL/DGFiP, évaluation d'un dispositif d'État en région) : c'est la preuve concrète qui répond au « mes analyses n'ont pas de valeur ».
8. **Oral et réseau** : banque de ~80 questions d'entretien, enregistrement audio local (MediaRecorder, rien n'est envoyé), grille d'auto-évaluation (clarté, structure, concret, énergie), comptage facultatif de tics de langage, pitch 30 s / 90 s / 3 min, 8 histoires en format STAR tirées des 3 stages (problème, action, résultat chiffré, apprentissage), exercices de conversation (questions ouvertes, relance), suivi d'entretiens d'information : **1 contact humain par semaine** (anciens du master, webinaires ANCT/CEREMA/SFE, BAIP de l'université).
9. **Radar métier** : fiches d'une soixantaine d'employeurs cibles (mission, profils recrutés, contact, calendrier de recrutement) ; matrice de compétences issue des offres que L'utilisateur a tagguées « oui » dans VEILLE (lecture seule, embeddings `bge-m3` déjà installés) pour piloter le curriculum d'après le marché réel ; note de décision concours / contractuel.
10. **Bilan** : tableau de bord (jours tenus, cartes mûres, carte de maîtrise, tendance des fautes de dictée, notes écrites, contacts, minutes d'écran sur réseaux saisies à la main), revue hebdomadaire guidée de 15 min, audit trimestriel.
11. **Idées en réserve** (ordre de valeur/coût) : jeu « chronologie » ; lecture de graphique en 3 enseignements ; vocabulaire précis (mot du jour) ; flux de podcasts hors écran ; veille outils data/IA (SQL, Python/R, Quarto, QGIS ; inférence causale avec « The Effect » et « Causal Inference: The Mixtape », en ligne et gratuits) ; sync entre appareils par fichier ; export Anki.

## Phases (une séance = une phase ou moitié de phase ; fin de séance : tests, commit, mise à jour de `PLAN.md`/`CLAUDE.md`, `/clear`)
| # | Séance | Contenu et livrable | Taille |
|---|---|---|---|
| 0 | S0 Cadrage | Squelette du dossier, `git init`, `CLAUDE.md` (règles, décisions, conventions), `PLAN.md` (ce plan + tableau d'état), vérification des outils (`gh`, voix Edge, version de Python), recherche des offres d'IA gratuites, note `docs/decisions.md`. Création du dépôt GitHub public : demander l'accord avant. | S |
| 1 | S1-S2 Noyau | PWA, routeur, `store.js` (IndexedDB), `srs.js` + écran de révision, page Aujourd'hui, export/import JSON + sauvegarde auto (File System Access), paquet « sigles » (60 cartes pour commencer), déploiement Pages. **Usage quotidien démarre ici.** | M+M |
| 2 | S3-S4 Brief | Test des flux, `fetch_feeds.py`, `build_brief.py`, score et plafond, `brief.yml`, écran Brief, adaptateur IA facultatif avec repli « prompt à coller », test de l'inactivité du cron. Désabonnement des newsletters bruyantes. | M+M |
| 3 | S5 Sprint candidature (avant mi-novembre : les stages de mars se publient de novembre à février) | Radar employeurs (30 premiers), pitch et STAR, banque de questions, enregistreur oral, premier entretien d'information planifié, note concours vs contractuel. | M |
| 4 | S6-S8 Territoires | `build_geo.py` (contours, projection, SVG), jeu régions + départements (S6) ; préfectures, numéros, voisins, massifs, fleuves, îles, DROM (S7) ; fiches (Wikidata/INAO), « Qui suis-je ? », « Plus ou moins », carte de maîtrise (S8). | M+M+M |
| 5 | S9+ Fondations | Cartographie du curriculum, gabarit de kit, lecteur, validateur de sources, puis 4 kits par séance (≈ un mois de pratique) en commençant par A, B, C ; chaque séance rédige les cartes liées. | M puis M en boucle |
| 6 | S10 Dictées | Corpus + 40 dictées, lecteur vocal, marquage des fautes, statistiques, cartes de règles ciblées. | M |
| 7 | S11-S12 Atelier + portfolio | Corpus de notes, grille, chronomètre, notes modèles, retour IA/prompt ; cadrage et premier livrable du portfolio. | M+M |
| 8 | S13 Bilan et anti-réseaux | Tableau de bord, revue hebdomadaire, guide de blocage des réseaux (instructions que l'utilisateur applique lui-même), table « besoin → substitut ». | S |
| 9 | Croisière | Mensuel : 4 nouveaux kits, nouvelles dictées, corrections signalées, mise à jour des faits périssables. Trimestriel : audit d'usage, suppression de ce qui ne sert pas. | S par mois |

Calendrier cible : usage des cartes dès la semaine 1, Brief en semaine 2-3, sprint candidature fini mi-novembre 2026, Territoires complet fin décembre 2026. À ajuster au rythme réel.

## Vérification (de bout en bout)
- Scripts Python : tests `unittest` (`python -m unittest discover -s tests -t .`), sans réseau, avec jeux de données figés ; tests réseau facultatifs derrière une variable d'environnement (convention VEILLE).
- Interface : `python -m http.server` dans `site/`, puis contrôle dans le navigateur intégré (parcours complet : réviser des cartes, finir la séance, exporter puis réimporter la sauvegarde, mode hors ligne via service worker, rendu sur largeur mobile) ; page `tests/index.html` pour la logique JS (`srs.js`, `store.js`).
- Contenu : `validate_content.py` (identifiants uniques, ≥ 2 sources par fiche, date de revue pour les faits périssables, liens vivants via `check_links.py`) ; relecture par échantillon de 10 % de chaque lot de fiches contre la source.
- Brief : un déclenchement manuel de `brief.yml` (`gh workflow run`) puis lecture de `brief/latest.json` ; vérifier le plafond de 13 items et l'absence de contenu payant.
- Succès à 3 mois (mesurés dans Bilan) : ≥ 5 jours sur 7 tenus, 101 départements + régions maîtrisés, 30 kits publiés, 1 livrable de portfolio publié, 6 entretiens d'information faits, temps réseaux sociaux divisé par deux.

## Règles de travail pour les séances futures
Lire `CLAUDE.md` et `PLAN.md` d'abord ; une phase par séance ; ne jamais pousser sur GitHub ni changer un réglage système sans accord ; aucun téléchargement important sans accord ; contenu factuel toujours issu de sources récupérées ; réponses en français ; chemins relatifs ; Python avec `-I` pour les scripts qui lisent des données téléchargées.

## Questions restant ouvertes (non bloquantes)
Compte GitHub à utiliser ; choix final du fournisseur d'IA gratuite (phase 2) ; priorité entre concours et contractuel (S5). Tranchées : nom public « Upgrade » ; dépôt GitHub créé à la main (pas de `gh`).
