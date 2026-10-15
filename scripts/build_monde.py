"""Pays et capitales du monde pour le jeu des territoires de First Upgrade, et mini-carte du monde de l'outre-mer.

Deux étapes :
- `python -I scripts/build_monde.py --fetch` télécharge les contours Natural Earth (domaine public) dans data_local/monde/
  (hors dépôt), interroge Wikidata (États membres de l'ONU, capitale P36, coordonnées) et écrit la sélection lisible dans
  content/territoires/pays.json (versionné) ;
- `python -I scripts/build_monde.py` projette les contours (projection azimutale équivalente de Lambert centrée sur chaque
  continent, découpée à sa fenêtre), simplifie, et écrit site/data/geo/monde-<continent>.json, site/data/geo/monde-om.json
  (carte du monde centrée sur les territoires français) et site/data/territoires/pays.json.

Règle de sélection : les 193 États membres de l'ONU (le Vatican, Taïwan, le Kosovo et la Palestine ne sont pas des éléments du
jeu ; leurs contours restent dessinés en contexte). Un pays transcontinental est rangé dans un seul continent : Russie en Europe,
Chypre en Europe, Turquie, Géorgie, Arménie, Azerbaïdjan et Kazakhstan en Asie, Égypte en Afrique.
"""
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo_lib as g  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
LOCAL = RACINE / "data_local" / "monde"
SOURCE = RACINE / "content" / "territoires" / "pays.json"
CIBLE = RACINE / "site" / "data" / "territoires" / "pays.json"
GEO = RACINE / "site" / "data" / "geo"
PREFECTURES = RACINE / "content" / "territoires" / "prefectures.json"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}
REVU = "2026-10-14"

LARGEUR = 1000.0   # largeur du viewBox de chaque carte
RAYON = 5.0        # rayon (unités du viewBox) de la pastille d'un pays trop petit pour être cliqué
TOLERANCE = 0.45   # simplification des traces (unités du viewBox)

# Continents : centre de la projection (lon, lat) et fenêtre affichée (lon min, lat min, lon max, lat max).
CONTINENTS = [
    {"code": "europe", "nom": "Europe", "centre": (14, 54), "fenetre": (-25, 34, 47, 71.5)},
    {"code": "asie", "nom": "Asie", "centre": (88, 30), "fenetre": (26, -11.5, 146, 56)},
    {"code": "afrique", "nom": "Afrique", "centre": (18, 3), "fenetre": (-26, -36, 60, 38)},
    {"code": "amerique-nord", "nom": "Amérique du Nord et centrale", "centre": (-100, 40), "fenetre": (-135, 6, -55, 72)},
    {"code": "caraibes", "nom": "Caraïbes", "centre": (-72, 18), "fenetre": (-87, 8.5, -58, 28.5)},
    {"code": "amerique-sud", "nom": "Amérique du Sud", "centre": (-60, -20), "fenetre": (-83, -57, -33, 13.5)},
    {"code": "oceanie", "nom": "Océanie", "centre": (150, -15), "fenetre": (110, -48, 190, 14)},
]
CODES_CONTINENTS = [c["code"] for c in CONTINENTS]

# Rattachement à un continent d'après Natural Earth (CONTINENT, SUBREGION), avec exceptions.
EXCEPTIONS_CONTINENT = {"CY": "europe", "MV": "asie", "MU": "afrique", "SC": "afrique"}
HORS_JEU = {"TW", "VA"}  # Taïwan et le Vatican (Wikidata les rattache à l'ONU ou non selon l'époque) : contexte seulement

# Noms français : ceux de Natural Earth, sauf ces corrections d'usage.
NOMS = {"CN": "Chine", "VA": "Vatican"}
# Article français du nom du pays (« la France », « le Japon », « l'Italie », « les Bahamas », « » pour Cuba, Malte…) : sert aux
# consignes (« Clique sur la France », « capitale du Japon »).
ARTICLES = {}
for art, codes in {
    "le": "DK LI LU ME PT GB BD BT KH JP KZ KG KW LA LB NP PK QA LK TJ TL TM VN YE BJ BW BF BI CM CV GA GH KE LS LR MW ML MA MZ NE NG RW SN SD SS TD TG ZW "
          "CA MX BZ CR SV GT HN NI PA BR CL GY PY PE SR VE VU",
    "la": "BE BY BA BG HR FI FR GR HU LV LT MK MD NO PL RO RU RS SK SI CH SE CZ MM CN KR KP GE JO MY MN SY TH TR CF CG CD CI GM GN GW GQ LY MR NA SL SO TZ TN ZM "
          "BB DM GD JM DO BO CO NZ PG",
    "l'": "DE AL AD AT ES EE IE IS IT UA AF SA AM AZ IN ID IQ IR UZ ZA DZ AO EG ER SZ ET UG AR EC UY AU",
    "les": "NL AE MV PH KM SC US BS FJ MH FM PW SB",
    "": "CY MT MC SM BH BN IL OM SG DJ MG MU ST AG CU HT KN VC LC TT KI NR WS TO TV",
}.items():
    for code in codes.split():
        ARTICLES[code] = art

