# Upgrade

Boucle quotidienne finie de 60 minutes pour apprendre, se tenir informé et s'entraîner (institutions, finances locales, évaluation des politiques publiques, culture générale). Site statique, sans compte ni serveur : la progression reste dans le navigateur.

## Utiliser
Ouvrir le site publié (GitHub Pages) dans Edge ou Chrome, puis « Installer l'application » si on le souhaite. Chaque jour : **Aujourd'hui** → les cinq blocs → **Terminer la séance**. Le jeudi, l'**Atelier** (une note de deux pages) ; le dimanche, la **Revue** du **Bilan** (15 minutes). Sauvegarder au moins une fois par semaine (page **Sauvegarde**).

## Développer
```
python -m http.server 8765 --bind 127.0.0.1     # puis http://localhost:8765/site/
python -m unittest discover -s tests -t .       # tests Python
# tests JavaScript : ouvrir http://localhost:8765/tests/index.html
python scripts/build_content.py                 # valide content/cartes/*.json et publie dans site/data/cartes/
python scripts/build_sprint.py                  # valide le radar, les questions, les gabarits, la note carrière
python scripts/build_fondations.py              # valide les kits du curriculum
python scripts/build_dictees.py                 # valide les dictées et les règles
python scripts/build_atelier.py                 # valide l'atelier d'écriture (chaque nombre d'une note modèle doit être dans le corpus) et le portfolio
python scripts/build_bilan.py                   # valide le bilan, la revue, l'audit, le guide anti-réseaux
python -I scripts/check_links.py                # teste les adresses citées par le radar et l'oral
python -I scripts/audit_croisiere.py            # ouvre une séance mensuelle : faits périssables à revoir, kits restants, Brief
```
Sur `localhost`, le service worker (hors ligne) est désactivé ; l'activer avec `?sw` dans l'adresse.

## Contenu et droits
Les fiches reformulent des sources citées sur chaque carte. Textes issus de Wikipédia : CC BY-SA 4.0 (attribution par le lien de source). Voir `PLAN.md` et `CLAUDE.md` pour le plan complet.
