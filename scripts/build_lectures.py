"""Valide les lectures de First Upgrade (content/lectures/lectures.json) et les publie dans site/data/lectures/lectures.json.

Règles : identifiants uniques ; thème connu ; année entre 2020 et 2026 ; adresse https ; auteurs, source et résumé
renseignés ; un résumé court (moins de 500 caractères) pour la première ligne de l'écran. Facultatifs, ajoutés par
scripts/enrich_lectures.py : `texte_auteur` (résumé complet de l'auteur recopié de la notice, 3 600 caractères au plus, avec sa
`texte_source`) et `mots_cles` (liste de textes).

Usage : python scripts/build_lectures.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_content as bc  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "lectures" / "lectures.json"
CIBLE = RACINE / "site" / "data" / "lectures" / "lectures.json"
URL = re.compile(r"^https://\S+$")
TYPES = {"article", "rapport", "presse"}


def non_vide(x):
    return isinstance(x, str) and bool(x.strip())


def valider(d):
    err = []
    if not isinstance(d, dict) or not isinstance(d.get("lectures"), list):
        return ["lectures : fichier invalide"]
    themes = d.get("themes") or {}
    if not themes:
        err.append("lectures : thèmes manquants")
    vus = set()
    for i, l in enumerate(d["lectures"]):
        nom = l.get("id") or f"#{i}"
        if not non_vide(l.get("id")) or l["id"] in vus:
            err.append(f"{nom} : identifiant manquant ou en double")
        vus.add(l.get("id"))
        for k in ("titre", "auteurs", "source", "resume"):
            if not non_vide(l.get(k)):
                err.append(f"{nom} : {k} manquant")
        if l.get("theme") not in themes:
            err.append(f"{nom} : thème inconnu")
        if l.get("type") not in TYPES:
            err.append(f"{nom} : type inconnu")
        if not isinstance(l.get("annee"), int) or not 2020 <= l["annee"] <= 2026:
            err.append(f"{nom} : année hors de 2020-2026")
        for k in ("url", "doi"):
            if k in l and not URL.match(str(l[k])):
                err.append(f"{nom} : {k} doit être une adresse https")
        if "url" not in l:
            err.append(f"{nom} : url manquante")
        if non_vide(l.get("resume")) and len(l["resume"]) > 500:
            err.append(f"{nom} : résumé trop long ({len(l['resume'])} caractères, 500 au plus)")
        if "texte_auteur" in l:
            if not non_vide(l["texte_auteur"]) or len(l["texte_auteur"]) > 3600:
                err.append(f"{nom} : texte_auteur vide ou trop long (3 600 caractères au plus)")
            if not non_vide(l.get("texte_source")):
                err.append(f"{nom} : texte_source manquant (d'où vient le résumé de l'auteur ?)")
        if "mots_cles" in l and (not isinstance(l["mots_cles"], list) or not all(non_vide(k) for k in l["mots_cles"])):
            err.append(f"{nom} : mots_cles doit être une liste de textes")
        if "pages" in l and (not isinstance(l["pages"], int) or l["pages"] <= 0):
            err.append(f"{nom} : pages doit être un entier positif")
    for cle in themes:
        if not any(l.get("theme") == cle for l in d["lectures"]):
            err.append(f"thème sans lecture : {cle}")
    return err


def construire(source=SOURCE, cible=CIBLE):
    d = json.loads(source.read_text(encoding="utf-8"))
    err = valider(d)
    if err:
        return err
    sortie = {"themes": d["themes"], "lectures": d["lectures"]}
    cible.parent.mkdir(parents=True, exist_ok=True)
    bc.ecrire(cible, json.dumps(sortie, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Lectures publiées dans site/data/lectures/")
