"""Fabrique content/dictees/dictees.json à partir de la sélection (content/dictees/selection.json) et des textes
téléchargés par fetch_dictees.py / fetch_text.py dans data_local/dictees/ (hors dépôt).

Usage : python -I scripts/extract_dictees.py
Le résultat est versionné : l'intégration continue ne télécharge rien, elle valide seulement (build_dictees.py).
"""
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dictee_lib as d  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SELECTION = RACINE / "content" / "dictees" / "selection.json"
TEXTES = RACINE / "data_local" / "dictees"
SORTIE = RACINE / "content" / "dictees" / "dictees.json"
REVU = "2026-10-12"

LICENCE_WIKISOURCE = "Œuvre du domaine public ; transcription Wikisource sous licence CC BY-SA 4.0."
LICENCE_OFFICIEL = "Texte officiel (Conseil constitutionnel), réutilisation libre ; graphie « œuvre » modernisée."


def charger(cle):
    brut = (TEXTES / f"{cle}.txt").read_text(encoding="utf-8")
    lignes = [l for l in brut.split("\n") if not l.lstrip().startswith("#")]
    t = d.nettoyer("\n".join(lignes))
    return re.sub(r"\boeuvre", "œuvre", t)


def lien_source(info):
    if "wikisource" in info:
        return "https://fr.wikisource.org/wiki/" + urllib.parse.quote(info["wikisource"].replace(" ", "_"), safe="/_:(),’")
    return info["url"]


def construire():
    sel = json.loads(SELECTION.read_text(encoding="utf-8"))
    textes, dictees, erreurs = {}, [], []
    for i, p in enumerate(sel["passages"], 1):
        info = sel["sources"][p["source"]]
        if p["source"] not in textes:
            textes[p["source"]] = charger(p["source"])
        try:
            texte = d.extraire(textes[p["source"]], d.nettoyer(p["debut"]), p["mots"])
        except ValueError as e:
            erreurs.append(f"{p['titre']} : {e}")
            continue
        dictees.append({
            "id": f"d{i:02d}",
            "titre": p["titre"],
            "auteur": info["auteur"],
            "oeuvre": info["oeuvre"],
            "annee": info["annee"],
            "niveau": p["niveau"],
            "texte": texte,
            "mots": d.nb_mots(texte),
            "profil": d.profil(texte),
            "segments": d.decouper(texte),
            "fins_alinea": d.fins_alinea(texte),
            "source": {"titre": ("Texte officiel : " if info.get("officiel") else "Wikisource : ") + info["oeuvre"],
                       "url": lien_source(info)},
            "licence": LICENCE_OFFICIEL if info.get("officiel") else LICENCE_WIKISOURCE,
            "revu": REVU,
        })
    return dictees, erreurs


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    dictees, erreurs = construire()
    for e in erreurs:
        print("ERREUR", e)
    if erreurs:
        sys.exit(1)
    with open(SORTIE, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps({"dictees": dictees}, ensure_ascii=False, indent=1) + "\n")
    for x in dictees:
        print(f"{x['id']} n{x['niveau']} {x['mots']:>3} mots  {x['titre']}")
    print(f"{len(dictees)} dictées -> {SORTIE.relative_to(RACINE)}")
