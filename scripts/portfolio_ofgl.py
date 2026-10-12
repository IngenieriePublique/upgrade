"""Données de départ du projet de portfolio P1 (analyse financière comparée des départements).

Télécharge les comptes consolidés des départements publiés par l'OFGL (data.ofgl.fr, Licence ouverte 2.0),
calcule les ratios classiques (taux d'épargne brute, capacité de désendettement, par habitant) et écrit un CSV
dans data_local/portfolio/ (hors dépôt). Le script ne fait que préparer les données : la lecture, la
comparaison et les recommandations sont le travail de l'utilisateur.

Usage :
  python -I scripts/portfolio_ofgl.py [--region 75] [--de 2018] [--a 2025] [--sortie data_local/portfolio/ofgl-dep-75.csv]
  python -I scripts/portfolio_ofgl.py --table 2023-2025     (affiche le tableau Markdown du corpus de l'atelier)
"""
import argparse
import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BASE = "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-departements-consolidee/exports/json"
UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}

# Agrégats OFGL utilisés (noms exacts du jeu de données).
AGREGATS = {
    "recettes_fct": "Recettes de fonctionnement",
    "depenses_fct": "Dépenses de fonctionnement",
    "epargne_brute": "Epargne brute",
    "epargne_nette": "Epargne nette",
    "dette": "Encours de dette",
    "equipement": "Dépenses d'équipement",
    "personnel": "Frais de personnel",
    "rsa": "Allocations RSA",
    "dmto": "DMTO avant péréq.",
}
COLONNES = ["annee", "dep_code", "dep_nom", "population", *AGREGATS, "taux_epargne_brute", "desendettement_annees",
            "recettes_fct_par_hab", "epargne_brute_par_hab", "dette_par_hab"]


def url_export(region, de, a):
    noms = ", ".join('"%s"' % n for n in AGREGATS.values())
    where = f'reg_code="{region}" and year(exer)>={de} and year(exer)<={a} and agregat in ({noms})'
    sel = "exer,dep_code,dep_name,agregat,montant,ptot"
    return BASE + "?" + urllib.parse.urlencode({"where": where, "select": sel}, quote_via=urllib.parse.quote)


def telecharger(region, de, a, timeout=120):
    req = urllib.request.Request(url_export(region, de, a), headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def indicateurs(lignes):
    """lignes : enregistrements OFGL (exer, dep_code, dep_name, agregat, montant, ptot).
    Renvoie une liste de dictionnaires (un par département et par année), triée par année puis code."""
    par_nom = {v: k for k, v in AGREGATS.items()}
    tab = {}
    for x in lignes:
        cle = (int(str(x["exer"])[:4]), x["dep_code"])
        ligne = tab.setdefault(cle, {"annee": cle[0], "dep_code": cle[1], "dep_nom": x["dep_name"],
                                      "population": x.get("ptot")})
        champ = par_nom.get(x["agregat"])
        if champ and x.get("montant") is not None:
            ligne[champ] = round(x["montant"], 2)
    sortie = []
    for cle in sorted(tab):
        l = tab[cle]
        for champ in AGREGATS:
            l.setdefault(champ, None)
        rf, eb, dette, pop = l["recettes_fct"], l["epargne_brute"], l["dette"], l["population"]
        l["taux_epargne_brute"] = round(100 * eb / rf, 1) if rf and eb is not None else None
        # Capacité de désendettement : sans objet (None) si l'épargne brute est nulle ou négative.
        l["desendettement_annees"] = round(dette / eb, 1) if dette is not None and eb and eb > 0 else None
        l["recettes_fct_par_hab"] = round(rf / pop) if rf and pop else None
        l["epargne_brute_par_hab"] = round(eb / pop) if eb is not None and pop else None
        l["dette_par_hab"] = round(dette / pop) if dette is not None and pop else None
        sortie.append(l)
    return sortie


def ecrire_csv(lignes, chemin):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with chemin.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLONNES, delimiter=";")
        w.writeheader()
        for l in lignes:
            w.writerow({c: ("" if l.get(c) is None else l[c]) for c in COLONNES})


def tableau(lignes, annees):
    """Tableau pour l'atelier : une ligne par département, les années côte à côte (M€ et ratios), puis la dette
    et la capacité de désendettement de la dernière année. Renvoie (colonnes, lignes) de chaînes."""
    par_dep = {}
    for l in lignes:
        if l["annee"] in annees:
            par_dep.setdefault((l["dep_code"], l["dep_nom"]), {})[l["annee"]] = l
    colonnes = ["Département"]
    for an in annees:
        colonnes += [f"Épargne brute {an} (M€)", f"Taux d'épargne brute {an} (%)"]
    colonnes += [f"Encours de dette fin {annees[-1]} (M€)", f"Désendettement {annees[-1]} (années)"]
    fr = lambda v, nd=1: f"{v:.{nd}f}".replace(".", ",")
    rows = []
    for (code, nom), d in sorted(par_dep.items(), key=lambda kv: kv[0][1]):
        cases = [f"{nom} ({code})"]
        for an in annees:
            l = d.get(an)
            cases.append("n.d." if not l or l["epargne_brute"] is None else fr(l["epargne_brute"] / 1e6))
            cases.append("n.d." if not l or l["taux_epargne_brute"] is None else fr(l["taux_epargne_brute"]))
        der = d.get(annees[-1])
        cases.append("n.d." if not der or der["dette"] is None else fr(der["dette"] / 1e6))
        des = der["desendettement_annees"] if der else None
        cases.append("sans objet" if des is None else fr(des))
        rows.append(cases)
    return colonnes, rows


def tableau_markdown(lignes, annees):
    colonnes, rows = tableau(lignes, annees)
    out = ["| " + " | ".join(colonnes) + " |", "|" + "---|" * len(colonnes)]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--region", default="75", help="code région (75 = Nouvelle-Aquitaine)")
    p.add_argument("--de", type=int, default=2018)
    p.add_argument("--a", type=int, default=2025)
    p.add_argument("--sortie", default=None)
    p.add_argument("--table", default=None, help="période AAAA-AAAA : affiche le tableau (Markdown, ou JSON avec --json) au lieu d'écrire le CSV")
    p.add_argument("--json", action="store_true")
    a = p.parse_args()
    if a.table:
        d, f = (int(x) for x in a.table.split("-"))
        lignes = indicateurs(telecharger(a.region, d, f))
        annees = list(range(d, f + 1))
        if a.json:
            c, r = tableau(lignes, annees)
            print(json.dumps({"colonnes": c, "lignes": r}, ensure_ascii=False, indent=1))
        else:
            print(tableau_markdown(lignes, annees))
    else:
        lignes = indicateurs(telecharger(a.region, a.de, a.a))
        chemin = Path(a.sortie) if a.sortie else RACINE / "data_local" / "portfolio" / f"ofgl-dep-{a.region}.csv"
        ecrire_csv(lignes, chemin)
        print(f"{len(lignes)} lignes écrites dans {chemin}")
