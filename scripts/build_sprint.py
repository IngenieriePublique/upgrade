"""Valide le contenu du sprint candidature et le publie dans site/data/.

- content/radar/employeurs.json  -> site/data/radar/employeurs.json   (radar employeurs et portails d'offres)
- content/radar/note-carriere.json -> site/data/radar/note-carriere.json (note concours / contractuel)
- content/oral/questions.json    -> site/data/oral/questions.json     (banque de questions)
- content/oral/gabarits.json     -> site/data/oral/gabarits.json      (pitchs, histoires STAR, entretien d'information)

Règles (anti-hallucination) : chaque employeur et chaque portail cite au moins 2 sources distinctes (http/https),
porte une date de revue ISO et une marque « perissable » ; identifiants uniques ; textes non vides.

Usage : python scripts/build_sprint.py
"""
import datetime
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
URL_RE = re.compile(r"^https?://\S+$")
ECHELONS = {"national", "régional", "local"}
PRIORITES = {"A", "B", "C"}
MIN_EMPLOYEURS = 30
MIN_QUESTIONS = 80


def ecrire(chemin, texte):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with open(chemin, "w", encoding="utf-8", newline="\n") as f:
        f.write(texte + "\n")


def texte(v):
    return isinstance(v, str) and bool(v.strip())


def verifier_sources(nom, sources, minimum=2):
    err, urls = [], set()
    if not isinstance(sources, list):
        return [f"{nom} : sources absentes"]
    for s in sources:
        if not isinstance(s, dict) or not texte(s.get("titre")) or not URL_RE.match(str(s.get("url", ""))):
            err.append(f"{nom} : source mal formée {s!r}")
        else:
            urls.add(s["url"].rstrip("/"))
    if len(urls) < minimum:
        err.append(f"{nom} : moins de {minimum} sources distinctes")
    return err


def verifier_revu(nom, o):
    err = []
    try:
        datetime.date.fromisoformat(str(o.get("revu")))
    except ValueError:
        err.append(f"{nom} : date de revue invalide {o.get('revu')!r}")
    if not isinstance(o.get("perissable"), bool):
        err.append(f"{nom} : « perissable » doit être vrai ou faux")
    return err


def valider_employeurs(d, minimum=MIN_EMPLOYEURS):
    err, ids = [], set()
    for p in d.get("portails", []):
        pid = p.get("id", "?")
        if not ID_RE.match(str(p.get("id", ""))) or pid in ids:
            err.append(f"portail {pid} : identifiant invalide ou en double")
        ids.add(pid)
        for cle in ("titre", "description"):
            if not texte(p.get(cle)):
                err.append(f"portail {pid} : {cle} vide")
        if not URL_RE.match(str(p.get("url", ""))):
            err.append(f"portail {pid} : url invalide")
        err += verifier_sources(f"portail {pid}", p.get("sources"))
    liste = d.get("employeurs")
    if not isinstance(liste, list):
        return err + ["employeurs : liste absente"]
    if len(liste) < minimum:
        err.append(f"employeurs : {len(liste)} fiches, au moins {minimum} attendues")
    for e in liste:
        eid = e.get("id", "?")
        if not ID_RE.match(str(e.get("id", ""))) or eid in ids:
            err.append(f"{eid} : identifiant invalide ou en double")
        ids.add(eid)
        for cle in ("nom", "type", "mission", "pourquoi"):
            if not texte(e.get(cle)):
                err.append(f"{eid} : {cle} vide")
        if e.get("echelon") not in ECHELONS:
            err.append(f"{eid} : échelon invalide {e.get('echelon')!r}")
        if e.get("priorite") not in PRIORITES:
            err.append(f"{eid} : priorité invalide {e.get('priorite')!r}")
        for cle in ("lieu", "a_verifier", "sigle"):
            if not isinstance(e.get(cle, ""), str):
                err.append(f"{eid} : {cle} doit être un texte")
        if not isinstance(e.get("voies", []), list):
            err.append(f"{eid} : voies doit être une liste")
        cand = e.get("candidater")
        if not isinstance(cand, list) or not cand:
            err.append(f"{eid} : aucune adresse pour candidater")
        else:
            for c in cand:
                if not isinstance(c, dict) or not texte(c.get("titre")) or not URL_RE.match(str(c.get("url", ""))):
                    err.append(f"{eid} : adresse de candidature mal formée {c!r}")
        err += verifier_sources(eid, e.get("sources"))
        err += verifier_revu(eid, e)
    err += verifier_revu("fichier radar", {"revu": d.get("revu"), "perissable": True})
    return err


