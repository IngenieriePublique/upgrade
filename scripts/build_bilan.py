"""Valide le contenu du bilan (content/bilan/bilan.json) et le publie dans site/data/bilan/bilan.json.

Règles : six repères chiffrés à trois mois ; une revue hebdomadaire (5 étapes, 5 questions) ; un audit trimestriel
(6 modules reliés aux blocs de « Aujourd'hui », 4 décisions, 4 questions) ; le guide anti-réseaux (au moins 5 besoins
avec un substitut et un lien interne, au moins 3 outils de blocage dont chacun a des étapes ; tout outil externe
a au moins 2 sources distinctes ou déclare « sans source externe ») et une page « à vérifier » honnête.

Usage : python scripts/build_bilan.py
"""
import datetime
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_content as bc  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "bilan" / "bilan.json"
CIBLE = RACINE / "site" / "data" / "bilan" / "bilan.json"
URL = re.compile(r"^https?://\S+$")
LIEN_INTERNE = re.compile(r"^#/[a-z0-9/?=&_-]*$")
BLOCS = {"brief", "cartes", "territoires", "profond", "dictee", "mot"}
CLES_OBJECTIFS = ["duree_mois", "jours_tenus_sur_28", "kits_publies", "livrables_portfolio", "entretiens_information",
                  "reduction_reseaux_pct", "territoires_niveau"]


def non_vide(x):
    return isinstance(x, str) and bool(x.strip())


def valider(b):
    err = []
    if not isinstance(b, dict):
        return ["bilan : fichier invalide"]
    try:
        datetime.date.fromisoformat(str(b.get("revu")))
    except ValueError:
        err.append("bilan : date de revue invalide")

    o = b.get("objectifs") or {}
    if not non_vide(o.get("avertissement")):
        err.append("objectifs : avertissement manquant")
    for k in CLES_OBJECTIFS:
        if not isinstance(o.get(k), int) or o[k] <= 0:
            err.append(f"objectifs : {k} doit être un entier positif")
    if isinstance(o.get("reduction_reseaux_pct"), int) and not 10 <= o["reduction_reseaux_pct"] <= 100:
        err.append("objectifs : réduction des réseaux entre 10 et 100 %")
    if o.get("territoires_niveau") not in (1, 2, 3):
        err.append("objectifs : niveau de territoire entre 1 et 3")

    r = b.get("revue") or {}
    etapes, questions = r.get("etapes"), r.get("questions")
    if not isinstance(etapes, list) or len(etapes) != 5:
        err.append("revue : 5 étapes attendues")
    else:
        ids = [e.get("id") for e in etapes]
        if ids != ["chiffres", "ecran", "questions", "sauvegarde", "intention"]:
            err.append("revue : étapes attendues chiffres, ecran, questions, sauvegarde, intention")
        for e in etapes:
            if not non_vide(e.get("titre")) or not non_vide(e.get("texte")):
                err.append(f"revue : étape {e.get('id')} sans titre ou texte")
    if not isinstance(questions, list) or len(questions) != 5 or len({q.get("id") for q in questions}) != 5:
        err.append("revue : 5 questions aux identifiants distincts")
    else:
        for q in questions:
            if not non_vide(q.get("label")) or not q["label"].strip().endswith("?") or not non_vide(q.get("aide")):
                err.append(f"revue : question {q.get('id')} : libellé terminé par « ? » et aide attendus")
    if not isinstance(r.get("duree_min"), int):
        err.append("revue : durée manquante")

    a = b.get("audit") or {}
    mods = a.get("modules")
    if not non_vide(a.get("avertissement")):
        err.append("audit : avertissement manquant")
    if not isinstance(mods, list) or len(mods) != 6:
        err.append("audit : 6 modules attendus")
    else:
        if {m.get("bloc") for m in mods} != BLOCS:
            err.append("audit : les modules doivent couvrir les blocs " + ", ".join(sorted(BLOCS)))
        for m in mods:
            if not non_vide(m.get("titre")) or not non_vide(m.get("question")) or not non_vide(m.get("id")):
                err.append(f"audit : module {m.get('id')} incomplet")
    dec = a.get("decisions")
    if not isinstance(dec, list) or [d.get("id") for d in dec] != ["garder", "reduire", "supprimer", "approfondir"]:
        err.append("audit : décisions attendues garder, reduire, supprimer, approfondir")
    qa = a.get("questions")
    if not isinstance(qa, list) or len(qa) != 4 or not all(non_vide(q.get("label")) and non_vide(q.get("aide")) for q in qa):
        err.append("audit : 4 questions avec libellé et aide")

    s = b.get("reseaux") or {}
    for k in ("avertissement", "principe", "mesure"):
        if not non_vide(s.get(k)):
            err.append(f"réseaux : champ {k} manquant")
    besoins = s.get("besoins")
    if not isinstance(besoins, list) or len(besoins) < 5:
        err.append("réseaux : au moins 5 besoins")
    else:
        for x in besoins:
            if not non_vide(x.get("besoin")) or not non_vide(x.get("substitut")) or not LIEN_INTERNE.match(str(x.get("ou", ""))):
                err.append(f"réseaux : besoin mal formé {x.get('besoin')!r} (besoin, substitut, lien interne #/…)")
    blocage = s.get("blocage")
    if not isinstance(blocage, list) or len(blocage) < 3:
        err.append("réseaux : au moins 3 outils de blocage")
    else:
        ids = set()
        for x in blocage:
            i = x.get("id", "?")
            if i in ids:
                err.append(f"réseaux : outil en double {i}")
            ids.add(i)
            for k in ("outil", "plateforme", "ce_que_ca_fait", "a_verifier"):
                if not non_vide(x.get(k)):
                    err.append(f"réseaux {i} : champ {k} manquant")
            if not isinstance(x.get("etapes"), list) or len(x["etapes"]) < 3:
                err.append(f"réseaux {i} : au moins 3 étapes")
            src = x.get("sources")
            sans_source = "sans source" in str(x.get("outil", "")).lower()
            if not sans_source:
                urls = set()
                for e in src if isinstance(src, list) else []:
                    if not non_vide(e.get("titre")) or not URL.match(str(e.get("url", ""))):
                        err.append(f"réseaux {i} : source mal formée {e!r}")
                    else:
                        urls.add(e["url"].rstrip("/"))
                if len(urls) < 2:
                    err.append(f"réseaux {i} : moins de 2 sources distinctes")
    sa = s.get("si_alors") or {}
    if not non_vide(sa.get("titre")) or not non_vide(sa.get("texte")) or not isinstance(sa.get("champs"), list) or len(sa["champs"]) < 3:
        err.append("réseaux : bloc « si… alors » incomplet (3 champs au moins)")
    return err


def construire(source=SOURCE, cible=CIBLE):
    b = json.loads(source.read_text(encoding="utf-8"))
    err = valider(b)
    if err:
        return err
    cible.parent.mkdir(parents=True, exist_ok=True)
    bc.ecrire(cible, json.dumps(b, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Bilan publié dans site/data/bilan/")
