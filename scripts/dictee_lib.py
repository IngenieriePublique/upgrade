"""Briques pures des dictées (sans réseau) : nettoyage de texte, extraction d'un passage, profil de difficultés.
Utilisées par extract_dictees.py (fabrication) et build_dictees.py (validation) ; testées dans tests/test_dictees.py.

Le « profil » d'une dictée est une estimation automatique, par catégorie de fautes, du nombre de pièges pour 100 mots.
Elle sert seulement à choisir la dictée suivante d'après les fautes de l'utilisateur : ce n'est pas une analyse linguistique.
"""
import re

ABREVIATIONS = {"m.", "mm.", "mme.", "mmes.", "mlle.", "dr.", "st.", "ste.", "etc.", "p.", "n°."}
FIN_PHRASE = re.compile(r"[.?!…]+[»”)\]]*$")

CATEGORIES = ["pp", "homophone", "sujet-verbe", "gn", "conjugaison", "lexicale", "ponctuation"]


def nettoyer(texte):
    """Apostrophes typographiques, espaces propres, abréviations que Wikisource a dépouillées de leur point."""
    t = texte.replace("'", "’").replace(" ", " ").replace(" ", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\bMM (?=[A-ZÉ])", "MM. ", t)
    t = re.sub(r"\bM (?=[A-ZÉ])", "M. ", t)
    return t.strip()


def mots(texte):
    """Mots au sens d'une dictée : suites contenant une lettre ou un chiffre (« l’homme » compte pour un)."""
    return [m for m in texte.split() if re.search(r"[\wÀ-ÿ]", m)]


def nb_mots(texte):
    return len(mots(texte))


def _fin_de_phrase(mot):
    return bool(FIN_PHRASE.search(mot)) and mot.lower() not in ABREVIATIONS


def _equilibre(texte):
    return texte.count("«") == texte.count("»") and texte.count("(") == texte.count(")")


def extraire(texte, debut, minimum):
    """Passage qui commence à `debut` (texte exact) et s'arrête à la première fin de phrase une fois `minimum`
    mots atteints (et guillemets fermés). Les alinéas (lignes) sont conservés, séparés par une ligne vide.
    Lève ValueError si le début est introuvable, ambigu ou si le texte est trop court."""
    plat = texte
    n = plat.count(debut)
    if n == 0:
        raise ValueError(f"début introuvable : {debut!r}")
    if n > 1:
        raise ValueError(f"début ambigu ({n} occurrences) : {debut!r}")
    reste = plat[plat.index(debut):]
    sortie, compte, i = [], 0, 0
    morceaux = re.findall(r"\S+|\n+", reste)
    for m in morceaux:
        if m.startswith("\n"):
            sortie.append("\n\n")
            continue
        sortie.append(m + " ")
        if re.search(r"[\wÀ-ÿ]", m):
            compte += 1
        courant = "".join(sortie).strip()
        if compte >= minimum and _fin_de_phrase(m) and _equilibre(courant):
            return re.sub(r"\s*\n\n\s*", "\n\n", courant)
    raise ValueError(f"texte trop court après {debut!r}")


# --- Profil de difficultés -------------------------------------------------------------------------------------

AUX = set("""a as ai avons avez ont avais avait avions aviez avaient eut eurent aura auras aurai aurons aurez auront aurait
aurais auraient ait aies aient ayant eu avoir eût eussent est es suis sommes êtes sont étais était étions étiez étaient
fut fûmes furent sera seras serai serons serez seront serait serais seraient soit soient sois être étant été""".split())
HOMOPHONES = set("""a à et est on ont son sont ces ses c’est s’est ce se ou où la là leur quel quelle qu’elle ni n’y mais mes ma m’a
peu peut sans s’en sa ça tout tous""".split())
DET_PLURIELS = set("les des ces ses mes tes nos vos leurs aux quelques plusieurs divers certains certaines".split())
PAS_VERBES_ENT = set("""souvent vent parent présent absent argent moment comment cependant pourtant autrement vraiment évidemment
vêtement mouvement gouvernement sentiment commencement agent client intelligent lent content différent évident
permanent précédent président résident violent récent patient évènement événement élément instrument sentiment
régiment testament document sacrement établissement tourment rassemblement""".split())


def _mot(m):
    return re.sub(r"^[^\wÀ-ÿ’]+|[^\wÀ-ÿ’]+$", "", m.lower())


def _fin_pp(m):
    return bool(re.search(r"(é|ée|és|ées|i|is|ie|ies|it|its|u|us|ue|ues|ert|erte|erts|ertes|int|inte|ints|intes)$", m)) and len(m) > 2


def profil(texte):
    """Pièges estimés par catégorie, pour 100 mots (arrondis à une décimale)."""
    mm = [_mot(m) for m in mots(texte)]
    mm = [m for m in mm if m]
    n = max(1, len(mm))
    c = dict.fromkeys(CATEGORIES, 0)
    for i, m in enumerate(mm):
        if m in HOMOPHONES:
            c["homophone"] += 1
        if m not in AUX and _fin_pp(m) and any(x in AUX for x in mm[max(0, i - 3):i]):
            c["pp"] += 1
        if m.endswith("ent") and not m.endswith("ment") and m not in PAS_VERBES_ENT and len(m) >= 5:
            c["sujet-verbe"] += 1
        if m in {"aient", "ent"}:
            c["sujet-verbe"] += 1
        if i and mm[i - 1] in DET_PLURIELS and len(m) > 2:
            c["gn"] += 2  # le nom, et souvent un adjectif à sa suite
        if re.search(r"(èrent|âmes|âtes|ât|ît|ût|ûmes|ûtes|ssions|ssiez|assent|issent|rait|raient|ais|ait|aient|ions|iez)$", m):
            c["conjugaison"] += 1
        if len(m) >= 9 or "œ" in m or re.search(r"(ll|tt|mm|rr|pp|ss)", m) and len(m) >= 7:
            c["lexicale"] += 1
    c["ponctuation"] = len(re.findall(r"[,;:!?…—«»()]", texte)) + len(re.findall(r"\.(?=\s|$)", texte))
    return {k: round(100 * v / n, 1) for k, v in c.items()}


def decouper(texte, max_mots=9):
    """Segments de lecture à plat (voir decouper_par_alinea)."""
    return [s for al in decouper_par_alinea(texte, max_mots) for s in al]


def fins_alinea(texte, max_mots=9):
    """Pour chaque segment, vrai s'il termine un alinéa (la lecture dit alors « à la ligne »)."""
    return [i == len(al) - 1 for al in decouper_par_alinea(texte, max_mots) for i in range(len(al))]


def decouper_par_alinea(texte, max_mots=9):
    """Découpe pour la lecture à voix haute : groupes de souffle (virgule, point-virgule, deux-points, fin de phrase),
    ni trop courts (< 3 mots, rattachés au suivant) ni trop longs (> max_mots + 4, coupés à une conjonction ou à l'espace).
    Renvoie, pour chaque alinéa, la liste de ses segments (leur concaténation avec des espaces redonne le texte)."""
    resultat = []
    for alinea in re.split(r"\n\s*\n", texte):
        out = []
        toks = alinea.split()
        seg, brut = [], []
        for t in toks:
            seg.append(t)
            if re.search(r"[,;:.?!…»]+$", t) and not (t.lower() in ABREVIATIONS):
                brut.append(seg)
                seg = []
        if seg:
            brut.append(seg)
        # fusionne les segments courts avec le suivant, coupe les trop longs
        court = lambda seg: nb_mots(" ".join(seg)) < 3  # noqa: E731
        pile = []
        for s in brut:
            if pile and court(pile[-1]):
                pile[-1] = pile[-1] + s
            else:
                pile.append(s)
        if len(pile) > 1 and court(pile[-1]):
            dernier = pile.pop()
            pile[-1] = pile[-1] + dernier
        for s in pile:
            while nb_mots(" ".join(s)) > max_mots + 4:
                coupe = max_mots
                for k in range(max_mots - 2, max_mots + 3):
                    if k < len(s) and _mot(s[k]) in {"et", "mais", "ou", "que", "qui", "où", "car", "dont", "puis", "quand", "lorsque"}:
                        coupe = k
                        break
                out.append(" ".join(s[:coupe]))
                s = s[coupe:]
            out.append(" ".join(s))
        resultat.append(out)
    return resultat
