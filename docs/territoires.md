# Territoires (phase 4)

**Ce que ça change pour les objectifs** : connaître sans hésiter les départements, régions, préfectures, numéros et voisins est le « bruit de fond » de toute conversation avec un élu, un préfet ou un recruteur de collectivité. Dix questions par jour, planifiées par la répétition espacée, y suffisent.

## Données
- `python -I scripts/fetch_territoires.py` télécharge (une fois, ~6 Mo, dans `data_local/territoires/`, hors dépôt) :
  - contours : [france-geojson](https://github.com/gregoiredavid/france-geojson) (tracés IGN Admin Express COG 2018, licence ouverte Etalab) ;
  - noms et codes : API Découpage administratif (geo.api.gouv.fr) ;
  - préfectures et sous-préfectures : wikitext de « Liste des préfectures de France » (Wikipédia, CC BY-SA) ;
  - population, superficie, article : Wikidata (CC0) ; introductions : API Wikipédia.
- `python -I scripts/build_geo.py` fabrique :
  - `content/territoires/{departements,regions,anciennes-regions}.json` (faits sourcés, lisibles) ;
  - `site/data/territoires/data.json` (même contenu, pour le site) ;
  - `site/data/geo/france.json` (chemins SVG : Lambert-93 pour la métropole, 5 encarts pour l'outre-mer, simplification Douglas-Peucker).
- Contrôles intégrés au build : 101 départements, 18 régions, 18 préfectures de région, 234 sous-préfectures, voisinage symétrique, superficie du tracé à moins de 12 % de la valeur officielle, introduction Wikipédia présente.
- **Voisins** : calculés sur les tracés (deux départements sont voisins s'ils partagent au moins un segment de frontière) et comparés à Wikidata (propriété « partage une frontière avec ») : un seul désaccord, Cher et Yonne (point de contact pour la géométrie ; frontière selon Wikidata). La géométrie fait foi.
- **Rhône** : l'élément Wikidata du département exclut la métropole de Lyon, alors que le tracé et la population (1 893 692, 2021) l'incluent : la superficie du Rhône est donc laissée vide et exclue des comparaisons.
- **Populations** : dernière valeur Wikidata de chaque territoire (l'année est affichée) ; les comparaisons « Plus ou moins » exigent un écart d'au moins 15 %, donc insensibles aux années différentes.
- Pas de re-génération en intégration continue (elle demande le réseau). Pour rafraîchir : supprimer `data_local/territoires/`, relancer les deux scripts, relire le diff.

## Jeu
- `site/js/territoires.js` (logique pure, testée par `tests/territoires.test.js`) : 11 modes, 861 éléments à apprendre, chacun une carte du moteur SM-2 (`terr-<mode>-<code>`).
  - Régions : placer, préfecture de région, anciennes régions → région actuelle. Départements : placer, nommer (surligné), numéro ↔ nom, préfecture ↔ département, région d'un département, voisins (multi-clics).
  - Ordre d'introduction : régions, puis départements région par région en commençant par la Nouvelle-Aquitaine et l'Île-de-France ; voisins en dernier. 6 nouveaux éléments par jour au plus ; 10 questions par séance.
  - Note automatique : faux = Encore ; juste en ≤ 4 s = Facile ; ≤ 12 s = Bien ; plus lent = Difficile. Une erreur est reposée une fois dans la séance.
- Carte de maîtrise : niveau 0 (jamais vu), 1 (vu), 2 (solide : tous les éléments du territoire à ≥ 7 jours), 3 (mûr : ≥ 21 jours).
- Jeux libres (hors répétition espacée) : « Plus ou moins » (population, superficie, densité ; record dans la sauvegarde) et « Qui suis-je ? » (indices progressifs, extrait Wikipédia masqué).
- Fiches : `#/territoires/fiche?code=33` ou `code=r:75` ; extrait Wikipédia cité avec attribution CC BY-SA.
- Géographie physique et outre-mer : paquet de cartes `content/cartes/geographie.json` (fleuves, massifs, îles, COM ; 2 sources par carte).

## Limites connues
- Les contours datent de 2018 (nombre de départements et de régions inchangé depuis ; la Corse est une collectivité unique mais garde ses deux départements dans les données).
- Pas de spécialités AOP/IGP ni de personnalités dans « Qui suis-je ? » : les données INAO ne se prêtent pas à un traitement fiable sans lecture fine ; indices tirés des faits sourcés ci-dessus.
- La carte n'est pas utilisable au clavier seul (questions de clic) : le bouton « Je ne sais pas » et les modes à choix multiples restent accessibles.
