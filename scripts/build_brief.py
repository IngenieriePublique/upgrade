"""Fabrique le Brief du jour : 13 items au plus (5 France, 5 monde, 3 action publique),
un dossier de fond par semaine et « le truc du jour ».

    python -I scripts/build_brief.py                 # réseau -> site/data/brief/latest.json (+ archive)
    python -I scripts/build_brief.py --dry-run       # affiche le Brief sans rien écrire

Chaîne : fetch_feeds (flux validés) -> filtre (fraîcheur, langue) -> dédoublonnage (titres proches)
-> score -> plafonds par rubrique et par groupe de sources.
Droits : titre, lien et une phrase de chapô seulement ; rien d'un article n'est republié.
Si presque tous les flux échouent, le Brief existant n'est pas écrasé (code de sortie 1).
"""
import datetime as dt
import difflib
import hashlib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_feeds as ff  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "site" / "data" / "brief"
ARCHIVE_MAX = 60
MIN_ITEMS = 5  # en dessous, on suspecte une panne générale et on ne publie pas

STOP = set("""le la les un une des de du dans en et ou au aux ce ces cet cette son sa ses leur leurs pour par sur sous avec sans
est sont etre ete fait font plus moins tres comme mais donc que qui quoi dont ont avoir apres avant entre vers chez
il elle ils elles nous vous on se ne pas aussi tout tous toute toutes""".split())
MOTS_ANGLAIS = set("the and of to in is that for with on are was this from by an as at it be have has not what how why".split())
RECLASSE_MONDE = re.compile(r"/(international|monde|europe|ameriques|afrique|asie|moyen-orient|proche-orient)(/|-)", re.I)


# ---------- temps ----------

def dernier_dimanche(annee, mois):
    d = dt.date(annee, mois, 31)
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)


def heure_paris(utc):
    """UTC -> heure légale de Paris (règle européenne de l'heure d'été, sans base de fuseaux)."""
    debut = dt.datetime.combine(dernier_dimanche(utc.year, 3), dt.time(1), tzinfo=dt.timezone.utc)
    fin = dt.datetime.combine(dernier_dimanche(utc.year, 10), dt.time(1), tzinfo=dt.timezone.utc)
    return utc + dt.timedelta(hours=2 if debut <= utc < fin else 1)


def semaine_iso(d):
    a, s, _ = d.isocalendar()
    return f"{a}-W{s:02d}"


# ---------- analyse du texte ----------

def mots(titre):
    return {m for m in ff.normaliser(titre).split() if len(m) >= 4 and m not in STOP}


def est_francais(texte):
    """Heuristique simple : refuse un texte où dominent les mots outils anglais (The Conversation mêle les langues)."""
    ws = ff.normaliser(texte).split()
    if len(ws) < 4:
        return True
    return sum(w in MOTS_ANGLAIS for w in ws) / len(ws) < 0.15


def compter(texte_norm, termes):
    """Nombre de termes distincts présents (mot entier ou expression)."""
    return sum(1 for t in termes if re.search(rf"(?<![a-z0-9]){re.escape(ff.normaliser(t))}(?![a-z0-9])", texte_norm))


def similaires(a, b, ta, tb):
    if a["lien"] == b["lien"]:
        return True
    inter = len(ta & tb)
    petit = min(len(ta), len(tb)) or 1
    if (inter >= 3 and inter / petit >= 0.6) or (inter >= 4 and inter / petit >= 0.5):
        return True
    return difflib.SequenceMatcher(None, ff.normaliser(a["titre"]), ff.normaliser(b["titre"])).ratio() >= 0.82


def choisir_question(item_id, texte_norm, questions):
    """Thème détecté par mots-clés (le plus de correspondances), question choisie de façon stable."""
    meilleur, nb = None, 0
    for t in questions["themes"]:
        n = compter(texte_norm, t["motifs"])
        if n > nb:
            meilleur, nb = t, n
    if meilleur is None:
        meilleur = next(t for t in questions["themes"] if t["id"] == "defaut")
    k = int(hashlib.sha1(item_id.encode()).hexdigest(), 16) % len(meilleur["questions"])
    return meilleur["id"], meilleur["questions"][k]


# ---------- sélection ----------

