"""Télécharge les sources de la phase 4 (Territoires) dans data_local/territoires/ (hors dépôt).

Sources (toutes ouvertes) :
- contours : dépôt france-geojson de Grégoire David (tracés IGN Admin Express COG 2018, noms et codes INSEE) ;
- codes et noms officiels : API Découpage administratif (geo.api.gouv.fr, Etalab) ;
- préfectures et sous-préfectures : article Wikipédia « Liste des préfectures de France » (wikitext, CC BY-SA) ;
- population, superficie, article Wikipédia : requêtes SPARQL sur Wikidata (CC0) ;
- introductions : API Wikipédia (extraits, CC BY-SA).

Usage : python -I scripts/fetch_territoires.py [--force]
Environ 6 Mo téléchargés une seule fois ; les fichiers déjà présents sont conservés.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DEST = RACINE / "data_local" / "territoires"
UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}
GEOJSON = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
FICHIERS_GEOJSON = ["departements-avec-outre-mer", "regions-avec-outre-mer", "regions-avant-redecoupage-2015"]


def get(url, timeout=90):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def sparql(q):
    url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={**UA, "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["results"]["bindings"]


def ecrire(nom, contenu, force=False):
    chemin = DEST / nom
    if chemin.exists() and not force:
        print(f"= {nom} (déjà présent)")
        return False
    chemin.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(contenu, bytes):
        chemin.write_bytes(contenu)
    else:
        chemin.write_text(json.dumps(contenu, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"+ {nom}")
    return True


def valeurs(rows, cle):
    return {r[cle]["value"] for r in rows if cle in r}


REQUETE_WD = """SELECT ?e ?code ?article ?pop ?popDate ?area WHERE {{
  ?e wdt:{prop} ?code . ?e wdt:P31 wd:{classe} . FILTER NOT EXISTS {{ ?e wdt:P576 ?fin }}
  OPTIONAL {{ ?article schema:about ?e ; schema:isPartOf <https://fr.wikipedia.org/> . }}
  OPTIONAL {{ ?e p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL {{ ?ps pq:P585 ?popDate }} }}
  OPTIONAL {{ ?e wdt:P2046 ?area }}
}}"""


def fusion_wikidata(rows):
    """Une ligne par code : population la plus récente (avec sa date), superficie, article Wikipédia."""
    out = {}
    for r in rows:
        code = r["code"]["value"]
        o = out.setdefault(code, {"code": code, "qid": r["e"]["value"].rsplit("/", 1)[-1], "pop": None, "pop_date": None,
                                  "superficie_km2": None, "article": None})
        if "article" in r:
            o["article"] = urllib.parse.unquote(r["article"]["value"].rsplit("/wiki/", 1)[-1]).replace("_", " ")
        if "area" in r:
            o["superficie_km2"] = float(r["area"]["value"])
        if "pop" in r:
            date = r["popDate"]["value"][:10] if "popDate" in r else ""
            if o["pop_date"] is None or date > o["pop_date"]:
                o["pop"], o["pop_date"] = int(float(r["pop"]["value"])), date
    return out


def main(force=False):
    for nom in FICHIERS_GEOJSON:
        ecrire(f"{nom}.geojson", get(f"{GEOJSON}{nom}.geojson"), force)
    ecrire("geo_departements.json", json.loads(get("https://geo.api.gouv.fr/departements?fields=nom,code,codeRegion")), force)
    ecrire("geo_regions.json", json.loads(get("https://geo.api.gouv.fr/regions?fields=nom,code")), force)
    wt = get("https://fr.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json"
             "&formatversion=2&titles=" + urllib.parse.quote("Liste des préfectures de France"))
    ecrire("prefectures_wikitext.json", json.loads(wt), force)
    # P2586 : code INSEE de département ; P2585 : code INSEE de région (vérifié à l'exécution par le nombre de résultats).
    dep = fusion_wikidata(sparql(REQUETE_WD.format(prop="P2586", classe="Q6465")))
    # Paris et les départements d'outre-mer n'ont pas la classe « département français » : élément cherché par numéro.
    dep.update(fusion_wikidata(sparql(REQUETE_WD.replace("?e wdt:{prop} ?code . ?e wdt:P31 wd:{classe} .", "VALUES ?e {{ {qids} }} ?e wdt:P2586 ?code .")
                                      .format(qids=" ".join(f"wd:{q}" for q in ("Q90", "Q17012", "Q17054", "Q3769", "Q17070", "Q17063")))))) 
    # Le Rhône : l'élément de la circonscription (69D + 69M) est fusionné sous le code 69 ; l'article de référence est celui du département.
    if "69" in dep:
        dep["69"]["article"] = "Rhône (département)"
    ecrire("wikidata_departements.json", dep, force)
    reg = fusion_wikidata(sparql(REQUETE_WD.format(prop="P2585", classe="Q36784")))
    ecrire("wikidata_regions.json", reg, force)
    print(f"Wikidata : {len(dep)} départements, {len(reg)} régions")
    # Introductions Wikipédia des articles trouvés.
    titres = sorted({o["article"] for o in list(dep.values()) + list(reg.values()) if o["article"]})
    extraits = {}
    chemin = DEST / "wikipedia_extraits.json"
    if chemin.exists() and not force:
        print("= wikipedia_extraits.json (déjà présent)")
        return
    for i in range(0, len(titres), 20):
        lot = titres[i:i + 20]
        url = ("https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3"
               "&redirects=1&format=json&formatversion=2&titles=" + urllib.parse.quote("|".join(lot)))
        d = json.loads(get(url))["query"]
        alias = {}
        for k in d.get("normalized", []) + d.get("redirects", []):
            alias[k["to"]] = k["from"]
        for p in d["pages"]:
            if p.get("extract"):
                extraits[alias.get(p["title"], p["title"])] = {"titre": p["title"], "texte": p["extract"].strip()}
        time.sleep(0.3)
    ecrire("wikipedia_extraits.json", extraits, True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main("--force" in sys.argv)