# Capitales : plusieurs valeurs actuelles dans Wikidata -> celle qu'on retient ; libellés corrigés ; notes d'explication.
CAPITALE_RETENUE = {"BO": "Sucre", "ZA": "Pretoria", "MY": "Kuala Lumpur", "SZ": "Mbabane", "YE": "Sanaa", "IL": "Jérusalem",
                    "NL": "Amsterdam", "LK": "Sri Jayawardenapura", "BJ": "Porto-Novo", "ID": "Jakarta"}
CAPITALE_AFFICHEE = {"NO": "Oslo", "PY": "Asunción", "LK": "Sri Jayawardenapura Kotte"}
NOTES = {
    "BO": "Sucre est la capitale constitutionnelle ; La Paz est la capitale administrative, siège du gouvernement.",
    "ZA": "Pretoria est la capitale administrative ; Le Cap est la capitale législative et Bloemfontein la capitale judiciaire.",
    "NL": "Amsterdam est la capitale ; le gouvernement siège à La Haye.",
    "BJ": "Porto-Novo est la capitale ; le gouvernement siège à Cotonou.",
    "CI": "Yamoussoukro est la capitale politique ; Abidjan reste la capitale économique.",
    "BI": "Gitega est la capitale politique depuis 2019 ; Bujumbura reste la capitale économique.",
    "TZ": "Dodoma est la capitale ; Dar es Salam est la plus grande ville.",
    "LK": "Sri Jayawardenapura Kotte est la capitale législative ; Colombo est la capitale économique.",
    "MY": "Kuala Lumpur est la capitale ; l'administration fédérale siège à Putrajaya.",
    "SZ": "Mbabane est la capitale administrative ; Lobamba est la capitale législative et royale.",
    "YE": "Sanaa est la capitale ; Aden est le siège du gouvernement reconnu.",
    "IL": "Jérusalem est proclamée capitale par Israël ; la plupart des États ont leur ambassade à Tel Aviv.",
    "GQ": "Ciudad de la Paz depuis janvier 2026 ; Malabo est l'ancienne capitale.",
    "ID": "Jakarta est la capitale ; Nusantara est en construction.",
    "NR": "Nauru n'a pas de capitale officielle ; le gouvernement siège à Yaren.",
    "MM": "Naypyidaw est la capitale depuis 2006 ; Rangoun est l'ancienne capitale.",
}

REQUETE = """SELECT ?c ?cLabel ?iso ?cap ?capLabel ?coord ?rank WHERE {
 { ?c wdt:P463 wd:Q1065 } UNION { VALUES ?c { wd:Q218 wd:Q35 } }
 ?c wdt:P297 ?iso .
 ?c p:P36 ?st . ?st ps:P36 ?cap . ?st wikibase:rank ?rank .
 FILTER NOT EXISTS { ?st pq:P582 ?fin }
 OPTIONAL { ?cap wdt:P625 ?coord }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
}"""


# --- Projections ------------------------------------------------------------------------------------------

def azimutale(lon0, lat0):
    """Projection azimutale équivalente de Lambert centrée sur (lon0, lat0) : (lon, lat) -> (x, y) en km, y vers le nord."""
    p0, l0 = math.radians(lat0), math.radians(lon0)
    sp0, cp0 = math.sin(p0), math.cos(p0)

    def proj(lon, lat):
        p, dl = math.radians(lat), math.radians(lon) - l0
        k = math.sqrt(2 / (1 + sp0 * math.sin(p) + cp0 * math.cos(p) * math.cos(dl)))
        return 6371.0 * k * math.cos(p) * math.sin(dl), 6371.0 * k * (cp0 * math.sin(p) - sp0 * math.cos(p) * math.cos(dl))
    return proj


