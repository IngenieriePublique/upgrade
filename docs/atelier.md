# Atelier d'écriture et portfolio (phase 7)

**Ce que ça change pour l'objectif de l'utilisateur** : le sentiment d'imposture vient moins des faits que du manque de preuves. Une note de deux pages écrite en une heure à partir d'un dossier, puis un livrable publié sur données ouvertes, sont les preuves qu'un recruteur du pilotage ou de l'évaluation des politiques publiques sait lire. L'atelier fabrique la pratique (une note par semaine, le jeudi) et le portfolio la transforme en trace publique.

## Cycle d'une note (60 minutes, `#/atelier`)
1. **Dossier** : trois documents sourcés (résumé rédigé pour l'exercice, limite du document, lien vers l'original ; un tableau chiffré pour la première note).
2. **Écriture chronométrée** (`#/atelier/ecrire?id=n01`) : zone à enregistrement automatique, compteur de mots, minuteur global. Le brouillon se reprend tant qu'il n'est pas terminé.
3. **Auto-évaluation** (`#/atelier/evaluer`) : sept critères (problème, plan, hiérarchisation, chiffres, recommandation, risques, style), quatre niveaux décrits. **La note modèle n'apparaît qu'une fois les sept critères remplis.** Prompt « à coller » facultatif pour un retour dans un chat (le texte de l'utilisateur y figure : l'écran le dit).
4. **Réécriture** (`#/atelier/reecrire`) : critères faibles rappelés, première version repliée, note modèle consultable.
5. Quatre notes : finances des départements néo-aquitains (n01), suivi du CPER de Provence-Alpes-Côte d'Azur (n02), PLUi et loi TRACE (n03), enseignements de l'évaluation REACT-EU (n04).

## Exercices courts (10 à 20 minutes, `#/atelier/court`)
Quatre types : titres qui disent quelque chose (c01, c02), réécrire en dix lignes (c03, c04), une page pour un élu (c05, c06), lire un tableau en trois enseignements (c07, c08). L'utilisateur répond, voit le modèle, puis marque « j'ai comparé ». Pas de grille.

## Étape suivante (`site/js/atelier.js`, fonctions pures testées)
Finir ce qui est commencé (brouillon, évaluation, réécriture, comparaison), puis alterner une note et un exercice court, puis plus rien (conseil : refaire une note en visant le critère le plus faible, calculé sur les quatre dernières notes évaluées). Le bloc « profond » du jeudi dans Aujourd'hui pointe vers cette étape ; si tout est fait, vers le projet de portfolio en cours.

## Portfolio (`#/atelier/portfolio`, `#/atelier/projet?id=p1`)
Quatre projets cadrés (question, ce que ça prouve, données avec licence, étapes, livrable, pièges, kits liés) : p1 analyse financière des départements néo-aquitains (niveau 1), p2 Action cœur de ville et marché immobilier (niveau 3, différence de différences), p3 consommation d'espaces et sobriété foncière (niveau 2), p4 programmation européenne dans la région (niveau 2). Upgrade ne rédige jamais le livrable. Les deux dernières étapes sont toujours « relire » (par une personne du métier) et « publier » ; un projet compte comme publié quand toutes les étapes sont cochées et qu'une adresse est notée. Avant de publier : liste de contrôle de 7 points (licences, reproductibilité, absence de données personnelles, limites, accord pour toute information de stage, relecture, adresse stable).

`python -I scripts/portfolio_ofgl.py` prépare les données du projet p1 (comptes consolidés des départements, OFGL, Licence ouverte 2.0) : CSV dans `data_local/portfolio/` avec taux d'épargne brute, capacité de désendettement et montants par habitant ; `--table 2023-2025` affiche le tableau du corpus de la note n01 ; `--region` change de région. Le jeu de données OFGL utilise des codes de département sans zéro initial (« 33 ») et le champ `exer` est une date.

## Contenu et validation
- Sources lisibles : `content/atelier/{grille,notes,courts,portfolio}.json` → `python scripts/build_atelier.py` valide et publie `site/data/atelier/`.
- **Contrôle des nombres** : chaque nombre d'une note modèle ou d'un modèle court doit figurer dans le corpus, dans la commande ou dans la liste « calculs » (un calcul est écrit avec sa formule). Les renvois [D1], [D2] doivent exister et chaque document doit être cité. La fourchette de mots (400 à 900) est vérifiée. Un exercice « dix lignes » a un modèle de 140 mots au plus.
- Le corpus est un **résumé rédigé** d'après les documents lus, avec leur limite et le lien de l'original (les originaux font foi). Le tableau de n01 vient de `portfolio_ofgl.py`.
- Ajouter un exercice : un objet de plus dans `notes.json` (3 documents aux adresses distinctes) ou `courts.json` ; l'ordre du fichier est l'ordre de proposition.
- Limites connues : lecture du communiqué de presse du CPER par capture d'écran (chiffres recoupés par addition) ; la synthèse courte de REACT-EU s'extrait mal (seuls les chiffres lisibles sont cités) ; le statut provisoire ou définitif des données OFGL de 2025 n'est pas précisé dans la notice. Les faits périssables (état de TRACE, chiffres 2025) sont à revoir à la date `revu`.

## Données personnelles
Notes `redac:<exercice>:<horodatage>` (`texte`, `secondes`, `finishedAt`, `grille`, `reecriture`, `compare`) et `portfolio:<projet>` (`etapes`, `notes`, `controles`, `url`). Tout est dans IndexedDB et dans les sauvegardes JSON, jamais dans le dépôt.

## Reste à faire (croisière)
Nouvelles notes (une par mois : choisir un dossier d'actualité, trois documents sourcés, une note modèle sans chiffre inventé) ; quand l'utilisateur a écrit son propre livrable p1, ajouter ici ce qu'il en a appris sans y mettre son texte.