def candidats(resultats, sources, cfg, maintenant):
    """Entrées valides (titre, lien, date récente, français), enrichies de leur source."""
    par_id = {s["id"]: s for s in sources}
    out = []
    for sid, r in resultats.items():
        s = par_id[sid]
        fenetre = dt.timedelta(hours=cfg["fenetre_heures"][s["type"]])
        for e in r["entrees"]:
            if len(e["titre"]) < 15 or not e["lien"] or e["date"] is None:
                continue
            if any(re.search(x, e["titre"], re.I) for x in cfg["exclure_titres"]):
                continue  # directs, quiz, podcasts : pages mouvantes ou sans contenu lisible
            if e["date"] > maintenant + dt.timedelta(hours=1) or maintenant - e["date"] > fenetre:
                continue
            c = ff.chapo(e["resume"], e["titre"])
            if not est_francais(e["titre"] + " " + c):
                continue
            rubrique = s["rubrique"]
            if s.get("reclasser") and RECLASSE_MONDE.search(urllib.parse.urlsplit(e["lien"]).path + "/"):
                rubrique = "monde"
            out.append({**e, "src": s, "rubrique": rubrique, "chapo": c, "mots": mots(e["titre"]),
                        "texte": ff.normaliser(e["titre"] + " " + c)})
    return out