def equirectangulaire(lat_ref):
    k = math.cos(math.radians(lat_ref))
    return lambda lon, lat: (lon * k, lat)


def echantillon_fenetre(fenetre, pas=1.0):
    """Points du pourtour d'une fenêtre (lon min, lat min, lon max, lat max)."""
    lo0, la0, lo1, la1 = fenetre
    pts = []
    n = int((lo1 - lo0) / pas) + 1
    for i in range(n + 1):
        lon = lo0 + (lo1 - lo0) * i / n
        pts += [(lon, la0), (lon, la1)]
    m = int((la1 - la0) / pas) + 1
    for i in range(m + 1):
        lat = la0 + (la1 - la0) * i / m
        pts += [(lo0, lat), (lo1, lat)]
    return pts


def vue(proj, fenetre):
    """(x_min, y_max, échelle, hauteur) : transformation du plan de la projection (km, y vers le nord) vers le viewBox."""
    xy = [proj(lon, lat) for lon, lat in echantillon_fenetre(fenetre)]
    x0, x1 = min(x for x, _ in xy), max(x for x, _ in xy)
    y0, y1 = min(y for _, y in xy), max(y for _, y in xy)
    ech = LARGEUR / (x1 - x0)
    return x0, y1, ech, (y1 - y0) * ech


# --- Géométrie : découpe et simplification ----------------------------------------------------------------

def decouper(pts, x0, y0, x1, y1):
    """Découpe un anneau par un rectangle (Sutherland-Hodgman)."""
    def sur(cote, p):
        return (p[0] >= x0, p[0] <= x1, p[1] >= y0, p[1] <= y1)[cote]

    def coupe(cote, a, b):
        if cote < 2:
            x = x0 if cote == 0 else x1
            return x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
        y = y0 if cote == 2 else y1
        return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y

    for cote in range(4):
        if not pts:
            break
        sortie = []
        prec = pts[-1]
        for p in pts:
            if sur(cote, p):
                if not sur(cote, prec):
                    sortie.append(coupe(cote, prec, p))
                sortie.append(p)
            elif sur(cote, prec):
                sortie.append(coupe(cote, prec, p))
            prec = p
        pts = sortie
    return pts


