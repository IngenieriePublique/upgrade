# Fondations (phase 5) : curriculum en kits

**Ce que ça change pour l'objectif de l'utilisateur** : un entretien avec une région, un SGAR ou un service d'évaluation suppose de maîtriser le vocabulaire des institutions, des finances locales et de l'évaluation. Un kit transforme une heure de lecture sourcée en cartes à répétition espacée, sans rédiger de fiche de mémoire.

## Format d'un kit
Fichier `content/fondations/<parcours><nn>-<sujet>.json` (ex. `c04-methodes-causales.json`) :
- `id`, `parcours` (A à F, la lettre de l'identifiant), `ordre`, `titre`, `accroche`, `duree_min` (30 à 240), `revu` (date ISO), `perissable` + `perissable_note`.
- `fiche` : au moins 3 sections de paragraphes, 250 à 1 400 mots au total.
- `cartes` : 12 à 30 cartes (`id` = `<id du kit>-NN`, `recto`, `verso`, `perissable`) qui héritent des sources et de la date du kit.
- `ressource` : un document externe (titre, url, type, durée, pourquoi).
- `debat` : exactement 3 questions, chacune se terminant par « ? ».
- `sources` : au moins 2 adresses distinctes (titre et url).

`python scripts/build_fondations.py` valide tout et publie `site/data/fondations/index.json` et un fichier par kit. La validation échoue si une règle n'est pas respectée (le dépôt n'accepte pas un kit non conforme : `validate.yml` rejoue le build et compare).

## Parcours et jours (voir `content/fondations/parcours.json`)
A Institutions et action publique (lundi), B Finances publiques et locales (lundi), C Évaluation et pilotage (mercredi), D Histoire, géographie, géopolitique (mardi), E Arts, lettres, idées (mardi), F Métier et marché (samedi). L'écran « Aujourd'hui » propose le prochain kit du parcours du jour ; ouvrir un kit ajoute ses cartes au paquet `fondations-<parcours>`.

## Méthode de rédaction (anti-hallucination)
1. Lire les sources avant d'écrire : `python -I scripts/wiki_lib.py intro|texte|section ...` (Wikipédia), `fetch_text.py` (pages), `pdf_text.py` (PDF simples ; certains PDF à polices CID, comme des arrêtés de centres de gestion, ne s'extraient pas).
2. Reformuler, citer au moins 2 sources, marquer les faits périssables (chiffres, noms, barèmes) avec leur date.
3. Ne mettre dans les cartes que ce que la fiche affirme. Vérifier à part les chiffres (une source officielle de préférence).
4. `python -I scripts/check_links.py content/fondations` (403 et 429 = à vérifier à la main).

## État au 2026-10-12 (26 fichiers, 25 kits)
- A : Ve République, État territorial, décentralisation, collectivités, intercommunalité, contractualisation (CPER, CRTE), fonds européens, aménagement et ZAN, services publics locaux (A1 à A9).
- B : LOLF et lois de finances, budget local, recettes locales, analyse financière, ordres de grandeur 2025 et contrôle des comptes locaux (B1 à B5).
- C : définition de l'évaluation, critères OCDE, chaîne de résultats, méthodes causales, méthodes mixtes, acteurs, conduite d'une évaluation et évaluation des fonds européens et des CPER (C1 à C8).
- D1 Union européenne, E1 action publique, F1 fonction publique territoriale (premiers kits de ces parcours).
- Mois d'octobre 2026 : C7, A8, A9 et B5 faits (les sources lourdes ont été lues dans le navigateur intégré quand EUR-Lex, Légifrance ou des PDF bloquaient les scripts ; certains PDF à polices CID ne s'extraient pas). A8 et B5 reposent sur des faits à revérifier : ZAN (proposition TRACE non inscrite à l'Assemblée au 25 juin 2026) et chiffres 2025 de l'Insee.
- Reste à produire (croisière, 4 kits par mois) : D (histoire, géographie, géopolitique) ; E (arts, lettres, idées) ; F (marché de l'évaluation, outils et réseau).
