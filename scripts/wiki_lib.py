"""Récupération de sources pour rédiger des fiches et des cartes (jamais de mémoire du modèle) :
extraits et texte complet Wikipédia (CC BY-SA), identifiants Wikidata, requêtes SPARQL.

Usage en ligne de commande :
  python -I scripts/wiki_lib.py intro  "Loire (fleuve)" "Garonne"        # introductions (3 phrases)
  python -I scripts/wiki_lib.py texte  "Loire (fleuve)" [1500]            # texte brut, tronqué aux N premiers caractères
  python -I scripts/wiki_lib.py section "Loi NOTRe" "Contenu"             # une section (titre exact ou début de titre)
  python -I scripts/wiki_lib.py qid    "Loire (fleuve)" "Garonne"
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}
API = "https://fr.wikipedia.org/w/api.php"


def _get(url, timeout=60):
    for essai in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:  # réseau ou limite de débit : on réessaie après une pause
            if essai == 2:
                raise
            time.sleep(1.5 * (essai + 1))


def api(**params):
    params.update(format="json", formatversion=2)
    return json.loads(_get(API + "?" + urllib.parse.urlencode(params)))


def intros(titres, phrases=3):
    """{titre demandé: {titre, texte, url}} ; les titres sans article sont absents."""
    res = {}
    for i in range(0, len(titres), 20):
        lot = titres[i:i + 20]
        d = api(action="query", prop="extracts", exintro=1, explaintext=1, exsentences=phrases, redirects=1, titles="|".join(lot))["query"]
        alias = {}
        for k in d.get("normalized", []) + d.get("redirects", []):
            alias[k["to"]] = alias.get(k["from"], k["from"]) if k["from"] in alias else k["from"]
        for p in d["pages"]:
            if p.get("extract"):
                res[alias.get(p["title"], p["title"])] = {"titre": p["title"], "texte": p["extract"].strip(),
                                                          "url": "https://fr.wikipedia.org/wiki/" + p["title"].replace(" ", "_")}
    return res


def texte(titre, max_car=None):
    d = api(action="query", prop="extracts", explaintext=1, redirects=1, titles=titre)["query"]["pages"][0]
    t = d.get("extract", "")
    return t[:max_car] if max_car else t


def sections(titre):
    """{titre de section: texte} d'après les intertitres « == … == » du texte brut."""
    t = texte(titre)
    parts = re.split(r"\n(={2,4}) (.+?) \1\n", "\n" + t)
    res = {"(intro)": parts[0].strip()}
    for i in range(1, len(parts), 3):
        res[parts[i + 1].strip()] = parts[i + 2].strip()
    return res


def section(titre, debut_titre):
    for k, v in sections(titre).items():
        if k.lower().startswith(debut_titre.lower()):
            return v
    raise KeyError(f"section « {debut_titre} » introuvable dans {titre}")


def qids(titres):
    res = {}
    for i in range(0, len(titres), 40):
        lot = titres[i:i + 40]
        d = api(action="query", prop="pageprops", ppprop="wikibase_item", redirects=1, titles="|".join(lot))["query"]
        alias = {k["to"]: k["from"] for k in d.get("normalized", []) + d.get("redirects", [])}
        for p in d["pages"]:
            q = p.get("pageprops", {}).get("wikibase_item")
            if q:
                res[alias.get(p["title"], p["title"])] = q
    return res


def sparql(requete):
    url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(requete)
    req = urllib.request.Request(url, headers={**UA, "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["results"]["bindings"]


def lien_wikipedia(titre):
    return "https://fr.wikipedia.org/wiki/" + urllib.parse.quote(titre.replace(" ", "_"), safe="_(),'-:")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "intro":
        for k, v in intros(args).items():
            print(f"## {k}  <{v['url']}>\n{v['texte']}\n")
    elif cmd == "texte":
        print(texte(args[0], int(args[1]) if len(args) > 1 else None))
    elif cmd == "section":
        print(section(args[0], args[1]))
    elif cmd == "qid":
        for k, v in qids(args).items():
            print(k, v)
    else:
        sys.exit(__doc__)
