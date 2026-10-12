"""Valide l'atelier d'écriture (content/atelier/*.json) et le publie dans site/data/atelier/.

Règles (anti-hallucination) :
- grille : 7 critères, 4 niveaux chacun, au moins 2 sources distinctes, date de revue ;
- notes : un corpus de 3 documents aux adresses distinctes (organisme, date, résumé, limite) ; une note modèle dont
  chaque renvoi [Dn] existe, dont chaque document est cité, dont la longueur est dans la fourchette annoncée et
  dont **chaque nombre figure dans le corpus, la commande ou la liste des calculs déclarés** ;
- exercices courts : même contrôle des nombres, type connu, source http ;
- portfolio : au moins 3 projets, des données avec adresse et licence, des étapes (dont « relire » et « publier »),
  des kits existants.

Usage : python scripts/build_atelier.py
"""
import datetime
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_content as bc  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "atelier"
CIBLE = RACINE / "site" / "data" / "atelier"
FONDATIONS = RACINE / "content" / "fondations"
URL = re.compile(r"^https?://\S+$")
ID_NOTE = re.compile(r"^n\d{2}$")
ID_COURT = re.compile(r"^c\d{2}$")
ID_PROJET = re.compile(r"^p\d{1,2}$")
CRITERES = ["probleme", "plan", "hierarchisation", "chiffres", "recommandation", "risques", "style"]
TYPES_COURTS = ["titres", "dix-lignes", "une-page", "graphique"]
NOMBRE = re.compile(r"\d+(?:[   ]\d{3})*(?:,\d+)?")
RENVOI = re.compile(r"\[(D\d(?:\s*,\s*D\d)*)\]")


def nombres(texte):
    """Ensemble des nombres d'un texte (« 1 225,9 » devient « 1225,9 ») ; ignore les renvois [D1, D2]."""
    t = RENVOI.sub(" ", texte)
    t = re.sub(r"\bD\d\b", " ", t)
    return {re.sub(r"[   ]", "", m.group()) for m in NOMBRE.finditer(t)}


def texte_de(x):
    """Tous les textes d'une structure JSON, concaténés."""
    if isinstance(x, str):
        return x
    if isinstance(x, list):
        return " ".join(texte_de(i) for i in x)
    if isinstance(x, dict):
        return " ".join(texte_de(v) for v in x.values())
    return ""


def mots(texte):
    return len(re.findall(r"[\wÀ-ÿ’'-]+", texte))


def date_ok(v):
    try:
        datetime.date.fromisoformat(str(v))
        return True
    except ValueError:
        return False


def sources_ok(src, minimum, ident, err):
    urls = set()
    if not isinstance(src, list):
        err.append(f"{ident} : sources absentes")
        return
    for s in src:
        if not isinstance(s, dict) or not s.get("titre") or not URL.match(str(s.get("url", ""))):
            err.append(f"{ident} : source mal formée {s!r}")
        else:
            urls.add(s["url"].rstrip("/"))
    if len(urls) < minimum:
        err.append(f"{ident} : moins de {minimum} sources distinctes")


def valider_grille(g):
    err = []
    if not date_ok(g.get("revu")):
        err.append("grille : date de revue invalide")
    for cle in ("titre", "avertissement"):
        if not isinstance(g.get(cle), str) or not g[cle].strip():
            err.append(f"grille : champ {cle} manquant")
    ech = g.get("echelle")
    if not isinstance(ech, list) or [e.get("niveau") for e in ech] != [0, 1, 2, 3]:
        err.append("grille : l'échelle doit comporter les niveaux 0, 1, 2, 3")
    crit = g.get("criteres")
    if not isinstance(crit, list) or [c.get("id") for c in crit] != CRITERES:
        err.append("grille : les critères doivent être exactement " + ", ".join(CRITERES))
        return err
    for c in crit:
        for cle in ("titre", "question"):
            if not isinstance(c.get(cle), str) or not c[cle].strip():
                err.append(f"grille {c['id']} : champ {cle} manquant")
        niv = c.get("niveaux")
        if not isinstance(niv, list) or len(niv) != 4 or not all(isinstance(n, str) and n.strip() for n in niv):
            err.append(f"grille {c['id']} : quatre descriptions de niveau attendues")
        if not isinstance(c.get("pieges"), list) or not c["pieges"]:
            err.append(f"grille {c['id']} : pièges absents")
    if not isinstance(g.get("mise_en_forme"), list) or len(g["mise_en_forme"]) < 3:
        err.append("grille : liste de mise en forme trop courte")
    sources_ok(g.get("sources"), 2, "grille", err)
    return err


