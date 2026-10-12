"""Valide les dictées (content/dictees/dictees.json) et les cartes de règles (content/dictees/regles.json),
puis publie site/data/dictees/{dictees,regles}.json.

Règles : identifiants dNN uniques ; niveau 1 à 4 ; 50 à 200 mots ; le nombre de mots annoncé est le vrai ;
les segments de lecture recomposent exactement le texte ; une source (adresse http) et une licence ; profil complet.
Cartes de règles : mêmes exigences que les autres paquets (build_content.valider_paquet : 2 sources distinctes,
date de revue), plus une catégorie de faute connue ; au moins 3 cartes par catégorie.

Usage : python scripts/build_dictees.py
"""
import datetime
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_content as bc  # noqa: E402
import dictee_lib as d  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "dictees"
CIBLE = RACINE / "site" / "data" / "dictees"
ID_DICTEE = re.compile(r"^d\d{2}$")


def valider_dictee(x, ids_vus):
    err = []
    i = x.get("id", "?")
    if not isinstance(i, str) or not ID_DICTEE.match(i):
        err.append(f"{i} : identifiant invalide (attendu dNN)")
    if i in ids_vus:
        err.append(f"{i} : identifiant en double")
    ids_vus.add(i)
    for cle in ("titre", "auteur", "oeuvre", "licence", "texte"):
        if not isinstance(x.get(cle), str) or not x[cle].strip():
            err.append(f"{i} : champ {cle} manquant")
    if not isinstance(x.get("annee"), int):
        err.append(f"{i} : année manquante")
    if x.get("niveau") not in (1, 2, 3, 4):
        err.append(f"{i} : niveau invalide {x.get('niveau')!r}")
    src = x.get("source") or {}
    if not src.get("titre") or not re.match(r"^https?://\S+$", str(src.get("url", ""))):
        err.append(f"{i} : source mal formée")
    try:
        datetime.date.fromisoformat(str(x.get("revu")))
    except ValueError:
        err.append(f"{i} : date de revue invalide")
    texte = x.get("texte") or ""
    n = d.nb_mots(texte)
    if not 50 <= n <= 200:
        err.append(f"{i} : {n} mots (attendu 50 à 200)")
    if x.get("mots") != n:
        err.append(f"{i} : « mots » annonce {x.get('mots')}, le texte en compte {n}")
    if "'" in texte or "#" in texte:
        err.append(f"{i} : apostrophe droite ou reste de titre dans le texte")
    seg = x.get("segments")
    if not isinstance(seg, list) or not seg:
        err.append(f"{i} : segments de lecture absents")
    elif " ".join(seg).split() != texte.split():
        err.append(f"{i} : les segments ne recomposent pas le texte")
    fins = x.get("fins_alinea")
    nb_alineas = len(re.split(r"\n\s*\n", texte))
    if isinstance(seg, list) and (not isinstance(fins, list) or len(fins) != len(seg) or not all(isinstance(f, bool) for f in fins)
                                  or not fins or fins[-1] is not True or sum(fins) != nb_alineas):
        err.append(f"{i} : fins d'alinéa incohérentes avec les segments")
    pr = x.get("profil")
    if not isinstance(pr, dict) or set(pr) != set(d.CATEGORIES) or not all(isinstance(v, (int, float)) for v in pr.values()):
        err.append(f"{i} : profil incomplet")
    return err


def valider_regles(r):
    err = []
    cats = r.get("categories")
    if not isinstance(cats, list) or {c.get("id") for c in cats} != set(d.CATEGORIES):
        return ["règles : les catégories doivent être exactement " + ", ".join(d.CATEGORIES)]
    for c in cats:
        for cle in ("libelle", "aide"):
            if not isinstance(c.get(cle), str) or not c[cle].strip():
                err.append(f"catégorie {c['id']} : champ {cle} manquant")
    err += bc.valider_paquet(r)
    par = dict.fromkeys(d.CATEGORIES, 0)
    for c in r.get("cartes", []):
        cat = c.get("categorie")
        if cat not in par:
            err.append(f"{c.get('id')} : catégorie inconnue {cat!r}")
        else:
            par[cat] += 1
    for cat, n in par.items():
        if n < 3:
            err.append(f"catégorie {cat} : {n} carte(s), au moins 3 attendues")
    return err


def construire(source=SOURCE, cible=CIBLE):
    dic = json.loads((source / "dictees.json").read_text(encoding="utf-8"))
    regles = json.loads((source / "regles.json").read_text(encoding="utf-8"))
    err, ids = [], set()
    for x in dic["dictees"]:
        err += valider_dictee(x, ids)
    if len(dic["dictees"]) < 1:
        err.append("aucune dictée")
    err += valider_regles(regles)
    if err:
        return err
    cible.mkdir(parents=True, exist_ok=True)
    bc.ecrire(cible / "dictees.json", json.dumps(dic, ensure_ascii=False, separators=(",", ":")))
    bc.ecrire(cible / "regles.json", json.dumps(regles, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Dictées et règles publiées dans site/data/dictees/")
