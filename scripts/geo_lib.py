"""Briques de calcul de la phase 4 (Territoires), sans réseau : projection, simplification, tracés SVG,
adjacence des départements, lecture de la liste des préfectures. Importées par build_geo.py et testées
dans tests/test_geo.py.
"""
import math
import re

# --- Projections -----------------------------------------------------------------------------------------

_A = 6378137.0
_F = 1 / 298.257222101
_E2 = 2 * _F - _F * _F
_E = math.sqrt(_E2)


def _m(phi):
    return math.cos(phi) / math.sqrt(1 - _E2 * math.sin(phi) ** 2)


def _t(phi):
    s = _E * math.sin(phi)
    return math.tan(math.pi / 4 - phi / 2) / ((1 - s) / (1 + s)) ** (_E / 2)


_PHI1, _PHI2, _PHI0, _LAM0 = (math.radians(v) for v in (44.0, 49.0, 46.5, 3.0))
_N = (math.log(_m(_PHI1)) - math.log(_m(_PHI2))) / (math.log(_t(_PHI1)) - math.log(_t(_PHI2)))
_FF = _m(_PHI1) / (_N * _t(_PHI1) ** _N)
_RHO0 = _A * _FF * _t(_PHI0) ** _N


def lambert93(lon, lat):
    """Longitude, latitude (degrés, RGF93) -> (x, y) en mètres, projection Lambert-93 (EPSG:2154)."""
    phi, lam = math.radians(lat), math.radians(lon)
    rho = _A * _FF * _t(phi) ** _N
    th = _N * (lam - _LAM0)
    return 700000.0 + rho * math.sin(th), 6600000.0 + _RHO0 - rho * math.cos(th)


def locale(lon0, lat0):
    """Projection équirectangulaire centrée sur (lon0, lat0), en mètres : suffisante pour un encart d'outre-mer."""
    r = 6371000.0
    k = math.cos(math.radians(lat0))

    def proj(lon, lat):
        return math.radians(lon - lon0) * r * k, math.radians(lat - lat0) * r
    return proj


# --- Géométrie --------------------------------------------------------------------------------------------

def anneaux(geometrie):
    """Tous les anneaux (listes de [lon, lat]) d'une géométrie Polygon ou MultiPolygon."""
    if geometrie["type"] == "Polygon":
        polys = [geometrie["coordinates"]]
    elif geometrie["type"] == "MultiPolygon":
        polys = geometrie["coordinates"]
    else:
        raise ValueError(f"type de géométrie non géré : {geometrie['type']}")
    return [r for poly in polys for r in poly]


def polygones(geometrie):
    return [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]


def _dist_seg(p, a, b):
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def douglas_peucker(pts, tol):
    """Simplifie une ligne (liste de (x, y)) ; garde toujours les deux extrémités. Itératif (pas de récursion)."""
    n = len(pts)
    if n < 3:
        return list(pts)
    garde = [False] * n
    garde[0] = garde[-1] = True
    pile = [(0, n - 1)]
    while pile:
        i, j = pile.pop()
        dmax, k = 0.0, -1
        for m in range(i + 1, j):
            d = _dist_seg(pts[m], pts[i], pts[j])
            if d > dmax:
                dmax, k = d, m
        if k != -1 and dmax > tol:
            garde[k] = True
            pile.append((i, k))
            pile.append((k, j))
    return [p for p, g in zip(pts, garde) if g]


def simplifier_anneau(pts, tol):
    """Simplifie un anneau fermé en le coupant en deux au point le plus éloigné du premier ; garde au moins 4 points."""
    pts = pts[:-1] if pts and pts[0] == pts[-1] else list(pts)
    if len(pts) < 4:
        return pts + pts[:1]
    loin = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
    a = douglas_peucker(pts[:loin + 1], tol)
    b = douglas_peucker(pts[loin:] + [pts[0]], tol)
    res = a[:-1] + b
    return res if len(res) >= 4 else pts + pts[:1]


def aire_anneau(pts):
    """Aire signée (formule du lacet)."""
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        s += x1 * y2 - x2 * y1
    return s / 2


def centre(anneau_pts):
    """Barycentre d'un anneau ; repli sur la moyenne des sommets si l'aire est nulle."""
    a = aire_anneau(anneau_pts)
    if abs(a) < 1e-9:
        return (sum(p[0] for p in anneau_pts) / len(anneau_pts), sum(p[1] for p in anneau_pts) / len(anneau_pts))
    cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(anneau_pts, anneau_pts[1:] + anneau_pts[:1]):
        f = x1 * y2 - x2 * y1
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    return cx / (6 * a), cy / (6 * a)


