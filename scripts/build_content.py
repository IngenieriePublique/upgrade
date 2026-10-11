"""Valide les paquets de cartes de content/cartes/*.json et les publie dans site/data/cartes/.
Règles (anti-hallucination) : identifiants uniques et préfixés par le paquet, recto et verso non vides,
au moins 2 sources http(s) distinctes par carte, date de revue ISO, marque « périssable » booléenne.

Usage : python scripts/build_content.py
"""
import datetime
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def valider_paquet(deck, ids_vus=None):
    """Renvoie la liste des erreurs d'un paquet (vide si valide)."""
    ids_vus = set() if ids_vus is None else ids_vus
    err = []
    pid = deck.get("id", "")
    if not ID_RE.match(pid):
        err.append(f"paquet : identifiant invalide {pid!r}")
    for cle in ("titre", "description"):
        if not isinstance(deck.get(cle), str) or not deck[cle].strip():
            err.append(f"{pid} : champ {cle} manquant")
    cartes = deck.get("cartes")
    if not isinstance(cartes, list) or not cartes:
        return err + [f"{pid} : aucune carte"]
    for c in cartes:
        cid = c.get("id", "?")
        if not isinstance(c.get("id"), str) or not ID_RE.match(c["id"]) or not c["id"].startswith(pid + "-"):
            err.append(f"{cid} : identifiant invalide (attendu {pid}-xxx)")
        if cid in ids_vus:
            err.append(f"{cid} : identifiant en double")
        ids_vus.add(cid)
        for cle in ("recto", "verso"):
            if not isinstance(c.get(cle), str) or not c[cle].strip():
                err.append(f"{cid} : {cle} vide")
        src = c.get("sources")
        if not isinstance(src, list):
            err.append(f"{cid} : sources absentes")
        else:
            urls = set()
            for s in src:
                if not isinstance(s, dict) or not s.get("titre") or not re.match(r"^https?://\S+$", str(s.get("url", ""))):
                    err.append(f"{cid} : source mal formée {s!r}")
                else:
                    urls.add(s["url"].rstrip("/"))
            if len(urls) < 2:
                err.append(f"{cid} : moins de 2 sources distinctes")
        try:
            datetime.date.fromisoformat(str(c.get("revu")))
        except ValueError:
            err.append(f"{cid} : date de revue invalide {c.get('revu')!r}")
        if not isinstance(c.get("perissable"), bool):
            err.append(f"{cid} : « perissable » doit être vrai ou faux")
    return err


def ecrire(chemin, texte):
    """Écrit en UTF-8 avec des fins de ligne LF, sur tous les systèmes."""
    with open(chemin, "w", encoding="utf-8", newline="\n") as f:
        f.write(texte + "\n")


def construire(source=RACINE / "content" / "cartes", cible=RACINE / "site" / "data" / "cartes"):
    decks, erreurs, ids = [], [], set()
    for f in sorted(source.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        erreurs += valider_paquet(d, ids)
        decks.append(d)
    if erreurs:
        return erreurs
    cible.mkdir(parents=True, exist_ok=True)
    index = []
    for d in decks:
        ecrire(cible / f"{d['id']}.json", json.dumps({"cartes": d["cartes"]}, ensure_ascii=False, indent=1))
        index.append({"id": d["id"], "titre": d["titre"], "description": d["description"],
                      "fichier": f"{d['id']}.json", "nombre": len(d["cartes"])})
    ecrire(cible / "index.json", json.dumps({"paquets": index}, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Paquets publiés dans site/data/cartes/")
