"""Valide les kits du curriculum (content/fondations/*.json) et les publie dans site/data/fondations/.

Un kit = une fiche (≈ une page), 12 à 30 cartes, une ressource externe, trois questions à débattre.
Règles anti-hallucination : au moins 2 sources distinctes par kit (les cartes héritent des sources du kit
sauf si elles en déclarent d'autres), date de revue, faits périssables marqués, identifiants de cartes préfixés
par l'identifiant du kit.

Usage : python scripts/build_fondations.py
"""
import datetime
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_content as bc  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "fondations"
CIBLE = RACINE / "site" / "data" / "fondations"
ID_RE = re.compile(r"^[a-z]\d{2}-[a-z0-9]+(-[a-z0-9]+)*$")
MIN_CARTES, MAX_CARTES = 12, 30


def _sources_ok(src, quoi):
    err, urls = [], set()
    if not isinstance(src, list):
        return [f"{quoi} : sources absentes"]
    for s in src:
        if not isinstance(s, dict) or not s.get("titre") or not re.match(r"^https?://\S+$", str(s.get("url", ""))):
            err.append(f"{quoi} : source mal formée {s!r}")
        else:
            urls.add(s["url"].rstrip("/"))
    if len(urls) < 2:
        err.append(f"{quoi} : moins de 2 sources distinctes")
    return err


def valider_kit(kit, parcours_ids, ids_vus=None):
    """Renvoie la liste des erreurs d'un kit (vide si valide)."""
    ids_vus = set() if ids_vus is None else ids_vus
    kid = kit.get("id", "?")
    err = []
    if not isinstance(kit.get("id"), str) or not ID_RE.match(kit["id"]):
        err.append(f"{kid} : identifiant invalide (attendu a01-sujet)")
    elif kit["id"][0].upper() != str(kit.get("parcours")):
        err.append(f"{kid} : l'identifiant doit commencer par la lettre du parcours")
    if kit.get("parcours") not in parcours_ids:
        err.append(f"{kid} : parcours inconnu {kit.get('parcours')!r}")
    for cle in ("titre", "accroche"):
        if not isinstance(kit.get(cle), str) or not kit[cle].strip():
            err.append(f"{kid} : champ {cle} manquant")
    if not isinstance(kit.get("ordre"), int):
        err.append(f"{kid} : « ordre » doit être un entier")
    if not isinstance(kit.get("duree_min"), int) or not 30 <= kit["duree_min"] <= 240:
        err.append(f"{kid} : « duree_min » entre 30 et 240")
    try:
        datetime.date.fromisoformat(str(kit.get("revu")))
    except ValueError:
        err.append(f"{kid} : date de revue invalide {kit.get('revu')!r}")
    if not isinstance(kit.get("perissable"), bool):
        err.append(f"{kid} : « perissable » doit être vrai ou faux")
    elif kit["perissable"] and not str(kit.get("perissable_note", "")).strip():
        err.append(f"{kid} : kit périssable sans « perissable_note »")

    fiche = kit.get("fiche")
    if not isinstance(fiche, list) or len(fiche) < 3:
        err.append(f"{kid} : la fiche doit avoir au moins 3 sections")
    else:
        for i, s in enumerate(fiche):
            if not isinstance(s, dict) or not s.get("titre") or not isinstance(s.get("paragraphes"), list) or not s["paragraphes"]:
                err.append(f"{kid} : section {i + 1} de la fiche incomplète")
            elif not all(isinstance(p, str) and p.strip() for p in s["paragraphes"]):
                err.append(f"{kid} : section {i + 1} contient un paragraphe vide")
        mots = sum(len(p.split()) for s in fiche if isinstance(s, dict) for p in s.get("paragraphes", []) if isinstance(p, str))
        if not 250 <= mots <= 1400:
            err.append(f"{kid} : la fiche fait {mots} mots (entre 250 et 1 400 attendus)")

    err += _sources_ok(kit.get("sources"), f"{kid} (kit)")
    res = kit.get("ressource")
    if not isinstance(res, dict) or not res.get("titre") or not re.match(r"^https?://\S+$", str(res.get("url", ""))) \
            or not res.get("type") or not res.get("pourquoi"):
        err.append(f"{kid} : ressource externe incomplète (titre, url, type, pourquoi)")
    deb = kit.get("debat")
    if not isinstance(deb, list) or len(deb) != 3 or not all(isinstance(q, str) and q.strip().endswith("?") for q in deb):
        err.append(f"{kid} : exactement 3 questions à débattre, chacune terminée par « ? »")

    cartes = kit.get("cartes")
    if not isinstance(cartes, list) or not MIN_CARTES <= len(cartes) <= MAX_CARTES:
        err.append(f"{kid} : {len(cartes) if isinstance(cartes, list) else 0} cartes ({MIN_CARTES} à {MAX_CARTES} attendues)")
    else:
        for c in cartes:
            cid = c.get("id", "?")
            if not isinstance(c.get("id"), str) or not c["id"].startswith(kid + "-") or not bc.ID_RE.match(c["id"]):
                err.append(f"{cid} : identifiant invalide (attendu {kid}-xx)")
            if cid in ids_vus:
                err.append(f"{cid} : identifiant en double")
            ids_vus.add(cid)
            for cle in ("recto", "verso"):
                if not isinstance(c.get(cle), str) or not c[cle].strip():
                    err.append(f"{cid} : {cle} vide")
            if "sources" in c:
                err += _sources_ok(c["sources"], cid)
            if "perissable" in c and not isinstance(c["perissable"], bool):
                err.append(f"{cid} : « perissable » doit être vrai ou faux")
    return err