def regrouper(cands):
    """Regroupe les entrées qui parlent de la même chose (liaison simple, union-find). -> liste de groupes."""
    parent = list(range(len(cands)))

    def racine(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, a in enumerate(cands):
        for j in range(i + 1, len(cands)):
            if racine(i) != racine(j) and similaires(a, cands[j], a["mots"], cands[j]["mots"]):
                parent[racine(j)] = racine(i)
    groupes = {}
    for i, c in enumerate(cands):
        groupes.setdefault(racine(i), []).append(c)
    return list(groupes.values())


def score(c, nb_groupes, cfg, maintenant):
    """Détail du calcul : priorité de la source + mots d'action publique - mots de jeu politique
    - sujets divers + reprise par d'autres médias + fraîcheur."""
    t = c["texte"]
    fenetre_h = cfg["fenetre_heures"][c["src"]["type"]]
    age_h = (maintenant - c["date"]).total_seconds() / 3600
    s = float(c["src"]["priorite"])
    s += min(compter(t, cfg["mots_action"]), 3)
    s += 0.3 * min(compter(t, cfg["mots_institution"]), 2)
    s -= min(compter(t, cfg["mots_jeu"]), 3)
    s -= 2 * min(compter(t, cfg["mots_divers"]), 1)
    s += 0.7 * min(nb_groupes - 1, 3)
    s += max(0.0, 1 - age_h / fenetre_h)
    if c["chapo"]:
        s += 0.2
    return round(s, 2)


def classer(cands, cfg, maintenant):
    """Un représentant par groupe, avec son score (le meilleur score du groupe l'emporte)."""
    reps = []
    for g in regrouper(cands):
        nb = len({m["src"]["groupe"] for m in g})
        meilleur = max(g, key=lambda m: (score(m, nb, cfg, maintenant), -m["src"]["priorite"]))
        reps.append({**meilleur, "score": score(meilleur, nb, cfg, maintenant), "reprises": nb})
    return sorted(reps, key=lambda r: (-r["score"], r["titre"]))


def item_public(c, questions):
    iid = hashlib.sha1(c["lien"].encode()).hexdigest()[:10]
    theme, question = choisir_question(iid, c["texte"], questions)
    it = {
        "id": iid, "rubrique": c["rubrique"], "titre": c["titre"], "lien": c["lien"],
        "source": c["src"]["nom"], "date": c["date"].strftime("%Y-%m-%dT%H:%MZ"),
        "chapo": c["chapo"], "theme": theme, "question": question, "score": c["score"],
    }
    if c["src"].get("payant"):
        it["payant"] = True
    if c["reprises"] > 1:
        it["reprises"] = c["reprises"]
    return it


def choisir(classes, cfg, questions, deja=()):
    """Applique les plafonds par rubrique et par groupe de sources."""
    pris, par_groupe = [], {}
    vus = set(deja)
    for rubrique, plafond in cfg["plafonds"].items():
        n = 0
        for c in classes:
            if n >= plafond:
                break
            if c["rubrique"] != rubrique or c["src"]["type"] == "fond" or c["lien"] in vus:
                continue
            cle = (rubrique, c["src"]["groupe"])
            if par_groupe.get(cle, 0) >= cfg["max_par_groupe"]:
                continue
            par_groupe[cle] = par_groupe.get(cle, 0) + 1
            vus.add(c["lien"])
            pris.append(item_public(c, questions))
            n += 1
    return pris


def choisir_dossier(classes, questions, precedent, semaine):
    """Un dossier de fond par semaine : on garde celui de la semaine en cours s'il existe."""
    if precedent and precedent.get("semaine") == semaine:
        return precedent
    for c in classes:
        if c["src"]["type"] == "fond":
            return {**item_public(c, questions), "semaine": semaine}
    return None


# ---------- le truc du jour (Wikipédia, « Ce jour-là ») ----------

def truc_du_jour(jour, getter=ff.http_get):
    """Un fait historique daté, tiré de Wikipédia (CC BY-SA). Choix stable selon le jour. None si l'API répond mal."""
    try:
        url = f"https://fr.wikipedia.org/api/rest_v1/feed/onthisday/selected/{jour:%m}/{jour:%d}"
        evts = [e for e in json.loads(getter(url))["selected"] if e.get("pages") and e.get("text") and e.get("year")]
        if not evts:
            return None
        e = evts[jour.toordinal() % len(evts)]
        page = e["pages"][0]
        lien = page["content_urls"]["desktop"]["page"]
        return {
            "type": "fait", "titre": f"{e['year']} : {e['text']}",
            "extrait": ff.chapo(page.get("extract", ""), "", 260), "lien": lien,
            "source": "Wikipédia", "licence": "CC BY-SA 4.0",
        }
    except Exception as ex:  # noqa: BLE001 : facultatif, ne bloque jamais le Brief
        print(f"truc du jour indisponible : {ex}", file=sys.stderr)
        return None


# ---------- assemblage et écriture ----------

def construire(resultats, cfg, questions, maintenant, precedent=None, truc=None):
    jour = heure_paris(maintenant).date()
    cands = candidats(resultats, cfg["sources"], cfg, maintenant)
    classes = classer(cands, cfg, maintenant)
    items = choisir(classes, cfg, questions)
    dossier = choisir_dossier(classes, questions, (precedent or {}).get("dossier"), semaine_iso(jour))
    ordre = list(cfg["plafonds"])
    items.sort(key=lambda i: (ordre.index(i["rubrique"]), -i["score"]))
    return {
        "version": 1,
        "date": jour.isoformat(),
        "genere": maintenant.strftime("%Y-%m-%dT%H:%MZ"),
        "plafond": sum(cfg["plafonds"].values()),
        "items": items,
        "dossier": dossier,
        "truc": truc,
        "sources": {
            "ok": sum(1 for r in resultats.values() if not r["erreur"]),
            "total": len(resultats),
            "echecs": sorted(sid for sid, r in resultats.items() if r["erreur"]),
        },
        "licences": "Titres, liens et chapôs : sources citées, usage de signalement. Truc du jour : Wikipédia, CC BY-SA 4.0.",
    }


def ecrire(brief, dossier=SORTIE):
    arch = dossier / "archive"
    arch.mkdir(parents=True, exist_ok=True)
    texte = json.dumps(brief, ensure_ascii=False, indent=1) + "\n"
    (dossier / "latest.json").write_text(texte, encoding="utf-8", newline="\n")
    (arch / f"{brief['date']}.json").write_text(texte, encoding="utf-8", newline="\n")
    fichiers = sorted(arch.glob("????-??-??.json"), reverse=True)
    for vieux in fichiers[ARCHIVE_MAX:]:
        vieux.unlink()
    dates = [f.stem for f in fichiers[:ARCHIVE_MAX]]
    (dossier / "index.json").write_text(
        json.dumps({"derniere": dates[0], "dates": dates}, indent=1) + "\n", encoding="utf-8", newline="\n")


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    cfg = json.loads((RACINE / "content/brief/config.json").read_text(encoding="utf-8"))
    questions = json.loads((RACINE / "content/brief/questions.json").read_text(encoding="utf-8"))
    maintenant = dt.datetime.now(dt.timezone.utc)
    precedent = None
    try:
        precedent = json.loads((SORTIE / "latest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    resultats = ff.fetch_all(cfg["sources"])
    for sid, r in resultats.items():
        if r["erreur"]:
            print(f"! {sid} : {r['erreur']}", file=sys.stderr)
    truc = truc_du_jour(heure_paris(maintenant).date())
    brief = construire(resultats, cfg, questions, maintenant, precedent, truc)
    if "--dry-run" in argv:
        print(json.dumps(brief, ensure_ascii=False, indent=1))
        return 0
    if len(brief["items"]) < MIN_ITEMS:
        print(f"Seulement {len(brief['items'])} items : panne probable, Brief existant conservé.", file=sys.stderr)
        return 1
    ecrire(brief)
    print(f"Brief du {brief['date']} : {len(brief['items'])} items, sources {brief['sources']['ok']}/{brief['sources']['total']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
