# Décisions et vérifications de la séance S0 (2026-10-11)

## Décisions de l'utilisateur
PC d'abord (le site statique reste lisible sur téléphone) ; site statique public sur GitHub Pages + Actions ; Claude produit le contenu en séances ; IA en ligne gratuite seulement si elle aide vraiment ; 60 min par jour.

## Outils vérifiés
Python 3.14.1, git 2.56, Edge 155, voix système fr-FR « Microsoft Hortense Desktop ». `gh` absent : pour créer le dépôt et lancer les workflows, soit installer GitHub CLI (accord requis), soit créer le dépôt à la main sur github.com et pousser avec git. Node absent (non nécessaire).

## IA gratuite en ligne : état des lieux (recherche web du 2026-10-11, sources secondaires, à recontrôler sur les pages officielles avant usage)
- **Gemini API (AI Studio)** : palier gratuit limité aux modèles Flash selon plusieurs sources (changement d'avril 2026), quotas par projet (requêtes/minute, jetons/minute, requêtes/jour) qui varient d'une source à l'autre ; contenus du palier gratuit utilisables par Google pour améliorer ses produits. Candidat principal pour le retour sur les notes (pas de données sensibles dedans).
- **Mistral La Plateforme (plan Experiment)** : vérification par téléphone ; l'utilisation gratuite impose d'accepter l'entraînement sur les données. Bon français. Candidat de secours.
- **Groq** : gratuit sans carte, quotas par organisation (de l'ordre de quelques centaines à milliers de requêtes par jour selon le modèle) ; politique d'entraînement non confirmée.
- Non explorés : OpenRouter modèles `:free`, Cloudflare Workers AI.
- **Conclusion provisoire** : n'envoyer à une API que des textes non sensibles (notes d'exercice anonymes, extraits d'articles publics). Fournisseur final à choisir en phase 2 (Brief) après lecture des pages officielles de quotas, de la politique de données et un test CORS depuis un navigateur. Repli permanent : bouton « copier un prompt prêt à coller ».

## GitHub Actions : risque confirmé
Dans un dépôt public, les workflows planifiés sont désactivés automatiquement après 60 jours sans activité du dépôt (documentation GitHub). Parades prévues en phase 2 : le workflow `brief.yml` committe les données du Brief (activité), plus `workflow_dispatch` et repli local `python scripts/build_brief.py`.

## Décisions de la séance S1 (2026-10-11)
- Nom public du site : **Upgrade**. Dépôt GitHub créé à la main (pas d'installation de `gh`) : opération unique, authentification par Git Credential Manager au premier push. Le workflow `brief.yml` (phase 2) se déclenchera depuis l'interface GitHub (Actions > Run workflow).
- Sigles : 49 cartes livrées sur ~60 visés. Écartées faute de seconde source vérifiable : INET et plusieurs candidats (DRAC, DRAAF, CCAS, SEM, DSP, CGCT, CAF, PNR, ORT, ACV). À compléter en croisière.
- Méthode de sourçage : Wikipédia (intro, CC BY-SA) + site officiel (Wikidata P856) ou page institutionnelle dont l'adresse répond et contient le sujet. Faits périssables marqués et date de revue 2026-10-11.

## Questions encore ouvertes
Compte GitHub ; fournisseur d'IA (phase 2) ; concours ou contractuel (phase 3).