def valider_document(d, note_id, ids_vus):
    err = []
    i = f"{note_id}/{d.get('id', '?')}"
    if not re.match(r"^D\d$", str(d.get("id", ""))):
        err.append(f"{i} : identifiant de document invalide")
    if d.get("id") in ids_vus:
        err.append(f"{i} : identifiant en double")
    ids_vus.add(d.get("id"))
    for cle in ("titre", "organisme", "type", "date", "limite"):
        if not isinstance(d.get(cle), str) or not d[cle].strip():
            err.append(f"{i} : champ {cle} manquant")
    if not URL.match(str(d.get("url", "")).replace(" ", "%20")):
        err.append(f"{i} : adresse invalide")
    res = d.get("resume")
    if not isinstance(res, list) or not res or not all(isinstance(p, str) and p.strip() for p in res):
        err.append(f"{i} : résumé absent")
    tab = d.get("tableau")
    if tab is not None:
        if not isinstance(tab.get("colonnes"), list) or not isinstance(tab.get("lignes"), list) or not tab["lignes"]:
            err.append(f"{i} : tableau mal formé")
        elif any(len(l) != len(tab["colonnes"]) for l in tab["lignes"]):
            err.append(f"{i} : lignes de tableau de longueur différente des colonnes")
    return err


def valider_nombres(texte_modele, pool, ident):
    """Chaque nombre du modèle doit figurer dans le pool (corpus, commande, calculs)."""
    inconnus = sorted(nombres(texte_modele) - pool)
    return [f"{ident} : nombre absent du corpus et des calculs déclarés : {n}" for n in inconnus]


def valider_note(n, ids_vus):
    err = []
    i = n.get("id", "?")
    if not isinstance(i, str) or not ID_NOTE.match(i):
        err.append(f"{i} : identifiant invalide (attendu nNN)")
    if i in ids_vus:
        err.append(f"{i} : identifiant en double")
    ids_vus.add(i)
    for cle in ("titre", "parcours"):
        if not isinstance(n.get(cle), str) or not n[cle].strip():
            err.append(f"{i} : champ {cle} manquant")
    cmd = n.get("commande") or {}
    for cle in ("role", "destinataire", "objet", "contexte", "consigne"):
        if not isinstance(cmd.get(cle), str) or not cmd[cle].strip():
            err.append(f"{i} : commande.{cle} manquant")
    m = n.get("mots") or {}
    if not (isinstance(m.get("min"), int) and isinstance(m.get("max"), int) and 0 < m["min"] < m["max"]):
        err.append(f"{i} : fourchette de mots invalide")
    if not isinstance(n.get("duree_min"), int):
        err.append(f"{i} : durée manquante")
    corpus = n.get("corpus")
    if not isinstance(corpus, list) or len(corpus) != 3:
        return err + [f"{i} : le corpus doit comporter 3 documents"]
    ids_docs, urls = set(), set()
    for d in corpus:
        err += valider_document(d, i, ids_docs)
        urls.add(str(d.get("url", "")).rstrip("/"))
    if len(urls) < 3:
        err.append(f"{i} : les documents du corpus doivent avoir des adresses distinctes")
    mod = n.get("modele") or {}
    secs = mod.get("sections")
    if not isinstance(secs, list) or len(secs) < 4:
        return err + [f"{i} : note modèle : au moins 4 sections"]
    if not isinstance(mod.get("en_tete"), list) or len(mod["en_tete"]) < 4:
        err.append(f"{i} : note modèle : en-tête incomplet")
    corps = texte_de([[s.get("paragraphes", []), s.get("liste", [])] for s in secs])
    nb = mots(corps)
    if isinstance(m.get("min"), int) and isinstance(m.get("max"), int) and not m["min"] <= nb <= m["max"]:
        err.append(f"{i} : la note modèle fait {nb} mots (attendu {m.get('min')} à {m.get('max')})")
    cites = set()
    for r in RENVOI.findall(corps):
        cites |= {x.strip() for x in r.split(",")}
    for c in sorted(cites - ids_docs):
        err.append(f"{i} : renvoi à un document inexistant : {c}")
    for c in sorted(ids_docs - cites):
        err.append(f"{i} : le document {c} n'est cité nulle part dans la note modèle")
    if not isinstance(mod.get("lecons"), list) or len(mod["lecons"]) < 3:
        err.append(f"{i} : note modèle : au moins 3 leçons")
    if not isinstance(mod.get("calculs"), list):
        err.append(f"{i} : note modèle : liste « calculs » absente (peut être vide)")
    pool = nombres(texte_de(corpus)) | nombres(texte_de(cmd)) | nombres(texte_de(mod.get("calculs", [])))
    err += valider_nombres(corps, pool, i)
    return err


