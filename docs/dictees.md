# Dictées (phase 6)

**Ce que ça change pour l'objectif de l'utilisateur** : une note, un courrier ou un rapport avec des fautes d'orthographe ruine la crédibilité d'un analyste, surtout dans l'administration. La dictée sur papier (écrire à la main, sans correcteur) entraîne l'œil et la main ; marquer ses fautes par catégorie montre où se concentrent les erreurs, et les cartes de règles ciblées les attaquent par répétition espacée.

## Parcours
1. `#/dictee` : dictée conseillée, statistiques de fautes, liste des 40 dictées (4 niveaux).
2. `#/dictee/ecrire?id=dNN` : lecture complète, puis lecture par segments (voix du navigateur, vitesse réglable, ponctuation dictée ou non, enchaînement automatique facultatif). L'utilisateur écrit **sur papier**.
3. `#/dictee/corriger?id=dNN` : le texte s'affiche ; on choisit un type de faute, on clique chaque mot fautif. « Terminer » enregistre l'essai, affiche le bilan et ajoute à la révision les règles des catégories où il y a eu des fautes.

Le bloc « Dictée » de Aujourd'hui (lundi, mercredi, vendredi) pointe vers la dictée conseillée et se coche quand une correction est terminée.

## Les sept catégories de fautes
`pp` accord du participe passé · `homophone` homophones grammaticaux · `sujet-verbe` accord sujet-verbe · `gn` accord dans le groupe nominal · `conjugaison` · `lexicale` orthographe lexicale · `ponctuation`. Définies dans `content/dictees/regles.json` (champ `categories`) ; sigle et couleur dans `site/js/dictee.js` (`CODES`) et `app.css`.

## Choix de la dictée suivante (`site/js/dictee.js`, fonctions pures testées)
- Niveau conseillé : d'après les 3 derniers essais, moins de 4 fautes pour 100 mots → niveau supérieur ; 12 et plus → niveau inférieur ; sinon le même (niveau de la dernière dictée faite).
- Parmi les dictées non encore faites du niveau le plus proche, on prend celle dont le `profil` recoupe le mieux les catégories où l'utilisateur se trompe (part des fautes sur les 10 derniers essais, lissage de Laplace). Tout fait : la moins récente.
- `profil` (par dictée, pièges pour 100 mots) est une **estimation automatique** (`scripts/dictee_lib.py`, fonction `profil` : listes d'homophones, mots précédés d'un auxiliaire, terminaisons…), pas une analyse linguistique ni une relecture.

## Données
- Sélection : `content/dictees/selection.json` (40 passages : source, début exact, nombre minimal de mots, niveau, titre). `python -I scripts/extract_dictees.py` lit `data_local/dictees/` (textes téléchargés par `fetch_dictees.py` et `fetch_text.py`, hors dépôt) et écrit `content/dictees/dictees.json` (versionné : texte, segments de lecture, fins d'alinéa, profil, source, licence). Le passage s'arrête à la première fin de phrase une fois le minimum de mots atteint, guillemets fermés. Apostrophes typographiques ; « M » devient « M. » (Wikisource retire le point des abréviations) ; « oeuvre » devient « œuvre » dans les textes officiels.
- Niveaux : 1 Daudet, Verne ; 2 Daudet, Verne, Voltaire, Maupassant ; 3 Maupassant, Flaubert, Zola, Rousseau ; 4 Tocqueville (communes et centralisation), Déclaration de 1789, Constitution (art. 1, 3, 24, 47-2, 72, 72-2 : le Parlement évalue les politiques publiques, la Cour des comptes, les collectivités territoriales).
- Règles : `content/dictees/regles.json`, 41 cartes sourcées (paquet `regles`, ids `regles-<catégorie>-NN`), chacune avec au moins 2 sources distinctes lues avant rédaction : Banque de dépannage linguistique de l'OQLF (Québec : la grammaire de base est la même ; fiches rédigées pour l'usage québécois), Wikipédia, Wiktionnaire. Limite honnête : pour plusieurs cartes les deux sources viennent de la même BDL (deux fiches différentes). Un second regard (Académie française, grammaire de référence) reste utile.
- `python scripts/build_dictees.py` valide (identifiants, niveaux, 50 à 200 mots, nombre de mots exact, segments qui recomposent le texte, alinéas, profil complet, 2 sources par règle, au moins 3 règles par catégorie) et publie `site/data/dictees/{dictees,regles}.json` ; `validate.yml` rejoue le build et compare.
- Ajouter une dictée : une ligne dans `selection.json` (début exact et unique), puis `extract_dictees.py` et `build_dictees.py`. Les identifiants `dNN` suivent l'ordre de la sélection : ajouter à la fin pour ne pas décaler les essais déjà enregistrés.

## Données personnelles
Un essai = une note `dictee:<id>:<horodatage>` `{dicteeId, ts, mots, niveau, fautes: [{i, cat}]}` (`i` = position du mot dans `texte.split(/\s+/)`). Les catégories activées sont des notes `regle:<catégorie>`. Tout est dans IndexedDB et dans les sauvegardes JSON ; rien n'est dans le dépôt. Au démarrage (`app.js`), les cartes des catégories actives sont ajoutées au paquet `regles`.

## Voix
`speechSynthesis` : voix françaises du navigateur (Edge : Hortense, Julie, Paul ; les voix « Natural » sont préférées si présentes). `texteParle` développe les abréviations (M. → monsieur) et dicte la ponctuation si demandé. Sans voix française, le segment peut être affiché (« Voir le segment »). Réglages gardés dans le `localStorage`.

## Droits
Textes Wikisource : œuvres du domaine public, transcription sous licence CC BY-SA 4.0 (attribution affichée à la fin de chaque correction). Constitution et Déclaration de 1789 : textes officiels publiés par le Conseil constitutionnel.

## Reste à faire (croisière)
Dictées supplémentaires (extraits contemporains libres de droit, vocabulaire de l'évaluation et des finances locales), cartes de règles complémentaires (noms composés, accord de « tout » dans les locutions, verbes pronominaux essentiels), relecture des règles par une seconde source de référence.
