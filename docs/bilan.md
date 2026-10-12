# Bilan et anti-réseaux (phase 8)

**Ce que ça change pour l'objectif de l'utilisateur** : le système remplace les réseaux sociaux par une boucle finie ; il faut donc (1) voir honnêtement si la boucle est tenue et si le temps sur les réseaux baisse, (2) couper ce qui ne sert pas pour que le système ne devienne pas une nouvelle source de culpabilité, (3) ne pas laisser un besoin non satisfait ramener l'ancienne habitude. Le bilan est lu une fois par semaine, pas tous les jours : pas de série, pas de compte à rebours.

## Écrans (`site/js/modules/bilan.js`, logique pure dans `site/js/bilan.js`)
- `#/bilan` : **six repères à trois mois** (voir ci-dessous), régularité (jours tenus sur 7 et 28 jours, douze semaines en barres), cartes apprises et mûres, carte de maîtrise des Territoires, tendance des fautes de dictée, atelier et portfolio, entretiens d'information, temps passé sur les réseaux (référence et semaines saisies). Des alertes rappellent la revue de la semaine et l'audit du trimestre.
- `#/bilan/revue` : **revue hebdomadaire guidée de 15 minutes** en cinq étapes (chiffres de la semaine calculés seuls ; minutes passées sur les réseaux ; cinq questions ; sauvegarde ; une intention). Le dimanche, le bloc « profond » de Aujourd'hui y mène (sauf pendant le sprint de candidature). L'intention de la semaine précédente est rappelée en tête.
- `#/bilan/audit` : **audit trimestriel** : pour chacun des six blocs, le nombre de jours où il a été coché sur 90 jours, parmi les jours où la séance a été ouverte, et une décision (garder, réduire, supprimer, approfondir) ; quatre questions. À faire quand le trimestre est bien entamé (à partir du 70e jour) : une alerte du bilan le rappelle.
- `#/bilan/reseaux` : **guide anti-réseaux** : mesurer la référence, table « besoin → substitut » (actualité → Brief, petite récompense → carte de maîtrise, curiosité → truc du jour, appartenance → contact humain, expression → atelier et portfolio, attente → lecture hors écran, suivi du métier → flux institutionnels et radar), friction (LeechBlock NG sur ordinateur, Bien-être numérique sur Android, Temps d'écran sur Apple, conseils d'usage), phrases « quand… alors… » à écrire.

**Réglages système** : Upgrade n'en modifie aucun. L'écran donne des instructions que l'utilisateur applique lui-même. Les étapes viennent des pages d'aide officielles lues le 2026-10-12 (fiche de l'extension, aide Google, assistance Apple pour Mac) ; chaque outil porte une mention « à vérifier » (noms de menus, compatibilité Edge, guide Apple lu pour Mac seulement).

## Les six repères (définis dans `content/bilan/bilan.json`, `objectifs`)
| Repère | Mesure | Cible |
|---|---|---|
| Régularité | séances terminées sur les 28 derniers jours | 20 (5 sur 7) |
| Territoires | départements et régions au niveau « solide » de la carte de maîtrise (tous les éléments d'un territoire avec un intervalle d'au moins 7 jours) | 119 sur 119 |
| Kits publiés | kits de `content/fondations/` | 30 (production de contenu : 25 au 2026-10-12) |
| Portfolio | projets avec toutes les étapes cochées et une adresse de publication notée | 1 |
| Entretiens d'information | contacts au statut « entretien fait » | 6 |
| Réseaux | moyenne des quatre dernières semaines saisies contre la référence | −50 % |
Le début du système est la plus ancienne séance ou révision enregistrée ; l'échéance est trois mois plus tard. Ce sont des repères, pas des notes.

## Données personnelles
Notes `ecran:base` (`minutes`, `date`), `ecran:<lundi>` (`minutes` de la semaine), `revue:<lundi>` (`reponses`, `intention`, `doneAt`), `audit:<AAAA-Tn>` (`decisions`, `reponses`, `doneAt`), `reseaux:plan` (trois phrases « quand… alors… »). Tout est dans IndexedDB et dans les sauvegardes JSON, jamais dans le dépôt.

## Contenu et validation
`content/bilan/bilan.json` → `python scripts/build_bilan.py` (valide les repères, la revue, l'audit et le guide ; chaque outil de blocage a au moins 3 étapes et 2 sources distinctes ou se déclare « sans source » ; chaque besoin a un lien interne) → `site/data/bilan/bilan.json`. `validate.yml` rejoue le build.

## Reste à faire par l'utilisateur
Relever la référence de temps passé sur les réseaux avant de bloquer ; installer les blocages (instructions de l'écran) ; faire la première revue un dimanche ; faire le premier audit en décembre 2026.
