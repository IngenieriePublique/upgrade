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

## Décisions de la séance S3-S4 : Brief (2026-10-11)
- **Flux** : 36 sources testées et retenues (France, monde, action publique, fond). Écartées : Vie-publique (défi JavaScript anti-robot), La Gazette des communes / Euractiv / Les Échos (403), ANCT (flux vide), INSEE (aucun flux public), Localtis.info (domaine disparu).
- **Fournisseur d'IA** : Gemini (AI Studio) en principal, format « compatible OpenAI » (Mistral, Groq) en secours. Vérifié : CORS autorisé depuis un navigateur pour les quatre API testées (Gemini, Mistral, Groq, OpenRouter). Les pages officielles Gemini (2026-10-11) ne publient plus de quotas gratuits chiffrés (à lire dans AI Studio), indiquent que le contenu du palier gratuit sert à améliorer les produits de Google, et listent des modèles Flash dont les noms changent : le champ modèle est donc modifiable (défaut `gemini-flash-latest`, non testé avec une vraie clé). Conséquence : on n'envoie que des textes publics (titres et chapôs).
- **IA côté serveur (GitHub Actions) : non retenue** : un résumé de titre et de chapô n'apporte presque rien, et publier du texte généré dans un dépôt public pose des problèmes de fiabilité et de droits. L'IA reste dans le navigateur, à la demande.
- **Questions à poser** : génériques par thème (pas de génération par IA), pour ne rien affirmer de faux sur un article.
- **Cron** : `brief.yml` committe chaque jour (activité du dépôt) et relance `pages.yml` explicitement (un push fait avec GITHUB_TOKEN ne déclenche pas d'autre workflow). Non testé tant que le dépôt n'existe pas ; contrôle de la règle des 60 jours prévu le 2026-12-10.
- **Dédoublonnage** : titres proches regroupés par liaison simple (mots communs ou similarité de chaînes) ; le nombre de médias qui reprennent un sujet augmente son score.

## Décisions de la séance S5 : sprint candidature (2026-10-11)
- **Données personnelles dans un magasin `notes` unique** (IndexedDB v2) plutôt que dans `meta` : l'import fusionne par date de modification au lieu d'ignorer une clé déjà présente, et les suppressions ne ressuscitent pas.
- **Audio jamais conservé** : l'enregistreur garde le son en mémoire pour la réécoute et la grille d'auto-évaluation ; seul le résumé (durée, notes, tics, commentaire) est enregistré. Repli chronomètre sans micro.
- **Radar de 32 employeurs** (au-delà des 30 prévus) : 5 portails d'offres en plus. Écartés : OFGL (plutôt une source de données qu'un employeur), cabinets privés d'évaluation (aucun nom étayé par les sources lues ; méthode à retenir : attributaires des marchés BOAMP/DECP et liste des adhérents SFE), associations de collectivités autres que Départements de France.
- **Concours ou contractuel** : l'utilisateur tranche ; la note pose les faits sourcés (CDG 33, fonction-publique.gouv.fr, IRA, CNFPT), sépare un « avis de travail » (voies en parallèle) et laisse une décision provisoire datée à écrire.
- **Pas de pitch ni d'histoires rédigés par Claude** : ce sont des faits sur le parcours de l'utilisateur, que Claude ne connaît pas ; le site fournit des gabarits, un « prompt à coller » et l'enregistreur.
- **Matrice de compétences VEILLE reportée** : 4 offres « oui » et 16 « peut-être » seulement, collecte récente (depuis 2026-10-09 pour la base actuelle) ; trop mince pour piloter un curriculum.

## Questions encore ouvertes
Compte GitHub ; décision concours / contractuel (à écrire par l'utilisateur dans l'écran Concours ou contrat avant le 2026-11-15).

## Décisions des phases 7 à 9 : atelier, portfolio, bilan, croisière (2026-10-12)
- **Contrôle des nombres plutôt que confiance dans la rédaction** : une note modèle est écrite par Claude, donc susceptible d'inventer. Le validateur (`build_atelier.py`) refuse tout nombre absent du corpus, de la commande ou d'une liste « calculs » écrite avec sa formule. Le corpus est un résumé rédigé d'après les documents lus (pas une copie), avec la limite du document et le lien de l'original.
- **Le portfolio appartient à l'utilisateur** : Upgrade cadre quatre projets (questions, données ouvertes vérifiées avec licence, étapes, pièges, liste de contrôle de publication) mais ne rédige aucun livrable ; l'étape « relire par une personne du métier » est obligatoire avant « publier ». Les données DVF ne doivent pas permettre de retrouver une personne.
- **Note modèle après l'auto-évaluation seulement** : voir la solution avant de s'être jugé annule l'exercice ; les sept critères doivent être remplis avant l'affichage du modèle.
- **Bilan lu une fois par semaine** : pas de série ni de compte à rebours ; six repères à trois mois présentés comme des repères et non des notes. Le temps passé sur les réseaux est saisi à la main (aucune API ne le fournit à un site web) et comparé à une référence relevée avant le blocage.
- **Blocage des réseaux : instructions, jamais un réglage** : l'utilisateur applique lui-même (LeechBlock NG, Bien-être numérique, Temps d'écran) ; chaque outil dit ce qui reste à vérifier (compatibilité Edge, noms de menus, guide Apple lu pour Mac seulement). Les conseils sans source (désinstaller, couper les notifications) sont étiquetés comme tels.
- **Croisière = routine, pas phase** : un audit automatique des dates de revue, un lecteur des erreurs signalées, un calendrier ; production à raison d'une séance de contenu par mois. Le bloc « mot du jour » de Aujourd'hui, jamais réalisé, est remplacé par une lecture libre pour ne pas laisser une promesse vide à l'écran.
- **Limites assumées** : communiqué du CPER Sud lu par capture d'écran (chiffres recoupés par addition) ; synthèse courte de REACT-EU extraite avec perte (seuls les chiffres lisibles sont cités) ; statut provisoire ou définitif des données OFGL 2025 non précisé dans la notice.