def taille(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return max(max(xs) - min(xs), max(ys) - min(ys))


def projeter_polygones(geometries, proj, transf, cadre):
    """geometries : GeoJSON d'un pays. Renvoie les polygones découpés au cadre, en unités du viewBox : [[anneau, trous…], …]."""
    x_min, y_max, ech = transf
    x0, y0, x1, y1 = cadre
    res = []
    for geom in geometries:
        for poly in g.polygones(geom):
            anneaux = []
            for i, r in enumerate(poly):
                pts = []
                for lon, lat in r:
                    x, y = proj(lon, lat)
                    pts.append(((x - x_min) * ech, (y_max - y) * ech))
                c = decouper(pts[:-1] if pts and pts[0] == pts[-1] else pts, x0, y0, x1, y1)
                if len(c) < 3:
                    if i == 0:
                        break
                    continue
                anneaux.append(c)
            if anneaux:
                res.append(anneaux)
    return res


def simplifier(polys, tol, garder_le_plus_grand=False):
    res = []
    for poly in polys:
        ext = poly[0]
        if taille(ext) < 0.6 and not (garder_le_plus_grand and poly is max(polys, key=lambda p: taille(p[0]))):
            continue
        anneaux = []
        for r in poly:
            s = g.simplifier_anneau(r + [r[0]], tol)
            if len(s) >= 4:
                anneaux.append(s)
        if anneaux:
            res.append(anneaux)
    return res


def centre_etiquette(polys):
    """Point à l'intérieur du plus grand polygone visible (pour y poser un nom)."""
    plus_grand = max(polys, key=lambda p: abs(g.aire_anneau(p[0])))
    x, y = g.point_interieur({"type": "Polygon", "coordinates": [[list(p) for p in plus_grand[0]]]})
    return [round(x, 1), round(y, 1)]


# --- Natural Earth et Wikidata ----------------------------------------------------------------------------

def telecharger(nom):
    LOCAL.mkdir(parents=True, exist_ok=True)
    chemin = LOCAL / nom
    if not chemin.exists():
        req = urllib.request.Request(NE + nom, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r:
            chemin.write_bytes(r.read())
        print(f"+ {nom}")
    return chemin


def charger_ne(nom):
    """Pays de Natural Earth fusionnés par code ISO : { code: {"props": {...}, "geoms": [géométries]} }."""
    pays = {}
    for f in json.loads((LOCAL / nom).read_text(encoding="utf-8"))["features"]:
        p = f["properties"]
        code = p["ISO_A2_EH"] if p["ISO_A2_EH"] not in ("-99", "") else "x-" + p["ADM0_A3"]
        e = pays.setdefault(code, {"props": p, "geoms": []})
        if p["POP_EST"] > e["props"]["POP_EST"]:
            e["props"] = p
        e["geoms"].append(f["geometry"])
    return pays


def continent_de(code, props):
    if code in EXCEPTIONS_CONTINENT:
        return EXCEPTIONS_CONTINENT[code]
    c, sous = props["CONTINENT"], props["SUBREGION"]
    if c == "Europe":
        return "europe"
    if c == "Asia":
        return "asie"
    if c == "Africa":
        return "afrique"
    if c == "South America":
        return "amerique-sud"
    if c == "Oceania":
        return "oceanie"
    if c == "North America":
        return "caraibes" if sous == "Caribbean" else "amerique-nord"
    raise ValueError(f"continent inconnu pour {code} : {c}")


def lire_point(wkt):
    lon, lat = wkt[wkt.index("(") + 1:wkt.index(")")].split()
    return float(lon), float(lat)


def choisir_capitale(code, lignes):
    """lignes : lignes SPARQL d'un pays -> (libellé, qid, lon, lat). Écarte les valeurs dépréciées, puis départage."""
    valides = [r for r in lignes if not r["rank"]["value"].endswith("DeprecatedRank")]
    preferees = [r for r in valides if r["rank"]["value"].endswith("PreferredRank")]
    if preferees:
        valides = preferees
    par_nom = {}
    for r in valides:
        par_nom.setdefault(r["capLabel"]["value"], r)
    if len(par_nom) > 1:
        voulu = CAPITALE_RETENUE.get(code)
        if voulu not in par_nom:
            raise SystemExit(f"{code} : plusieurs capitales dans Wikidata ({', '.join(par_nom)}), à départager dans CAPITALE_RETENUE")
        par_nom = {voulu: par_nom[voulu]}
    nom, r = next(iter(par_nom.items()))
    if code in CAPITALE_RETENUE and nom != CAPITALE_RETENUE[code]:
        raise SystemExit(f"{code} : la capitale retenue ({CAPITALE_RETENUE[code]}) n'est plus celle de Wikidata ({nom})")
    if "coord" not in r:
        raise SystemExit(f"{code} : pas de coordonnées pour {nom}")
    lon, lat = lire_point(r["coord"]["value"])
    return CAPITALE_AFFICHEE.get(code, nom), r["cap"]["value"].rsplit("/", 1)[1], round(lon, 4), round(lat, 4)


def recuperer():
    import wiki_lib as w
    for essai in range(4):
        try:
            return w.sparql(REQUETE)
        except Exception as e:  # limite de débit ou délai dépassé : on réessaie
            if essai == 3:
                raise
            print(f"Wikidata : essai {essai + 1} échoué ({e}), nouvelle tentative…", file=sys.stderr)
            time.sleep(6)


def ecrire_source():
    telecharger("ne_50m_admin_0_countries.geojson")
    telecharger("ne_110m_admin_0_countries.geojson")
    ne = charger_ne("ne_50m_admin_0_countries.geojson")
    par_pays = {}
    for r in recuperer():
        par_pays.setdefault(r["iso"]["value"], []).append(r)
    pays = []
    for code, lignes in sorted(par_pays.items()):
        if code in HORS_JEU or code not in ne:
            continue  # États disparus (RDA, Yougoslavie), Taïwan, Vatican
        props = ne[code]["props"]
        capitale, qid_cap, lon, lat = choisir_capitale(code, lignes)
        if code not in ARTICLES:
            raise SystemExit(f"{code} ({props['NAME_FR']}) : article absent de ARTICLES")
        e = {"id": code, "qid": lignes[0]["c"]["value"].rsplit("/", 1)[1], "nom": NOMS.get(code, props["NAME_FR"]), "article": ARTICLES[code], "continent": continent_de(code, props),
             "capitale": capitale, "capitale_qid": qid_cap, "lon": lon, "lat": lat}
        if code in NOTES:
            e["note"] = NOTES[code]
        pays.append(e)
    pays.sort(key=lambda p: (CODES_CONTINENTS.index(p["continent"]), p["nom"]))
    sortie = {
        "revu": REVU,
        "sources": [
            {"titre": "Wikidata : États membres de l'ONU, capitale (P36) et coordonnées (CC0)", "url": "https://www.wikidata.org/wiki/Property:P36"},
            {"titre": "Natural Earth : contours des pays (domaine public) et noms français", "url": "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/"},
            {"titre": "Wikipédia : notes sur les pays à plusieurs capitales (CC BY-SA)", "url": "https://fr.wikipedia.org/wiki/Liste_des_capitales_du_monde"},
        ],
        "regle": "193 États membres de l'ONU ; un pays transcontinental est rangé dans un seul continent (Russie et Chypre en Europe, Turquie, Géorgie, Arménie, Azerbaïdjan et Kazakhstan en Asie)",
        "pays": pays,
    }
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    SOURCE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    return pays


# --- Construction -----------------------------------------------------------------------------------------

def ecrire_json(chemin, objet, compact=False):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    texte = json.dumps(objet, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(objet, ensure_ascii=False, indent=1)
    chemin.write_text(texte + "\n", encoding="utf-8", newline="\n")


def construire_continent(cont, items, ne):
    proj = azimutale(*cont["centre"])
    x_min, y_max, ech, hauteur = vue(proj, cont["fenetre"])
    marge = 4.0
    cadre = (-marge, -marge, LARGEUR + marge, hauteur + marge)
    sortie = {}
    for code, e in ne.items():
        polys = projeter_polygones(e["geoms"], proj, (x_min, y_max, ech), cadre)
        if not polys:
            continue
        est_item = code in items
        simples = simplifier(polys, TOLERANCE, garder_le_plus_grand=est_item)
        if not simples:
            continue
        fiche = {"d": g.chemin_svg(simples)}
        if est_item:
            fiche["c"] = centre_etiquette(simples)
            if taille(max(simples, key=lambda p: taille(p[0]))[0]) < 2 * RAYON:
                fiche["petit"] = 1
        sortie[code] = fiche
    pays_du_continent = {c: e for c, e in items.items() if e["continent"] == cont["code"]}
    for code, e in pays_du_continent.items():
        x, y = proj(e["lon"], e["lat"])
        px, py = round((x - x_min) * ech, 1), round((y_max - y) * ech, 1)
        fiche = sortie.setdefault(code, {"d": "", "c": [px, py], "petit": 1})
        fiche["cap"] = [px, py]
        if "c" not in fiche:
            fiche["c"] = [px, py]
    return {"viewBox": f"0 0 {LARGEUR:.0f} {hauteur:.1f}", "rayon": RAYON, "pays": sortie}


def construire_monde_om(ne110, prefectures):
    """Mini-carte du monde, équirectangulaire, centrée sur les territoires français (de la Guyane à Mayotte)."""
    fenetre = (-72, -30, 66, 58)
    proj = equirectangulaire(25)
    x_min, y_max, ech, hauteur = vue(proj, fenetre)
    cadre = (-3, -3, LARGEUR + 3, hauteur + 3)
    pays = {}
    for code, e in ne110.items():
        polys = projeter_polygones(e["geoms"], proj, (x_min, y_max, ech), cadre)
        simples = simplifier(polys, 0.5) if polys else []
        if simples:
            pays[code] = {"d": g.chemin_svg(simples)}
    par_code = {p["code"]: p for p in prefectures}
    marqueurs = []
    for dep, nom in (("971", "Guadeloupe"), ("972", "Martinique"), ("973", "Guyane"), ("974", "La Réunion"), ("976", "Mayotte")):
        p = par_code[dep]
        x, y = proj(p["lon"], p["lat"])
        marqueurs.append({"code": dep, "nom": nom, "x": round((x - x_min) * ech, 1), "y": round((y_max - y) * ech, 1)})
    paris = par_code["75"]
    x, y = proj(paris["lon"], paris["lat"])
    marqueurs.append({"code": "metropole", "nom": "France métropolitaine", "x": round((x - x_min) * ech, 1), "y": round((y_max - y) * ech, 1)})
    return {"viewBox": f"0 0 {LARGEUR:.0f} {hauteur:.1f}", "pays": pays, "marqueurs": marqueurs}


def construire_monde_mini(ne110, items):
    """Planisphère minuscule (équirectangulaire) : un tracé par continent du jeu, pour situer le continent joué."""
    largeur = 360.0
    k = math.cos(math.radians(15))
    fenetre = (-180, -56, 180, 84)  # lon min, lat min, lon max, lat max
    ech = largeur / ((fenetre[2] - fenetre[0]) * k)
    hauteur = (fenetre[3] - fenetre[1]) * ech
    proj = equirectangulaire(15)
    transf = (fenetre[0] * k, fenetre[3], ech)
    cadre = (-1, -1, largeur + 1, hauteur + 1)
    traces = {}
    for code, e in ne110.items():
        if e["props"]["CONTINENT"] == "Antarctica":
            continue
        if code in items:
            cont = items[code]["continent"]
        else:
            try:
                cont = continent_de(code, e["props"])
            except ValueError:
                continue
        polys = projeter_polygones(e["geoms"], proj, transf, cadre)
        simples = simplifier(polys, 0.35) if polys else []
        if simples:
            traces.setdefault(cont, []).append((code, simples))
    continents = {}
    for cont in CODES_CONTINENTS:
        morceaux = traces.get(cont, [])
        # l'étendue d'un continent est celle de ses capitales (les îles absentes du fichier à 110 m comptent aussi)
        pts = [proj(e["lon"], e["lat"]) for e in items.values() if e["continent"] == cont]
        xs = [(x - transf[0]) * ech for x, _ in pts]
        ys = [(transf[1] - y) * ech for _, y in pts]
        continents[cont] = {"d": "".join(g.chemin_svg(s) for _, s in morceaux)}
        if max(max(xs) - min(xs), max(ys) - min(ys)) < 30:  # trop petit pour se voir à cette échelle (Caraïbes) : un cercle le repère
            continents[cont]["repere"] = [round(sum(xs) / len(xs), 1), round(sum(ys) / len(ys), 1)]
    reste = [s for cont, morceaux in traces.items() if cont not in CODES_CONTINENTS for _, s in morceaux]
    return {"viewBox": f"0 0 {largeur:.0f} {hauteur:.1f}", "continents": continents, "autres": "".join(g.chemin_svg(s) for s in reste)}


def construire():
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    items = {p["id"]: p for p in src["pays"]}
    ne = charger_ne("ne_50m_admin_0_countries.geojson")
    ne = {c: e for c, e in ne.items() if e["props"]["CONTINENT"] != "Antarctica"}
    publies = []
    for cont in CONTINENTS:
        geo = construire_continent(cont, items, ne)
        ecrire_json(GEO / f"monde-{cont['code']}.json", geo, compact=True)
        for code, e in items.items():
            if e["continent"] == cont["code"]:
                f = geo["pays"][code]
                publies.append({"id": code, "nom": e["nom"], "article": e["article"], "continent": cont["code"], "capitale": e["capitale"], "note": e.get("note"),
                                "cx": f["c"][0], "cy": f["c"][1], "x": f["cap"][0], "y": f["cap"][1], "petit": bool(f.get("petit"))})
        nb = sum(1 for e in items.values() if e["continent"] == cont["code"])
        print(f"{cont['code']} : {nb} pays, {(GEO / ('monde-' + cont['code'] + '.json')).stat().st_size // 1024} Ko")
    prefs = json.loads(PREFECTURES.read_text(encoding="utf-8"))["prefectures"]
    ne110 = charger_ne("ne_110m_admin_0_countries.geojson")
    ecrire_json(GEO / "monde-om.json", construire_monde_om(ne110, prefs), compact=True)
    ecrire_json(GEO / "monde-mini.json", construire_monde_mini(ne110, items), compact=True)
    sortie = {"revu": src["revu"], "sources": src["sources"], "regle": src["regle"],
              "continents": [{"code": c["code"], "nom": c["nom"]} for c in CONTINENTS], "pays": publies}
    ecrire_json(CIBLE, sortie)
    return publies


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if "--fetch" in sys.argv:
        p = ecrire_source()
        print(f"{len(p)} pays écrits dans {SOURCE.relative_to(RACINE)}")
    elif not (LOCAL / "ne_50m_admin_0_countries.geojson").exists():
        raise SystemExit("contours absents : lancer d'abord `python -I scripts/build_monde.py --fetch`")
    p = construire()
    print(f"{len(p)} pays publiés dans {CIBLE.relative_to(RACINE)}")
