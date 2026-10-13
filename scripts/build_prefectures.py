"""Position des préfectures sur la carte, pour les pins de l'écran de révision de First Upgrade.

Deux étapes :
- `python -I scripts/build_prefectures.py --fetch` interroge Wikidata (chef-lieu, propriété P36, et coordonnées de chaque
  département) et écrit content/territoires/prefectures.json (versionné) ; le nom de la commune doit être celui de la préfecture
  déjà publiée dans content/territoires/departements.json, sinon le script s'arrête ;
- `python -I scripts/build_prefectures.py` projette ces points dans le repère de la carte (Lambert-93 pour la métropole, même
  repère local que les encarts pour l'outre-mer, voir build_geo.py et build_villes.py ; besoin de data_local/territoires/) et écrit
  site/data/territoires/prefectures.json.
"""
import json
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo_lib as g  # noqa: E402
import build_geo as bg  # noqa: E402
import build_villes as bv  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "territoires" / "prefectures.json"
CIBLE = RACINE / "site" / "data" / "territoires" / "prefectures.json"
DEPARTEMENTS = RACINE / "content" / "territoires" / "departements.json"
REVU = "2026-10-12"
# Départements dont l'élément Wikidata n'a pas de chef-lieu (P36) : la commune est désignée directement (Paris : Q90).
COMMUNES_EXPLICITES = {"75": "Q90"}


def normaliser(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if c.isalnum())


def projeter_encart(lon, lat, geom, case):
    """Même transformation que build_geo.construire.encart, pour un point."""
    anneaux = g.anneaux(geom)
    n = sum(len(r) for r in anneaux)
    cx = sum(p[0] for r in anneaux for p in r) / n
    cy = sum(p[1] for r in anneaux for p in r) / n
    proj = g.locale(cx, cy)
    brutes = bg.projeter_geometrie(geom, proj, y_haut=0)
    bx0, by0, bx1, by1 = bg.bornes(brutes)
    ech = min((bg.CASE_W - 8) / (bx1 - bx0), (bg.CASE_H - 22) / (by1 - by0), 1.6)
    ox = case[0] + 4 + ((bg.CASE_W - 8) - (bx1 - bx0) * ech) / 2
    oy = case[1] + 4 + ((bg.CASE_H - 22) - (by1 - by0) * ech) / 2
    x, y = proj(lon, lat)
    return round(x / 1000 * ech + ox - bx0 * ech, 1), round((by1 - y / 1000) * ech + oy, 1)


def recuperer(departements):
    import wiki_lib as w
    qids = {json.loads((RACINE / "data_local" / "territoires" / "wikidata_departements.json").read_text(encoding="utf-8"))[d["code"]]["qid"]: d for d in departements}
    valeurs = " ".join(f"wd:{q}" for q in qids)
    requete = f"""SELECT ?d ?c ?cLabel ?coord WHERE {{
 VALUES ?d {{ {valeurs} }}
 ?d wdt:P36 ?c. ?c wdt:P625 ?coord.
 SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr". }} }}"""
    for essai in range(4):
        try:
            brut = w.sparql(requete)
            break
        except Exception as e:  # limite de débit ou délai dépassé
            if essai == 3:
                raise
            print(f"Wikidata : essai {essai + 1} échoué ({e})", file=sys.stderr)
            time.sleep(6)
    trouves = {}
    for b in brut:
        dep = qids[b["d"]["value"].rsplit("/", 1)[1]]
        if normaliser(b["cLabel"]["value"]) != normaliser(dep["prefecture"]):
            continue  # un autre chef-lieu historique : on ne garde que la préfecture
        lon, lat = bv.lire_point(b["coord"]["value"])
        trouves[dep["code"]] = {"code": dep["code"], "nom": dep["prefecture"], "qid": b["c"]["value"].rsplit("/", 1)[1],
                                "lon": round(lon, 4), "lat": round(lat, 4)}
    for code, qid in COMMUNES_EXPLICITES.items():
        if code in trouves:
            continue
        dep = next(d for d in departements if d["code"] == code)
        ligne = w.sparql(f"SELECT ?coord WHERE {{ wd:{qid} wdt:P625 ?coord. }}")
        lon, lat = bv.lire_point(ligne[0]["coord"]["value"])
        trouves[code] = {"code": code, "nom": dep["prefecture"], "qid": qid, "lon": round(lon, 4), "lat": round(lat, 4)}
    manquants = [d["code"] for d in departements if d["code"] not in trouves]
    if manquants:
        raise SystemExit(f"préfectures introuvables sur Wikidata (ou nom différent) : {manquants}")
    return [trouves[d["code"]] for d in departements]


def ecrire_source():
    deps = json.loads(DEPARTEMENTS.read_text(encoding="utf-8"))
    pref = recuperer(deps)
    SOURCE.write_text(json.dumps({
        "revu": REVU,
        "sources": [{"titre": "Wikidata : chef-lieu (P36) et coordonnées de chaque département (CC0)", "url": "https://www.wikidata.org/wiki/Property:P36"}],
        "prefectures": pref}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    return pref


def construire():
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    geo = bg.charger("departements-avec-outre-mer.geojson")["features"]
    x_min, y_max = bv.origine(geo)
    geoms = {f["properties"]["code"]: f["geometry"] for f in geo}
    sortie = {}
    for p in src["prefectures"]:
        if p["code"] in bg.DROM:
            x, y = projeter_encart(p["lon"], p["lat"], geoms[p["code"]], bg.ENCARTS[p["code"]])
        else:
            if not g.point_dans_geometrie((p["lon"], p["lat"]), geoms[p["code"]]):
                raise SystemExit(f"{p['nom']} : le point n'est pas dans son département ({p['code']})")
            x, y = bv.projeter(p["lon"], p["lat"], x_min, y_max)
        sortie[p["code"]] = {"nom": p["nom"], "x": x, "y": y}
    CIBLE.write_text(json.dumps({"revu": src["revu"], "sources": src["sources"], "prefectures": sortie}, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8", newline="\n")
    return sortie


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--fetch" in sys.argv:
        print(f"{len(ecrire_source())} préfectures écrites dans {SOURCE.relative_to(RACINE)}")
    print(f"{len(construire())} préfectures publiées dans {CIBLE.relative_to(RACINE)}")