def etendre(kit):
    """Applique les valeurs héritées (sources, revue, caractère périssable) à chaque carte."""
    k = json.loads(json.dumps(kit))
    for c in k["cartes"]:
        c.setdefault("sources", k["sources"])
        c.setdefault("revu", k["revu"])
        c.setdefault("perissable", k["perissable"])
    return k


def construire(source=SOURCE, cible=CIBLE):
    parcours = json.loads((source / "parcours.json").read_text(encoding="utf-8"))
    pids = {p["id"] for p in parcours}
    kits, erreurs, ids = [], [], set()
    for f in sorted(source.glob("[a-z][0-9][0-9]-*.json")):
        k = json.loads(f.read_text(encoding="utf-8"))
        if f.stem != k.get("id"):
            erreurs.append(f"{f.name} : le nom du fichier doit être l'identifiant du kit")
        erreurs += valider_kit(k, pids, ids)
        kits.append(k)
    ordres = {}
    for k in kits:
        ordres.setdefault((k.get("parcours"), k.get("ordre")), []).append(k.get("id"))
    erreurs += [f"ordre en double dans le parcours {p} : {v}" for (p, o), v in ordres.items() if len(v) > 1]
    if erreurs:
        return erreurs
    cible.mkdir(parents=True, exist_ok=True)
    for f in cible.glob("*.json"):
        f.unlink()
    index = []
    for k in sorted(kits, key=lambda k: (k["parcours"], k["ordre"])):
        e = etendre(k)
        bc.ecrire(cible / f"{k['id']}.json", json.dumps(e, ensure_ascii=False, indent=1))
        index.append({"id": k["id"], "parcours": k["parcours"], "ordre": k["ordre"], "titre": k["titre"], "accroche": k["accroche"],
                      "duree_min": k["duree_min"], "nombre_cartes": len(k["cartes"]), "perissable": k["perissable"], "revu": k["revu"],
                      "fichier": f"{k['id']}.json"})
    bc.ecrire(cible / "index.json", json.dumps({"parcours": parcours, "kits": index}, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Kits publiés dans site/data/fondations/")