def valider_questions(d, minimum=MIN_QUESTIONS):
    err = []
    cats = {c.get("id") for c in d.get("categories", [])}
    if len(cats) != len(d.get("categories", [])) or not cats:
        err.append("catégories : identifiants en double ou absents")
    qs = d.get("questions")
    if not isinstance(qs, list) or len(qs) < minimum:
        err.append(f"questions : au moins {minimum} attendues")
        qs = qs if isinstance(qs, list) else []
    vus = set()
    for q in qs:
        qid = q.get("id", "?")
        if not ID_RE.match(str(q.get("id", ""))) or qid in vus:
            err.append(f"{qid} : identifiant invalide ou en double")
        vus.add(qid)
        if q.get("categorie") not in cats:
            err.append(f"{qid} : catégorie inconnue {q.get('categorie')!r}")
        for cle in ("question", "cherche", "piste"):
            if not texte(q.get(cle)):
                err.append(f"{qid} : {cle} vide")
    for c in cats:
        if not any(q.get("categorie") == c for q in qs):
            err.append(f"catégorie {c} : aucune question")
    if not texte(d.get("avertissement")):
        err.append("avertissement manquant")
    err += verifier_sources("questions", d.get("sources"))
    return err


def valider_gabarits(d):
    err = []
    pitchs = d.get("pitchs")
    if not isinstance(pitchs, list) or len(pitchs) != 3:
        err.append("pitchs : trois formats attendus (30 s, 90 s, 3 min)")
        pitchs = pitchs if isinstance(pitchs, list) else []
    for p in pitchs:
        pid = p.get("id", "?")
        if not ID_RE.match(str(p.get("id", ""))) or not isinstance(p.get("secondes"), int) or p["secondes"] <= 0:
            err.append(f"pitch {pid} : identifiant ou durée invalide")
        if not p.get("champs"):
            err.append(f"pitch {pid} : aucun champ")
        for c in p.get("champs", []):
            if not texte(c.get("id")) or not texte(c.get("label")) or not texte(c.get("aide")):
                err.append(f"pitch {pid} : champ mal formé {c!r}")
    star = d.get("star", {})
    if [c.get("id") for c in star.get("champs", [])] != ["situation", "tache", "action", "resultat", "apprentissage"]:
        err.append("star : champs attendus situation, tache, action, resultat, apprentissage")
    slots = star.get("emplacements", [])
    if len(slots) != 8 or len({s.get("id") for s in slots}) != 8:
        err.append("star : huit emplacements d'histoire attendus")
    err += verifier_sources("star", star.get("sources"))
    info = d.get("entretien_info", {})
    for cle in ("titre", "principe", "message_modele"):
        if not texte(info.get(cle)):
            err.append(f"entretien_info : {cle} vide")
    if not info.get("etapes"):
        err.append("entretien_info : étapes absentes")
    err += verifier_sources("entretien_info", info.get("sources"))
    return err


def valider_note(d):
    err, ids = [], set()
    for cle in ("titre", "resume"):
        if not texte(d.get(cle)):
            err.append(f"note : {cle} vide")
    err += verifier_revu("note", d)
    secs = d.get("sections")
    if not isinstance(secs, list) or not secs:
        return err + ["note : aucune section"]
    for s in secs:
        sid = s.get("id", "?")
        if not ID_RE.match(str(s.get("id", ""))) or sid in ids:
            err.append(f"section {sid} : identifiant invalide ou en double")
        ids.add(sid)
        if not texte(s.get("titre")):
            err.append(f"section {sid} : titre vide")
        if not (s.get("paragraphes") or s.get("puces") or s.get("tableau")):
            err.append(f"section {sid} : aucun contenu")
        t = s.get("tableau")
        if t and any(len(l) != len(t.get("entetes", [])) for l in t.get("lignes", [])):
            err.append(f"section {sid} : lignes du tableau de longueur incorrecte")
        if not s.get("avis"):  # une section factuelle doit citer ses sources
            err += verifier_sources(f"section {sid}", s.get("sources"))
    return err


FICHIERS = [
    ("radar/employeurs.json", valider_employeurs),
    ("radar/note-carriere.json", valider_note),
    ("oral/questions.json", valider_questions),
    ("oral/gabarits.json", valider_gabarits),
]


def construire(source=RACINE / "content", cible=RACINE / "site" / "data"):
    erreurs, lus = [], []
    for rel, valider in FICHIERS:
        try:
            d = json.loads((source / rel).read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            erreurs.append(f"{rel} : illisible ({e})")
            continue
        erreurs += [f"{rel} : {x}" for x in valider(d)]
        lus.append((rel, d))
    if erreurs:
        return erreurs
    for rel, d in lus:
        ecrire(cible / rel, json.dumps(d, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Contenu du sprint publié dans site/data/radar/ et site/data/oral/")
