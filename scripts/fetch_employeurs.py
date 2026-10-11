"""Récupère, pour une liste d'employeurs candidats au radar, l'introduction de l'article Wikipédia (CC BY-SA)
et le site officiel (Wikidata P856), puis cherche sur le site officiel les pages « recrutement / stages ».
Écrit un fichier de travail lisible pour rédiger les fiches (content/radar/employeurs.json).

Usage : python -I scripts/fetch_employeurs.py [sortie.json]
Les titres ci-dessous ne sont que des clés de recherche : le contenu des fiches vient des extraits récupérés.
"""
import importlib.util
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)", "Accept-Language": "fr"}

# On réutilise les fonctions d'accès à Wikipédia / Wikidata de fetch_sigles.py (avec -I, le dossier du script n'est pas importable).
_spec = importlib.util.spec_from_file_location("fetch_sigles", RACINE / "scripts" / "fetch_sigles.py")
_fs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_fs)

# clé -> titre d'article Wikipédia fr (clé de recherche)
CANDIDATS = {
    "ditp": "Direction interministérielle de la transformation publique",
    "anct": "Agence nationale de la cohésion des territoires",
    "budget": "Direction du Budget",
    "dgafp": "Direction générale de l'Administration et de la Fonction publique",
    "dgcl": "Direction générale des Collectivités locales",
    "france-strategie": "France Stratégie",
    "cour-des-comptes": "Cour des comptes (France)",
    "cerema": "Centre d'études et d'expertise sur les risques, l'environnement, la mobilité et l'aménagement",
    "insee": "Institut national de la statistique et des études économiques",
    "banque-des-territoires": "Banque des Territoires",
    "ademe": "Agence de la transition écologique",
    "cnfpt": "Centre national de la fonction publique territoriale",
    "dgfip": "Direction générale des Finances publiques",
    "iga": "Inspection générale de l'administration",
    "igf": "Inspection générale des finances (France)",
    "prefecture-na": "Préfecture de la région Nouvelle-Aquitaine",
    "dreets-na": "Direction régionale de l'économie, de l'emploi, du travail et des solidarités",
    "dreal-na": "Direction régionale de l'Environnement, de l'Aménagement et du Logement",
    "crc-na": "Chambre régionale des comptes de Nouvelle-Aquitaine",
    "region-na": "Nouvelle-Aquitaine",
    "gironde": "Gironde",
    "bordeaux-metropole": "Bordeaux Métropole",
    "bordeaux": "Bordeaux",
    "idf": "Île-de-France (région)",
    "paris": "Paris",
    "inspection-paris": "Inspection générale de la Ville de Paris",
    "aurba": "Agence d'urbanisme Bordeaux Aquitaine",
    "arec-na": "Agence régionale d'évaluation environnement et climat",
    "adi-na": "Agence de développement et d'innovation de la Nouvelle-Aquitaine",
    "ceser-na": "Conseil économique, social et environnemental régional de Nouvelle-Aquitaine",
    "institut-paris-region": "Institut Paris Région",
    "ofgl": "Observatoire des finances et de la gestion publique locales",
    "sfe": "Société française de l'évaluation",
    "ipp": "Institut des politiques publiques",
    "liepp": "Laboratoire interdisciplinaire d'évaluation des politiques publiques",
    "jpal": "Abdul Latif Jameel Poverty Action Lab",
    "departements-de-france": "Assemblée des départements de France",
    "regions-de-france": "Régions de France",
    "france-urbaine": "France urbaine",
    "pole-emploi": "France Travail",
    "dares": "Direction de l'animation de la recherche, des études et des statistiques",
    "drees": "Direction de la Recherche, des Études, de l'Évaluation et des Statistiques",
    "senat": "Sénat (France)",
    "cese": "Conseil économique, social et environnemental (France)",
    "afd": "Agence française de développement",
    "agence-france-locale": "Agence France Locale",
    "dgs-cohesion": "Commissariat général à l'égalité des territoires",
}

MOTS_RECRUT = re.compile(r"recrut|emploi|carri[eè]re|stage|offres?|rejoign|travailler|jobs?", re.I)


class Liens(HTMLParser):
    def __init__(self):
        super().__init__()
        self.liens = []
        self._href = None
        self._txt = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._txt = []

    def handle_data(self, data):
        if self._href:
            self._txt.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href:
            self.liens.append((self._href, " ".join("".join(self._txt).split())))
            self._href = None


def page_recrutement(site):
    """Cherche sur la page d'accueil du site officiel des liens de recrutement ; renvoie [(url, texte)] (au plus 4)."""
    try:
        req = urllib.request.Request(site, headers=UA)
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read(600_000).decode("utf-8", "ignore")
            base = r.geturl()
    except Exception as e:
        return [("erreur", str(e)[:80])]
    p = Liens()
    p.feed(html)
    vus, out = set(), []
    for href, txt in p.liens:
        if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
            continue
        if MOTS_RECRUT.search(txt) or MOTS_RECRUT.search(href):
            u = urllib.parse.urljoin(base, href)
            if u not in vus and len(txt) < 80:
                vus.add(u)
                out.append((u, txt))
    return out[:4]


def main():
    sortie = Path(sys.argv[1] if len(sys.argv) > 1 else "data_local/employeurs_sources.json")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    items = list(CANDIDATS.items())
    result = {}
    for i in range(0, len(items), 20):
        result.update(_fs.fetch_batch(dict(items[i:i + 20])))
        time.sleep(1)
    qids = [v["qid"] for v in result.values() if v.get("qid")]
    wd = {}
    for i in range(0, len(qids), 40):
        wd.update(_fs.wikidata(qids[i:i + 40]))
        time.sleep(1)
    for v in result.values():
        if v.get("qid") in wd:
            v.update(wd[v["qid"]])
    sites = [(k, v["site_officiel"]) for k, v in result.items() if v.get("site_officiel")]
    with ThreadPoolExecutor(6) as ex:
        for (k, _), liens in zip(sites, ex.map(lambda kv: page_recrutement(kv[1]), sites)):
            result[k]["liens_recrutement"] = liens
    sortie.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{sum(1 for v in result.values() if 'erreur' not in v)}/{len(result)} articles ; "
          f"{len(sites)} sites officiels -> {sortie}")


if __name__ == "__main__":
    main()
