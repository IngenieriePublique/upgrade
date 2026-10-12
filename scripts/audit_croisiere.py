"""Audit de croisière : ce qu'il faut revoir ou produire ce mois-ci.

Parcourt content/**/*.json et signale :
- les faits périssables dont la date de revue dépasse `--mois` (6 par défaut) ; les autres contenus au-delà de 12 mois ;
- le rythme des kits (publiés par parcours, reste à produire pour atteindre la cible, mois nécessaires à 4 par mois) ;
- la fraîcheur du Brief (le cron GitHub publie chaque jour ; un Brief ancien signale un workflow arrêté).

Le script ne modifie rien. Il sert à ouvrir une séance de croisière : il dit quoi revérifier avant d'écrire du nouveau.

Usage : python -I scripts/audit_croisiere.py [--aujourdhui AAAA-MM-JJ] [--mois 6] [--strict]
Avec --strict, le code de sortie est 1 s'il y a quelque chose à revoir.
"""
import argparse
import datetime
import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CIBLE_KITS = 48        # taille du curriculum prévue par PLAN.md (« environ 48 kits de 2 h »)
KITS_PAR_MOIS = 4
MOIS_PERISSABLE = 6
MOIS_AUTRES = 12
BRIEF_AGE_MAX = 3      # jours : au-delà, le cron a probablement cessé de tourner


def date_ou_none(v):
    try:
        return datetime.date.fromisoformat(str(v))
    except ValueError:
        return None


def mois_entre(d1, d2):
    """Nombre de mois entiers écoulés de d1 à d2 (0 si d2 est avant)."""
    m = (d2.year - d1.year) * 12 + d2.month - d1.month
    if d2.day < d1.day:
        m -= 1
    return max(0, m)


def collecter(x, chemin="", sortie=None):
    """Toutes les entrées { revu, perissable? } d'une structure JSON : liste de (chemin, date, perissable)."""
    sortie = [] if sortie is None else sortie
    if isinstance(x, dict):
        d = date_ou_none(x.get("revu")) if "revu" in x else None
        if d:
            sortie.append((chemin or ".", d, bool(x.get("perissable"))))
        for k, v in x.items():
            if isinstance(v, (dict, list)):
                collecter(v, f"{chemin}/{k}", sortie)
    elif isinstance(x, list):
        for i, v in enumerate(x):
            collecter(v, f"{chemin}[{i}]", sortie)
    return sortie


def resume_fichier(entrees, aujourdhui, mois_perissable=MOIS_PERISSABLE, mois_autres=MOIS_AUTRES):
    """Pour un fichier : nombre d'entrées, plus ancienne revue, entrées à revoir (périssables trop vieilles ou autres très vieilles)."""
    if not entrees:
        return None
    a_revoir = [e for e in entrees if mois_entre(e[1], aujourdhui) >= (mois_perissable if e[2] else mois_autres)]
    return {"n": len(entrees), "plus_ancienne": min(e[1] for e in entrees), "perissables": sum(1 for e in entrees if e[2]),
            "a_revoir": len(a_revoir)}


def etat_kits(dossier, cible=CIBLE_KITS, par_mois=KITS_PAR_MOIS):
    par = {}
    for f in sorted(dossier.glob("*.json")):
        if f.name == "parcours.json":
            continue
        k = json.loads(f.read_text(encoding="utf-8"))
        par[k["parcours"]] = par.get(k["parcours"], 0) + 1
    total = sum(par.values())
    reste = max(0, cible - total)
    return {"par_parcours": dict(sorted(par.items())), "total": total, "reste": reste, "mois": -(-reste // par_mois)}


def etat_brief(chemin, aujourdhui, age_max=BRIEF_AGE_MAX):
    try:
        derniere = date_ou_none(json.loads(chemin.read_text(encoding="utf-8")).get("derniere"))
    except (OSError, ValueError):
        return {"derniere": None, "age": None, "ok": False}
    if not derniere:
        return {"derniere": None, "age": None, "ok": False}
    age = (aujourdhui - derniere).days
    return {"derniere": derniere, "age": age, "ok": age <= age_max}


def audit(racine=RACINE, aujourdhui=None, mois=MOIS_PERISSABLE):
    aujourdhui = aujourdhui or datetime.date.today()
    fichiers = {}
    for f in sorted((racine / "content").rglob("*.json")):
        try:
            entrees = collecter(json.loads(f.read_text(encoding="utf-8")))
        except ValueError:
            fichiers[str(f.relative_to(racine)).replace("\\", "/")] = {"erreur": "JSON illisible"}
            continue
        r = resume_fichier(entrees, aujourdhui, mois)
        if r:
            fichiers[str(f.relative_to(racine)).replace("\\", "/")] = r
    return {
        "aujourdhui": aujourdhui,
        "fichiers": fichiers,
        "kits": etat_kits(racine / "content" / "fondations"),
        "brief": etat_brief(racine / "site" / "data" / "brief" / "index.json", aujourdhui),
    }


def a_quelque_chose_a_revoir(a):
    return any(f.get("a_revoir") or f.get("erreur") for f in a["fichiers"].values()) or not a["brief"]["ok"]


def rapport(a, mois=MOIS_PERISSABLE):
    L = [f"Audit de croisière au {a['aujourdhui'].isoformat()}", ""]
    revoir = {n: f for n, f in a["fichiers"].items() if f.get("a_revoir") or f.get("erreur")}
    L.append(f"1. Contenus à revoir (périssables de plus de {mois} mois, autres de plus de {MOIS_AUTRES} mois) : {len(revoir)} fichier(s)")
    for n, f in revoir.items():
        L.append(f"   - {n} : JSON illisible" if f.get("erreur") else f"   - {n} : {f['a_revoir']} entrée(s) sur {f['n']}, plus ancienne revue {f['plus_ancienne'].isoformat()}")
    if not revoir:
        L.append("   Rien à revoir.")
    k = a["kits"]
    L += ["", f"2. Kits : {k['total']} publiés sur {CIBLE_KITS} prévus ({', '.join(f'{p} : {n}' for p, n in k['par_parcours'].items())})."]
    L.append(f"   Reste {k['reste']} kit(s) : environ {k['mois']} mois à {KITS_PAR_MOIS} par mois." if k["reste"] else "   Curriculum complet.")
    b = a["brief"]
    L += ["", "3. Brief : " + ("jamais généré ou fichier illisible." if b["derniere"] is None else
                              f"dernier Brief du {b['derniere'].isoformat()} (il y a {b['age']} jour(s)). "
                              + ("Le cron tourne." if b["ok"] else "Le workflow « Brief quotidien » semble arrêté : vérifier l'onglet Actions de GitHub, ou lancer python -I scripts/build_brief.py."))]
    return "\n".join(L)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aujourdhui", default=None, help="date du jour AAAA-MM-JJ (par défaut : aujourd'hui)")
    p.add_argument("--mois", type=int, default=MOIS_PERISSABLE)
    p.add_argument("--strict", action="store_true")
    a = p.parse_args()
    jour = date_ou_none(a.aujourdhui) if a.aujourdhui else None
    res = audit(RACINE, jour, a.mois)
    print(rapport(res, a.mois))
    if a.strict and a_quelque_chose_a_revoir(res):
        sys.exit(1)
