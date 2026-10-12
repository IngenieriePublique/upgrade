"""Lit les erreurs signalées dans une sauvegarde Upgrade et affiche les cartes concernées (recto, verso, sources).

L'utilisateur signale une carte douteuse avec le bouton « signaler une erreur » ; la liste des signalements est dans la
sauvegarde JSON (meta.flags). Ce script la croise avec le contenu du dépôt pour ouvrir une séance de correction : relire la
source, corriger le fichier de `content/`, puis relancer le script de construction.

La sauvegarde est un fichier personnel hors dépôt : on lui passe son chemin, on ne la copie pas dans le dépôt.

Usage : python -I scripts/signalements.py chemin/vers/sauvegarde.json
"""
import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def cartes_du_depot(racine=RACINE):
    """Dictionnaire { identifiant de carte : (fichier, carte, sources de repli) } pour toutes les cartes écrites dans content/."""
    index = {}
    dossiers = [racine / "content" / "cartes", racine / "content" / "fondations", racine / "content" / "dictees"]
    for d in dossiers:
        for f in sorted(d.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except ValueError:
                continue
            cartes = data.get("cartes") if isinstance(data, dict) else None
            if not isinstance(cartes, list):
                continue
            commun = data.get("sources", []) if isinstance(data, dict) else []
            for c in cartes:
                if isinstance(c, dict) and isinstance(c.get("id"), str):
                    index[c["id"]] = (f.relative_to(racine).as_posix(), c, c.get("sources") or commun)
    return index


def signalements(sauvegarde):
    flags = (sauvegarde.get("meta") or {}).get("flags") or []
    return sorted((f for f in flags if isinstance(f, dict) and isinstance(f.get("cardId"), str)), key=lambda f: f.get("ts", 0))


def rapport(sauvegarde, index):
    flags = signalements(sauvegarde)
    if not flags:
        return "Aucun signalement dans cette sauvegarde."
    out = [f"{len(flags)} signalement(s)", ""]
    for f in flags:
        cid = f["cardId"]
        trouve = index.get(cid)
        if not trouve:
            out.append(f"- {cid} : carte non écrite dans content/ (carte calculée, par exemple un élément de Territoires : voir scripts/geo_lib.py et content/territoires/)")
            continue
        fichier, c, sources = trouve
        out.append(f"- {cid}  ({fichier})")
        out.append(f"    Recto : {c.get('recto')}")
        out.append(f"    Verso : {c.get('verso')}")
        for s in sources:
            out.append(f"    Source : {s.get('titre')} {s.get('url')}")
        out.append(f"    Revu le : {c.get('revu', 'non daté')}")
    return "\n".join(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    try:
        sauv = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"Impossible de lire la sauvegarde : {e}")
        sys.exit(1)
    if sauv.get("format") != "upgrade-sauvegarde":
        print("Ce fichier n'est pas une sauvegarde Upgrade (format attendu : upgrade-sauvegarde).")
        sys.exit(1)
    print(rapport(sauv, cartes_du_depot()))