def valider_court(c, types, ids_vus):
    err = []
    i = c.get("id", "?")
    if not isinstance(i, str) or not ID_COURT.match(i):
        err.append(f"{i} : identifiant invalide (attendu cNN)")
    if i in ids_vus:
        err.append(f"{i} : identifiant en double")
    ids_vus.add(i)
    if c.get("type") not in types:
        err.append(f"{i} : type inconnu {c.get('type')!r}")
    for cle in ("titre", "consigne"):
        if not isinstance(c.get(cle), str) or not c[cle].strip():
            err.append(f"{i} : champ {cle} manquant")
    if not isinstance(c.get("duree_min"), int):
        err.append(f"{i} : durée manquante")
    src = c.get("source") or {}
    if not src.get("titre") or not URL.match(str(src.get("url", ""))):
        err.append(f"{i} : source mal formée")
    mat, mod = c.get("matiere"), c.get("modele")
    if not isinstance(mat, dict) or not mat:
        return err + [f"{i} : matière absente"]
    if not isinstance(mod, dict) or not (mod.get("paragraphes") or mod.get("liste")):
        return err + [f"{i} : modèle absent"]
    if c.get("type") == "titres":
        if len(mat.get("liste", [])) != len(mod.get("liste", [])) or not mat.get("liste"):
            err.append(f"{i} : autant de titres modèles que de titres à reformuler")
    if c.get("type") == "graphique" and not mat.get("tableau"):
        err.append(f"{i} : un exercice de lecture de tableau doit avoir un tableau")
    if c.get("type") == "dix-lignes":
        nb = mots(texte_de(mod.get("paragraphes", [])))
        if nb > 140:
            err.append(f"{i} : le modèle fait {nb} mots (dix lignes : 140 au plus)")
    if not isinstance(c.get("calculs"), list) or not isinstance(c.get("lecons"), list) or not c["lecons"]:
        err.append(f"{i} : « calculs » (peut être vide) et « lecons » attendues")
    pool = nombres(texte_de(mat)) | nombres(c.get("consigne", "")) | nombres(texte_de(c.get("calculs", [])))
    err += valider_nombres(texte_de(mod), pool, i)
    return err


