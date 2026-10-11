"""Cherche une deuxième source institutionnelle pour chaque sigle déjà récupéré par fetch_sigles.py.
Méthode : liens externes cités par l'article Wikipédia, filtrés sur des domaines institutionnels,
puis vérification que la page répond (HTTP 200) et contient un mot-clé du nom complet.

Usage : python -I scripts/find_second_sources.py data_local/sigles_sources.json data_local/sigles_seconds.json
"""
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}
DOMAINES = (
    "legifrance.gouv.fr", "vie-publique.fr", "service-public.fr", "collectivites-locales.gouv.fr",
    "ccomptes.fr", "senat.fr", "assemblee-nationale.fr", "europa.eu", "insee.fr", "gouvernement.fr",
    "banquedesterritoires.fr", "cohesion-territoires.gouv.fr", "ecologie.gouv.fr", "interieur.gouv.fr",
    "economie.gouv.fr", "culture.gouv.fr", "agriculture.gouv.fr", "anct.gouv.fr", "cget.gouv.fr",
    "modernisation.gouv.fr", "conseil-constitutionnel.fr", "conseil-etat.fr", "regions-france.org",
    "ademe.fr", "anah.gouv.fr", "anru.fr", "cerema.fr", "data.gouv.fr", "ofgl.fr", "ecologie.gouv.fr",
    "info.gouv.fr", "gouv.fr",
)


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def extlinks(titre):
    out, cont = [], {}
    while True:
        d = get_json("https://fr.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "prop": "extlinks", "ellimit": 500, "titles": titre, "format": "json",
            "formatversion": 2, **cont}))
        for p in d["query"]["pages"]:
            out += [e["url"] for e in p.get("extlinks", [])]
        if "continue" not in d:
            return out
        cont = d["continue"]


def verifie(url, mots):
    try:
        req = urllib.request.Request(url, headers={**UA, "Accept-Language": "fr"})
        with urllib.request.urlopen(req, timeout=8) as r:
            if r.status != 200:
                return False
            txt = norm(r.read(400_000).decode("utf-8", "ignore"))
    except Exception:
        return False
    return all(m in txt for m in mots)


def mots_cles(titre):
    vides = {"de", "du", "des", "la", "le", "les", "et", "en", "pour", "au", "aux", "d", "l", "un", "une", "loi"}
    mots = [m for m in re.findall(r"[a-z0-9]+", norm(titre)) if m not in vides and len(m) > 3]
    return mots[:2]


def candidats(v):
    sites = {v["site_officiel"].rstrip("/")} if v.get("site_officiel") else set()
    out = []
    for u in extlinks(v["titre"]):
        host = urllib.parse.urlparse(u).netloc.lower()
        if any(host == d or host.endswith("." + d) for d in DOMAINES) and u.rstrip("/") not in sites and u not in out:
            out.append(u)
    return out[:30]


def traite(item):
    sigle, v = item
    mots = mots_cles(v["titre"])
    urls = candidats(v)
    with ThreadPoolExecutor(8) as ex:
        bons = [u for u, okk in zip(urls, ex.map(lambda u: verifie(u, mots), urls)) if okk]
    print(sigle, len(bons), bons[:1], flush=True)
    return sigle, bons[:3]


def main():
    src = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    sortie = Path(sys.argv[2])
    items = [(k, v) for k, v in src.items() if "erreur" not in v]
    with ThreadPoolExecutor(4) as ex:
        res = dict(ex.map(traite, items))
    sortie.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