def point_dans_anneau(pt, anneau_pts):
    x, y = pt
    dedans = False
    n = len(anneau_pts)
    for i in range(n):
        (x1, y1), (x2, y2) = anneau_pts[i], anneau_pts[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            dedans = not dedans
    return dedans


def point_dans_geometrie(pt, geometrie):
    for poly in polygones(geometrie):
        if point_dans_anneau(pt, poly[0]) and not any(point_dans_anneau(pt, t) for t in poly[1:]):
            return True
    return False


def point_interieur(geometrie):
    """Un point garanti à l'intérieur : centre du plus grand polygone, sinon sommet décalé vers ce centre."""
    plus_grand = max(polygones(geometrie), key=lambda poly: abs(aire_anneau(poly[0])))
    c = centre(plus_grand[0])
    if point_dans_anneau(c, plus_grand[0]):
        return c
    for p in plus_grand[0]:
        q = ((p[0] + c[0]) / 2, (p[1] + c[1]) / 2)
        if point_dans_anneau(q, plus_grand[0]):
            return q
    return tuple(plus_grand[0][0])


def voisins(entites, min_communs=2, decimales=5):
    """Dict code -> ensemble des codes limitrophes. Deux entités sont voisines si elles partagent au moins
    `min_communs` sommets identiques (les tracés IGN simplifiés par Mapshaper conservent la topologie commune).
    Un seul sommet commun (point de rencontre) ne compte pas."""
    par_sommet = {}
    for code, geom in entites.items():
        for r in anneaux(geom):
            for lon, lat in r:
                par_sommet.setdefault((round(lon, decimales), round(lat, decimales)), set()).add(code)
    paires = {}
    for codes in par_sommet.values():
        if len(codes) < 2:
            continue
        lst = sorted(codes)
        for i, a in enumerate(lst):
            for b in lst[i + 1:]:
                paires[(a, b)] = paires.get((a, b), 0) + 1
    res = {c: set() for c in entites}
    for (a, b), n in paires.items():
        if n >= min_communs:
            res[a].add(b)
            res[b].add(a)
    return res


# --- Chemins SVG ------------------------------------------------------------------------------------------

def chemin_svg(polys, decimales=1):
    """polys : liste de polygones, chacun liste d'anneaux de (x, y) déjà en unités SVG. Chemin « M…L…Z »."""
    morceaux = []
    for poly in polys:
        for r in poly:
            pts = r[:-1] if r and r[0] == r[-1] else r
            if len(pts) < 3:
                continue
            seg = [f"{pts[0][0]:.{decimales}f} {pts[0][1]:.{decimales}f}"]
            seg += [f"{x:.{decimales}f} {y:.{decimales}f}" for x, y in pts[1:]]
            morceaux.append("M" + "L".join(seg) + "Z")
    return "".join(morceaux).replace(".0 ", " ").replace(".0L", "L").replace(".0Z", "Z")


# --- Liste des préfectures (wikitext Wikipédia) ------------------------------------------------------------

def _texte_wiki(s):
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).replace("&nbsp;", " ").strip()


def lire_prefectures(wikitext):
    """Renvoie {code: {departement, prefecture, prefecture_region (bool), sous_prefectures [..]}} d'après le premier tableau."""
    debut = wikitext.index('{|class="wikitable sortable"')
    fin = wikitext.index("|}", debut)
    lignes = wikitext[debut:fin].split("\n|-")[2:]  # [0] = en-tête de tableau, [1] = ligne de titres
    res = {}
    for bloc in lignes:
        m = re.search(r"!scope=\"row\"[^|]*\|\s*(?:\{\{Tri\|\d+\|([0-9][0-9AB])\}\}|([0-9][0-9AB]{1,2}))", bloc)
        if not m:
            continue
        code = m.group(1) or m.group(2)
        cellules = bloc.split("\n|", 1)[1] if "\n|" in bloc else ""
        cellules = re.sub(r"\{\{formatnum:\{\{[^{}]*\}\}\}\}", "POP", cellules)  # ce modèle contient « || »
        parts = re.split(r"\|\|", cellules)
        if len(parts) < 4:
            continue
        # La cellule « département » peut commencer par un attribut ou un modèle ; la préfecture est la 2e cellule.
        pref_brut = parts[1]
        gras = "'''" in pref_brut
        sous = re.sub(r"\s*\(Chef-lieu\)", "", _texte_wiki(parts[3]))  # Val-d'Oise : Pontoise est chef-lieu mais pas siège de la préfecture
        res[code] = {
            "departement": _texte_wiki(parts[0]),
            "prefecture": re.sub(r"\s*\(capitale\)$", "", _texte_wiki(pref_brut)),
            "prefecture_region": gras,
            "sous_prefectures": [x.strip() for x in sous.split(",") if x.strip() and x.strip() not in ("-", "—")],
        }
    return res
