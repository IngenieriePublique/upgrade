"""Récupère, pour une liste de sigles, l'introduction de l'article Wikipédia (CC BY-SA)
et le site officiel (Wikidata P856). Écrit un fichier de travail lisible pour rédiger les cartes.

Usage : python -I scripts/fetch_sigles.py [sortie.json]
Les titres ci-dessous ne sont que des clés de recherche : le contenu des cartes vient des extraits récupérés.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}

# sigle -> titre d'article Wikipédia fr (clé de recherche)
CANDIDATS = {
    "ANCT": "Agence nationale de la cohésion des territoires",
    "DGCL": "Direction générale des collectivités locales",
    "DGFiP": "Direction générale des Finances publiques",
    "CRC": "Chambre régionale des comptes",
    "CESER": "Conseil économique, social et environnemental régional",
    "SGAR": "Secrétaire général pour les Affaires régionales",
    "DREETS": "Direction régionale de l'économie, de l'emploi, du travail et des solidarités",
    "DDT(M)": "Direction départementale des territoires",
    "DREAL": "Direction régionale de l'Environnement, de l'Aménagement et du Logement",
    "EPCI": "Établissement public de coopération intercommunale",
    "PETR": "Pôle d'équilibre territorial et rural",
    "CTAP": "Conférence territoriale de l'action publique",
    "CPER": "Contrat de plan État-Région",
    "FEDER": "Fonds européen de développement régional",
    "DGF": "Dotation globale de fonctionnement",
    "DETR": "Dotation d'équipement des territoires ruraux",
    "DSIL": "Dotation de soutien à l'investissement local",
    "ZAN": "Zéro artificialisation nette",
    "SRADDET": "Schéma régional d'aménagement, de développement durable et d'égalité des territoires",
    "SCoT": "Schéma de cohérence territoriale",
    "PLUi": "Plan local d'urbanisme intercommunal",
    "Cerema": "Centre d'études et d'expertise sur les risques, l'environnement, la mobilité et l'aménagement",
    "DITP": "Direction interministérielle de la transformation publique",
    "DINUM": "Direction interministérielle du numérique",
    "INSEE": "Institut national de la statistique et des études économiques",
    "INET": "Institut national des études territoriales",
    "CNFPT": "Centre national de la fonction publique territoriale",
    "OFGL": "Observatoire des finances et de la gestion publique locales",
    "DARES": "Direction de l'animation de la recherche, des études et des statistiques",
    "ADEME": "Agence de la transition écologique",
    "ANAH": "Agence nationale de l'habitat",
    "ANRU": "Agence nationale pour la rénovation urbaine",
    "CDC": "Caisse des dépôts et consignations",
    "AFD": "Agence française de développement",
    "LOLF": "Loi organique relative aux lois de finances",
    "CGCT": "Code général des collectivités territoriales",
    "NOTRe": "Loi portant nouvelle organisation territoriale de la République",
    "MAPTAM": "Loi de modernisation de l'action publique territoriale et d'affirmation des métropoles",
    "3DS": "Loi relative à la différenciation, la décentralisation, la déconcentration et portant diverses mesures de simplification de l'action publique locale",
    "ARS": "Agence régionale de santé",
    "DRAC": "Direction régionale des Affaires culturelles",
    "DRAAF": "Direction régionale de l'Alimentation, de l'Agriculture et de la Forêt",
    "ADCF": "Intercommunalités de France",
    "AMF": "Association des maires de France",
    "QPV": "Quartier prioritaire de la politique de la ville",
    "ORT": "Opération de revitalisation de territoire",
    "ACV": "Action cœur de ville",
    "PVD": "Petites Villes de demain",
    "CRTE": "Contrat de relance et de transition écologique",
    "FSE+": "Fonds social européen",
    "FEADER": "Fonds européen agricole pour le développement rural",
    "LEADER": "Liaison entre actions de développement de l'économie rurale",
    "SDIS": "Service départemental d'incendie et de secours",
    "CCAS": "Centre communal d'action sociale",
    "SEM": "Société d'économie mixte",
    "SPL": "Société publique locale",
    "DSP": "Délégation de service public",
    "CAF": "Caisse d'allocations familiales",
    "France Travail": "France Travail",
    "SFE": "Société française de l'évaluation",
    "CGET": "Commissariat général à l'égalité des territoires",
    "DATAR": "Délégation interministérielle à l'aménagement du territoire et à l'attractivité régionale",
    "ANSM": "Agence nationale de sécurité du médicament et des produits de santé",
    "HCERES": "Haut Conseil de l'évaluation de la recherche et de l'enseignement supérieur",
    "FranceAgriMer": "FranceAgriMer",
    "DDETS": "Direction départementale de l'emploi, du travail et des solidarités",
    "PNR": "Parc naturel régional",
    "SGG": "Secrétariat général du Gouvernement",
    "AAP": "Appel à projets",
    "FNADT": "Fonds national d'aménagement et de développement du territoire",
    "SRDEII": "Schéma régional de développement économique, d'innovation et d'internationalisation",
    "OPH": "Office public de l'habitat",
    "CHSCT": "Comité d'hygiène, de sécurité et des conditions de travail",
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def api(host, params):
    return get(f"https://{host}/w/api.php?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2}))


def fetch_batch(items):
    titles = "|".join(items.values())
    d = api("fr.wikipedia.org", {
        "action": "query", "prop": "extracts|pageprops|info", "exintro": 1, "explaintext": 1,
        "redirects": 1, "titles": titles, "inprop": "url", "ppprop": "wikibase_item",
    })
    q = d["query"]
    redir = {}
    for key in ("normalized", "redirects"):
        for m in q.get(key, []):
            redir[m["from"]] = m["to"]

    def resolve(t):
        seen = 0
        while t in redir and seen < 5:
            t = redir[t]
            seen += 1
        return t

    pages = {p["title"]: p for p in q["pages"]}
    out = {}
    for sigle, titre in items.items():
        p = pages.get(resolve(titre))
        if not p or p.get("missing"):
            out[sigle] = {"erreur": "article introuvable", "titre_demande": titre}
            continue
        out[sigle] = {
            "titre": p["title"],
            "url": p["fullurl"],
            "qid": p.get("pageprops", {}).get("wikibase_item"),
            "extrait": (p.get("extract") or "")[:900],
        }
    return out


def wikidata(qids):
    d = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
        "action": "wbgetentities", "ids": "|".join(qids), "props": "claims|labels", "languages": "fr",
        "format": "json"}))
    res = {}
    for qid, e in d.get("entities", {}).items():
        claims = e.get("claims", {})
        site = None
        for c in claims.get("P856", []):
            try:
                site = c["mainsnak"]["datavalue"]["value"]
                if c.get("rank") == "preferred":
                    break
            except KeyError:
                pass
        res[qid] = {"site_officiel": site, "label": e.get("labels", {}).get("fr", {}).get("value")}
    return res


def main():
    sortie = Path(sys.argv[1] if len(sys.argv) > 1 else "data_local/sigles_sources.json")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    items = list(CANDIDATS.items())
    result = {}
    for i in range(0, len(items), 20):
        result.update(fetch_batch(dict(items[i:i + 20])))
        time.sleep(1)
    qids = [v["qid"] for v in result.values() if v.get("qid")]
    wd = {}
    for i in range(0, len(qids), 40):
        wd.update(wikidata(qids[i:i + 40]))
        time.sleep(1)
    for v in result.values():
        if v.get("qid") in wd:
            v.update(wd[v["qid"]])
    sortie.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for v in result.values() if "erreur" not in v)
    print(f"{ok}/{len(result)} articles trouvés ; avec site officiel : "
          f"{sum(1 for v in result.values() if v.get('site_officiel'))} -> {sortie}")


if __name__ == "__main__":
    main()
