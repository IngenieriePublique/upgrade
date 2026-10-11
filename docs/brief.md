# Brief : fonctionnement, entretien, désabonnements

**Ce que ça change pour tes objectifs** : tu remplaces le fil des réseaux sociaux par 13 items choisis (8 min), chacun avec une question à poser. Tu arrives en entretien ou en conversation avec de quoi parler, sans défiler.

## Chaîne de fabrication
`content/brief/config.json` (sources et règles) → `scripts/fetch_feeds.py` (téléchargement, analyse RSS/Atom) → `scripts/build_brief.py` (fraîcheur, langue, dédoublonnage, score, plafonds) → `site/data/brief/latest.json` + `archive/AAAA-MM-JJ.json` (60 jours) + `index.json` → écran `#/brief`.

- **Plafond** : 13 items = 5 France + 5 monde + 3 action publique, au plus 2 par groupe de sources et par rubrique (Le Monde, franceinfo, Localtis… ne remplissent pas tout).
- **Score** (visible dans le JSON) : priorité de la source (1 à 3) + mots d'action publique (jusqu'à +3) + mots institutionnels (jusqu'à +0,6) − mots de « jeu politique » (sondage, polémique, primaire, campagne… jusqu'à −3) − sujets divers (sport, people : −2) + 0,7 par autre média qui reprend le sujet (jusqu'à +2,1) + fraîcheur (jusqu'à +1). Les directs (« EN DIRECT »), quiz et podcasts sont exclus.
- **Dossier de la semaine** : un rapport ou une étude (Cour des comptes, Sénat, Conseil d'État, France Stratégie, The Conversation, Alternatives économiques), choisi une fois par semaine ISO et conservé jusqu'à la suivante.
- **Truc du jour** : un fait daté tiré de « Ce jour-là » de Wikipédia (CC BY-SA, attribution affichée).
- **Question à poser** : choisie dans `content/brief/questions.json` selon le thème détecté (finances, territoires, évaluation, social, écologie, international, institutions, défaut). Ce sont des questions **génériques** qui ne prétendent rien sur l'article : elles servent à transformer une lecture en conversation.
- **Droits** : titre, lien et une phrase de chapô (200 caractères au plus). Rien d'autre d'un article n'est copié. Les sources à abonnement sont signalées (« abonnement possible »).
- **Si presque tout échoue** (moins de 5 items), le script n'écrase pas le Brief existant et sort en erreur (l'exécution GitHub apparaît en rouge).

## Contrôler ou ajouter une source
```bash
python -I scripts/fetch_feeds.py --check
python -I scripts/fetch_feeds.py --check --url https://exemple.fr/rss
```
Une source est adoptée seulement si le contrôle donne OK (flux valide, entrées datées, dernier article récent), puis ajoutée dans `config.json` (rubrique, type `presse` / `institution` / `fond`, priorité, groupe). Écartées au 2026-10-11 : Vie-publique (défi JavaScript anti-robot, pas de flux lisible par script), La Gazette des communes, Euractiv, Les Échos (403), ANCT (flux vide), INSEE (pas de flux public trouvé), Localtis.info (domaine disparu). À relire à la main : Vie-publique, La Gazette, ANCT, INSEE (pour le bloc profond).

## Automatisation et repli
- `brief.yml` tourne chaque jour à 04:17 UTC (06:17 ou 05:17 à Paris), commite `site/data/brief/` puis lance `pages.yml` (un push fait avec le jeton du workflow ne déclenche pas les autres workflows). Lancement manuel : onglet **Actions > Brief quotidien > Run workflow**.
- **Risque connu** : dans un dépôt public inactif depuis 60 jours, GitHub désactive les workflows planifiés. Le commit quotidien est censé compter comme activité : **à vérifier le 2026-12-10** (le Brief doit toujours être à jour). L'écran Brief affiche une alerte si le Brief a plus de 2 jours.
- **Repli local** (sans GitHub) : `python -I scripts/build_brief.py`, puis `git add site/data/brief`, commit, push.
- Le cron peut avoir du retard de plusieurs minutes (c'est normal).

## IA facultative
Dans l'écran Brief, section « Aller plus loin avec une IA » : **toujours** le bouton « Copier le prompt prêt à coller » (le prompt contient les titres et chapôs du jour et interdit au modèle d'ajouter un fait). En option, une clé personnelle (Gemini en principal ; Mistral ou Groq en secours) enregistrée dans le navigateur uniquement : jamais dans le dépôt ni dans les sauvegardes. En cas de quota atteint ou d'erreur, l'écran renvoie vers le prompt à coller. Aucun texte généré par IA n'est publié dans le dépôt.

## Désabonner les newsletters bruyantes (à faire par toi, 15 minutes)
Je n'ai pas accès à ta boîte mail : voici la méthode.
1. Dans ta messagerie, cherche « se désabonner » (ou « unsubscribe ») sur les 3 derniers mois et trie par expéditeur.
2. Pour chaque expéditeur, une seule question : *en ai-je ouvert au moins un sur les quatre derniers ?* Non : désabonne-toi.
3. **Désabonne-toi sans hésiter** : alertes « dernière minute » ou push d'actualité, newsletters de commentaire politique et de jeu des partis, promotions, « tendances » et réseaux professionnels qui t'écrivent pour que tu reviennes.
4. **Garde** (au plus 3, en hebdomadaire, lues dans le bloc profond et non dans le Brief) : une lettre institutionnelle (Banque des Territoires / Localtis, Maire-info, Cour des comptes), une lettre de ton master ou de ton réseau, une lettre d'évaluation (SFE par exemple).
5. Les réseaux sociaux : le guide de blocage vient en phase 8.
