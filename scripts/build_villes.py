"""Villes de France métropolitaine pour le jeu des territoires de First Upgrade.

Deux étapes :
- `python -I scripts/build_villes.py --fetch` interroge Wikidata (communes de plus de 100 000 habitants, population la plus
  récente, coordonnées) et écrit la sélection lisible dans content/territoires/villes.json (versionné) ;
- `python -I scripts/build_villes.py` projette ces villes dans le repère de la carte (Lambert-93, même cadrage que
  site/data/geo/france.json, voir build_geo.py), trouve le département de chaque ville d'après les tracés et écrit
  site/data/territoires/villes.json.

Règle de sélection : métropole seulement (les encarts d'outre-mer n'ont pas de projection commune), au moins 100 000
habitants, et on écarte une commune à moins de 15 km d'une commune plus peuplée déjà retenue (Villeurbanne près de Lyon,
Saint-Denis ou Montreuil près de Paris : les points se superposeraient sur la carte).
"""
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo_lib as g  # noqa: E402
import build_geo as bg  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "territoires" / "villes.json"
CIBLE = RACINE / "site" / "data" / "territoires" / "villes.json"
SEUIL = 100_000
DISTANCE_MIN_KM = 15
REVU = "2026-10-12"
REQUETE = """SELECT ?c ?cLabel ?pop ?coord WHERE {
 ?c wdt:P31 wd:Q484170; wdt:P1082 ?pop.
 FILTER(?pop>%d)
 ?c wdt:P625 ?coord.
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
} ORDER BY DESC(?pop)""" % SEUIL


def lire_point(wkt):
    """'Point(2.35 48.85)' -> (lon, lat)."""
    lon, lat = wkt[wkt.index("(") + 1:wkt.index(")")].split()
    return float(lon), float(lat)


def distance_km(a, b):
    """Distance approchée (équirectangulaire), suffisante à l'échelle de quelques dizaines de kilomètres."""
    k = math.cos(math.radians((a[1] + b[1]) / 2))
    return 6371.0 * math.hypot(math.radians(a[0] - b[0]) * k, math.radians(a[1] - b[1]))


def selectionner(lignes, seuil=SEUIL, distance_min=DISTANCE_MIN_KM):
    """lignes : [{qid, nom, population, lon, lat}] -> villes retenues, de la plus peuplée à la moins peuplée."""
    retenues = []
    for v in sorted(lignes, key=lambda v: -v["population"]):
        if v["population"] < seuil or not (-6 < v["lon"] < 10 and 41 < v["lat"] < 52):
            continue
        if any(distance_km((v["lon"], v["lat"]), (r["lon"], r["lat"])) < distance_min for r in retenues):
            continue
        retenues.append(v)
    return retenues


def origine(deps_geo):
    """(X_MIN, Y_MAX) en km : le cadrage de la métropole de build_geo.construire."""
    metro = [f["geometry"] for f in deps_geo if f["properties"]["code"] not in bg.DROM]
    pts = [g.lambert93(lon, lat) for gm in metro for r in g.anneaux(gm) for lon, lat in r]
    return min(x for x, _ in pts) / 1000 - bg.MARGE, max(y for _, y in pts) / 1000 + bg.MARGE


def projeter(lon, lat, x_min, y_max):
    """Coordonnées SVG (unités de france.json, 1 unité = 1 km)."""
    x, y = g.lambert93(lon, lat)
    return round(x / 1000 - x_min, 1), round(y_max - y / 1000, 1)


def recuperer():
    import wiki_lib as w
    for essai in range(4):
        try:
            brut = w.sparql(REQUETE)
            break
        except Exception as e:  # limite de débit ou délai dépassé : on réessaie
            if essai == 3:
                raise
            print(f"Wikidata : essai {essai + 1} échoué ({e}), nouvelle tentative…", file=sys.stderr)
            time.sleep(6)
    lignes = []
    for b in brut:
        lon, lat = lire_point(b["coord"]["value"])
        lignes.append({"qid": b["c"]["value"].rsplit("/", 1)[1], "nom": b["cLabel"]["value"],
                       "population": int(float(b["pop"]["value"])), "lon": round(lon, 4), "lat": round(lat, 4)})
    return lignes


def ecrire_source():
    villes = selectionner(recuperer())
    sortie = {
        "revu": REVU,
        "sources": [{"titre": "Wikidata : population et coordonnées des communes (CC0)", "url": "https://www.wikidata.org/wiki/Q484170"}],
        "regle": f"communes de métropole de plus de {SEUIL} habitants, hors communes à moins de {DISTANCE_MIN_KM} km d'une commune plus peuplée",
        "villes": villes,
    }
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    SOURCE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    return villes


def construire():
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = bg.charger("departements-avec-outre-mer.geojson")["features"]
    x_min, y_max = origine(geo)
    metro = {f["properties"]["code"]: f["geometry"] for f in geo if f["properties"]["code"] not in bg.DROM}
    noms = {d["code"]: d["nom"] for d in bg.charger("geo_departements.json")}
    villes = []
    for v in src["villes"]:
        dep = next((c for c, gm in metro.items() if g.point_dans_geometrie((v["lon"], v["lat"]), gm)), None)
        if dep is None:
            raise SystemExit(f"{v['nom']} : aucun département ne contient le point ({v['lon']}, {v['lat']})")
        x, y = projeter(v["lon"], v["lat"], x_min, y_max)
        villes.append({"id": v["qid"], "nom": v["nom"], "population": v["population"], "departement": dep, "departement_nom": noms[dep], "x": x, "y": y})
    sortie = {"revu": src["revu"], "sources": src["sources"], "villes": villes}
    CIBLE.parent.mkdir(parents=True, exist_ok=True)
    CIBLE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    return villes


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--fetch" in sys.argv:
        v = ecrire_source()
        print(f"{len(v)} villes écrites dans {SOURCE.relative_to(RACINE)}")
    v = construire()
    print(f"{len(v)} villes publiées dans {CIBLE.relative_to(RACINE)} : " + ", ".join(x["nom"] for x in v))
