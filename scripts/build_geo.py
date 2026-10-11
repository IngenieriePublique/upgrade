"""Fabrique les données de la phase 4 (Territoires) à partir de data_local/territoires/ (voir fetch_territoires.py).

Sorties :
- content/territoires/{departements,regions,anciennes-regions}.json : faits sourcés (source de vérité lisible) ;
- site/data/territoires/data.json : les mêmes faits, regroupés pour le site ;
- site/data/geo/france.json : tracés SVG précalculés (Lambert-93 pour la métropole, encarts pour l'outre-mer).

Usage : python -I scripts/build_geo.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo_lib as g  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SRC = RACINE / "data_local" / "territoires"
REVU = "2026-10-11"
DROM = {"971": "Guadeloupe", "972": "Martinique", "973": "Guyane", "974": "La Réunion", "976": "Mayotte"}
REGION_DROM = {"971": "01", "972": "02", "973": "03", "974": "04", "976": "06"}  # département -> région (même territoire)
TOLERANCE = 0.8   # unités SVG (1 unité = 1 km en métropole)
MARGE = 8
# Cases d'encart : deux colonnes dans l'océan Atlantique, à gauche des Landes (coordonnées SVG, origine en haut à gauche).
CASE_W, CASE_H = 122, 128
ENCARTS = {"971": (4, 700), "972": (130, 700), "973": (4, 832), "974": (130, 832), "976": (4, 964)}
SOURCE_GEO = {"titre": "Découpage administratif (API geo.api.gouv.fr, INSEE COG, Etalab)", "url": "https://geo.api.gouv.fr/departements"}
SOURCE_PREF = {"titre": "Wikipédia : Liste des préfectures de France (CC BY-SA)", "url": "https://fr.wikipedia.org/wiki/Liste_des_pr%C3%A9fectures_de_France"}
SOURCE_GEOJSON = {"titre": "france-geojson (tracés IGN Admin Express COG 2018, licence ouverte Etalab)", "url": "https://github.com/gregoiredavid/france-geojson"}


def charger(nom):
    return json.loads((SRC / nom).read_text(encoding="utf-8"))


def projeter_geometrie(geom, proj, echelle=1.0, dx=0.0, dy=0.0, x0=0.0, y_haut=0.0):
    """Projette une géométrie lon/lat. proj(lon, lat) -> (x, y) en mètres ; renvoie des polygones d'anneaux de (x, y) SVG.
    SVG x = (x/1000 - x0) * echelle + dx ; SVG y = (y_haut - y/1000) * echelle + dy."""
    polys = []
    for poly in g.polygones(geom):
        anneaux = []
        for r in poly:
            pts = []
            for lon, lat in r:
                x, y = proj(lon, lat)
                pts.append((x / 1000 * echelle + dx - x0 * echelle, (y_haut - y / 1000) * echelle + dy))
            anneaux.append(pts)
        polys.append(anneaux)
    return polys


def simplifier(polys, tol):
    res = []
    for poly in polys:
        sortie = [g.simplifier_anneau(r, tol) for r in poly]
        # Un petit îlot dont l'anneau extérieur devient dégénéré disparaîtrait : on le garde s'il a au moins 4 points.
        if len(sortie[0]) >= 4:
            res.append(sortie)
    return res


def bornes(polys):
    xs = [p[0] for poly in polys for r in poly for p in r]
    ys = [p[1] for poly in polys for r in poly for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def aire_km2(polys):
    return sum(abs(g.aire_anneau(poly[0])) - sum(abs(g.aire_anneau(t)) for t in poly[1:]) for poly in polys)


def centre_svg(polys):
    plus_grand = max(polys, key=lambda poly: abs(g.aire_anneau(poly[0])))
    geom = {"type": "Polygon", "coordinates": plus_grand}
    return g.point_interieur(geom)


def construire():
    deps_geo = charger("departements-avec-outre-mer.geojson")["features"]
    regs_geo = charger("regions-avec-outre-mer.geojson")["features"]
    anc_geo = charger("regions-avant-redecoupage-2015.geojson")["features"]
    noms_dep = {d["code"]: d for d in charger("geo_departements.json")}
    noms_reg = {r["code"]: r["nom"] for r in charger("geo_regions.json")}
    pref = g.lire_prefectures(charger("prefectures_wikitext.json")["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"])
    wd_dep, wd_reg = charger("wikidata_departements.json"), charger("wikidata_regions.json")
    extraits = charger("wikipedia_extraits.json")

    geoms_dep = {f["properties"]["code"]: f["geometry"] for f in deps_geo}
    geoms_reg = {f["properties"]["code"]: f["geometry"] for f in regs_geo}
    assert set(geoms_dep) == set(noms_dep), "départements du tracé et de l'API différents"

    # --- Projection et cadrage de la métropole
    metro_dep = {c: gm for c, gm in geoms_dep.items() if c not in DROM}
    # Cadrage : x en km depuis le bord ouest, y en km depuis le bord nord (l'axe vertical est retourné pour le SVG).
    xs = [g.lambert93(lon, lat)[0] / 1000 for gm in metro_dep.values() for r in g.anneaux(gm) for lon, lat in r]
    ys = [g.lambert93(lon, lat)[1] / 1000 for gm in metro_dep.values() for r in g.anneaux(gm) for lon, lat in r]
    X_MIN, Y_MAX = min(xs) - MARGE, max(ys) + MARGE

    def proj_metro(geom, tol=TOLERANCE):
        return simplifier(projeter_geometrie(geom, g.lambert93, x0=X_MIN, y_haut=Y_MAX), tol)

    largeur = math.ceil(max(xs) + MARGE - X_MIN)
    hauteur = math.ceil(Y_MAX - (min(ys) - MARGE))

    france = {"viewBox": f"0 0 {largeur} {hauteur}", "departements": {}, "regions": {}, "anciennes": {}, "cadres": []}

    def ajouter(cible, code, polys):
        france[cible][code] = {"d": g.chemin_svg(polys), "c": [round(v) for v in centre_svg(polys)]}

    aires = {}
    for code, gm in metro_dep.items():
        polys = proj_metro(gm)
        aires[code] = aire_km2(polys)
        ajouter("departements", code, polys)

    # --- Encarts d'outre-mer : projection locale, mise à l'échelle dans une case
    def encart(geom, case):
        cx = sum(p[0] for r in g.anneaux(geom) for p in r) / sum(len(r) for r in g.anneaux(geom))
        cy = sum(p[1] for r in g.anneaux(geom) for p in r) / sum(len(r) for r in g.anneaux(geom))
        proj = g.locale(cx, cy)
        brutes = projeter_geometrie(geom, proj, y_haut=0)
        bx0, by0, bx1, by1 = bornes(brutes)
        ech = min((CASE_W - 8) / (bx1 - bx0), (CASE_H - 22) / (by1 - by0), 1.6)
        ox = case[0] + 4 + ((CASE_W - 8) - (bx1 - bx0) * ech) / 2
        oy = case[1] + 4 + ((CASE_H - 22) - (by1 - by0) * ech) / 2
        return simplifier(projeter_geometrie(geom, proj, echelle=ech, dx=ox, dy=oy, x0=bx0, y_haut=by1), TOLERANCE), ech

    echelles = {}
    for code, case in ENCARTS.items():
        polys, ech = encart(geoms_dep[code], case)
        aires[code] = aire_km2(polys) / (ech * ech)
        echelles[code] = ech
        ajouter("departements", code, polys)
        france["cadres"].append({"code": code, "nom": DROM[code], "x": case[0], "y": case[1], "w": CASE_W, "h": CASE_H})

    # --- Régions et anciennes régions (mêmes transformations)
    for code, gm in geoms_reg.items():
        dep_code = next((d for d, r in REGION_DROM.items() if r == code), None)
        if dep_code:
            polys, _ = encart(geoms_dep[dep_code], ENCARTS[dep_code])
        else:
            polys = proj_metro(gm)
        ajouter("regions", code, polys)
    for f in anc_geo:
        ajouter("anciennes", f["properties"]["code"], proj_metro(f["geometry"]))

    # --- Voisinage (sur les tracés non simplifiés)
    vois = g.voisins(geoms_dep)

    # --- Faits sur les départements
    deps = []
    for code in sorted(noms_dep, key=lambda c: (len(c) > 2, c)):
        nd, p, wd = noms_dep[code], pref[code], wd_dep[code]
        art = wd["article"]
        intro = extraits.get(art, {}).get("texte", "")
        sup = wd["superficie_km2"] if code != "69" else None  # l'élément Wikidata du Rhône exclut la métropole de Lyon
        deps.append({
            "code": code, "nom": nd["nom"], "region": nd["codeRegion"], "outre_mer": code in DROM,
            "prefecture": p["prefecture"], "prefecture_region": p["prefecture_region"], "sous_prefectures": p["sous_prefectures"],
            "voisins": sorted(vois[code]),
            "population": {"valeur": wd["pop"], "annee": int(wd["pop_date"][:4])},
            "superficie_km2": sup,
            "article": art, "intro": intro,
            "sources": [
                {"titre": f"Wikipédia : {art}", "url": "https://fr.wikipedia.org/wiki/" + art.replace(" ", "_")},
                {"titre": "Wikidata : population et superficie", "url": "https://www.wikidata.org/wiki/" + wd["qid"]},
                SOURCE_PREF, SOURCE_GEO, SOURCE_GEOJSON],
            "revu": REVU,
        })
    par_code = {d["code"]: d for d in deps}

    # --- Régions
    regs = []
    for code in sorted(noms_reg):
        deps_reg = [d["code"] for d in deps if d["region"] == code]
        chef = next((par_code[c]["prefecture"] for c in deps_reg if par_code[c]["prefecture_region"]), None)
        wd = wd_reg[code]
        art = wd["article"]
        regs.append({
            "code": code, "nom": noms_reg[code], "departements": deps_reg, "prefecture": chef, "outre_mer": any(par_code[c]["outre_mer"] for c in deps_reg),
            "population": {"valeur": wd["pop"], "annee": int(wd["pop_date"][:4])},
            "superficie_km2": wd["superficie_km2"],
            "article": art, "intro": extraits.get(art, {}).get("texte", ""),
            "sources": [
                {"titre": f"Wikipédia : {art}", "url": "https://fr.wikipedia.org/wiki/" + art.replace(" ", "_")},
                {"titre": "Wikidata : population et superficie", "url": "https://www.wikidata.org/wiki/" + wd["qid"]},
                SOURCE_PREF, SOURCE_GEO],
            "revu": REVU,
        })

    # --- Anciennes régions (avant 2016) -> région actuelle, d'après les départements dont le point intérieur est dedans
    anciennes = []
    for f in anc_geo:
        ac, an = f["properties"]["code"], f["properties"]["nom"]
        regions_vues = {}
        for d in deps:
            if d["outre_mer"]:
                continue
            if g.point_dans_geometrie(g.point_interieur(metro_dep[d["code"]]), f["geometry"]):
                regions_vues[d["region"]] = regions_vues.get(d["region"], 0) + 1
        actuelle = max(regions_vues, key=regions_vues.get)
        anciennes.append({"code": ac, "nom": an, "region_actuelle": actuelle, "departements": sorted(
            d["code"] for d in deps if not d["outre_mer"] and g.point_dans_geometrie(g.point_interieur(metro_dep[d["code"]]), f["geometry"])),
            "sources": [SOURCE_GEOJSON, {"titre": "Wikipédia : Région française (anciennes régions)", "url": "https://fr.wikipedia.org/wiki/R%C3%A9gion_fran%C3%A7aise"}],
            "revu": REVU})
    return deps, regs, anciennes, france, aires


def verifier(deps, regs, anciennes, aires):
    """Contrôles de cohérence (lève AssertionError)."""
    assert len(deps) == 101 and len(regs) == 18, (len(deps), len(regs))
    assert all(d["intro"] for d in deps + regs), "introduction Wikipédia manquante"
    assert sum(1 for d in deps if d["prefecture_region"]) == 18
    assert all(r["prefecture"] for r in regs)
    for d in deps:
        for v in d["voisins"]:
            assert d["code"] in next(x for x in deps if x["code"] == v)["voisins"], "voisinage non symétrique"
        # Superficie du tracé simplifié proche de la valeur officielle (hors Rhône dont le tracé inclut la métropole de Lyon).
        if d["superficie_km2"] and d["code"] not in ("69",):
            ecart = abs(aires[d["code"]] - d["superficie_km2"]) / d["superficie_km2"]
            assert ecart < 0.12, f"{d['code']} {d['nom']} : tracé {aires[d['code']]:.0f} km² contre {d['superficie_km2']:.0f}"
    assert len(anciennes) == 22


def ecrire(chemin, obj):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"{chemin.relative_to(RACINE)} : {chemin.stat().st_size / 1024:.0f} Ko")


def main():
    deps, regs, anc, france, aires = construire()
    verifier(deps, regs, anc, aires)
    for nom, obj in (("departements", deps), ("regions", regs), ("anciennes-regions", anc)):
        chemin = RACINE / "content" / "territoires" / f"{nom}.json"
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    ecrire(RACINE / "site" / "data" / "territoires" / "data.json", {"revu": REVU, "departements": deps, "regions": regs, "anciennes": anc})
    ecrire(RACINE / "site" / "data" / "geo" / "france.json", france)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