def valider_portfolio(p, kits_connus):
    err = []
    if not date_ok(p.get("revu")):
        err.append("portfolio : date de revue invalide")
    for cle in ("principes", "publication"):
        if not isinstance(p.get(cle), list) or len(p[cle]) < 3:
            err.append(f"portfolio : liste {cle} trop courte")
    projets = p.get("projets")
    if not isinstance(projets, list) or len(projets) < 3:
        return err + ["portfolio : au moins 3 projets"]
    ids = set()
    for x in projets:
        i = x.get("id", "?")
        if not isinstance(i, str) or not ID_PROJET.match(i) or i in ids:
            err.append(f"{i} : identifiant invalide ou en double")
        ids.add(i)
        for cle in ("titre", "question", "preuve", "outil"):
            if not isinstance(x.get(cle), str) or not x[cle].strip():
                err.append(f"{i} : champ {cle} manquant")
        if x.get("niveau") not in (1, 2, 3) or not isinstance(x.get("duree_h"), int):
            err.append(f"{i} : niveau (1 à 3) ou durée manquants")
        donnees = x.get("donnees")
        if not isinstance(donnees, list) or not donnees:
            err.append(f"{i} : aucune donnée citée")
        else:
            for d in donnees:
                if not d.get("titre") or not URL.match(str(d.get("url", ""))) or not d.get("licence") or not d.get("note"):
                    err.append(f"{i} : donnée mal décrite {d.get('titre')!r} (titre, url, licence, note)")
        et = x.get("etapes")
        if not isinstance(et, list) or len(et) < 5:
            err.append(f"{i} : au moins 5 étapes")
        else:
            eids = [e.get("id") for e in et]
            if len(set(eids)) != len(eids) or not all(isinstance(e, str) and e for e in eids):
                err.append(f"{i} : identifiants d'étapes en double")
            if eids[-2:] != ["relire", "publier"]:
                err.append(f"{i} : les deux dernières étapes doivent être « relire » et « publier »")
            for e in et:
                if not e.get("titre") or not e.get("detail"):
                    err.append(f"{i} : étape {e.get('id')} sans titre ou détail")
        liv = x.get("livrable") or {}
        if not liv.get("format") or not isinstance(liv.get("sections"), list) or len(liv["sections"]) < 4:
            err.append(f"{i} : livrable incomplet")
        if not isinstance(x.get("pieges"), list) or not x["pieges"]:
            err.append(f"{i} : pièges absents")
        for k in x.get("kits", []):
            if k not in kits_connus:
                err.append(f"{i} : kit inconnu {k}")
    return err


def kits_existants(dossier=FONDATIONS):
    return {re.match(r"^([a-f]\d{2})-", f.name).group(1) for f in dossier.glob("*.json") if re.match(r"^[a-f]\d{2}-", f.name)}


def construire(source=SOURCE, cible=CIBLE, fondations=FONDATIONS):
    lire = lambda nom: json.loads((source / nom).read_text(encoding="utf-8"))
    grille, notes, courts, portfolio = lire("grille.json"), lire("notes.json"), lire("courts.json"), lire("portfolio.json")
    err = valider_grille(grille)
    for cle in ("revu", "avertissement"):
        if not notes.get(cle):
            err.append(f"notes : champ {cle} manquant")
    ids = set()
    for n in notes.get("notes", []):
        err += valider_note(n, ids)
    if len(notes.get("notes", [])) < 1:
        err.append("notes : aucun exercice")
    types = courts.get("types") or {}
    if set(types) != set(TYPES_COURTS):
        err.append("courts : types attendus " + ", ".join(TYPES_COURTS))
    ids = set()
    for c in courts.get("courts", []):
        err += valider_court(c, types, ids)
    if len(courts.get("courts", [])) < 1:
        err.append("courts : aucun exercice")
    err += valider_portfolio(portfolio, kits_existants(fondations))
    if err:
        return err
    cible.mkdir(parents=True, exist_ok=True)
    for nom, d in (("grille", grille), ("notes", notes), ("courts", courts), ("portfolio", portfolio)):
        bc.ecrire(cible / f"{nom}.json", json.dumps(d, ensure_ascii=False, indent=1))
    return []


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    e = construire()
    if e:
        print("\n".join(e))
        sys.exit(1)
    print("Atelier publié dans site/data/atelier/")
