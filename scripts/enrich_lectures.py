"""Ajoute à chaque lecture de content/lectures/lectures.json le résumé complet de l'auteur et ses mots-clés, tels que la notice
les donne (champs `texte_auteur`, `mots_cles`, `texte_source`), pour que First Upgrade les affiche dans la page.

Sources lues : l'API de HAL (api.archives-ouvertes.fr, champs abstract_s et keyword_s des notices) et, pour les rapports du Sénat,
le paragraphe « Le résumé » de la notice du site senat.fr. Les textes sont recopiés tels quels (jamais réécrits ni complétés) et
attribués dans l'écran (« Résumé de l'auteur, notice HAL »). Les lectures dont la notice n'est pas lisible par un programme
(OpenEdition derrière un test anti-robot, article de presse) gardent seulement leur résumé court : on ne contourne pas le test.

Usage : python -I scripts/enrich_lectures.py   puis   python scripts/build_lectures.py
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "content" / "lectures" / "lectures.json"
UA = {"User-Agent": "UpgradeBot/0.1 (projet personnel; +https://github.com/IngenieriePublique/upgrade)"}
HAL = re.compile(r"((?:hal|halshs)-\d+)")
MOTS_FR = {"le", "la", "les", "des", "du", "de", "et", "est", "une", "un", "dans", "pour", "que", "qui", "sur", "par", "au", "aux", "ce", "cette", "en", "se", "ses", "son"}
LIMITE = 3500  # caractères : un résumé d'auteur plus long est coupé à la phrase précédente


def _get(url, tentatives=3):
    for essai in range(tentatives):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if essai == tentatives - 1:
                raise
            time.sleep(2 * (essai + 1))


def part_francais(texte):
    """Part de mots français courants : sépare le résumé français du résumé anglais d'une même notice."""
    mots = re.findall(r"[a-zàâçéèêëîïôûùüÿœ]+", texte.lower())
    return sum(m in MOTS_FR for m in mots) / max(1, len(mots))


def nettoyer(texte):
    t = html.unescape(re.sub(r"<[^>]+>", " ", texte))
    return re.sub(r"[ \t\xa0]+", " ", re.sub(r"\s*\n\s*", "\n", t)).strip()


def retirer_mots_cles_et_anglais(texte):
    """Certaines notices collent à leur résumé français la liste des mots-clés en majuscules puis le résumé anglais."""
    m = re.search(r"\s[A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŒ][A-ZÀÂÇÉÈÊËÎÏÔÛÙÜŒ' -]{15,}", texte)
    if m and m.start() > 200:
        texte = texte[:m.start()]
    m = re.search(r"\s(?:ABSTRACT|Abstract)", texte)
    if m and m.start() > 200:
        texte = texte[:m.start()]
    return texte.strip()


def couper(texte, limite=LIMITE):
    if len(texte) <= limite:
        return texte
    coupe = texte[:limite]
    fin = max(coupe.rfind(". "), coupe.rfind("? "), coupe.rfind("! "))
    return coupe[:fin + 1] if fin > limite // 2 else coupe.rsplit(" ", 1)[0] + "…"


def depuis_hal(identifiant):
    api = "https://api.archives-ouvertes.fr/search/?" + urllib.parse.urlencode(
        {"q": f"halId_s:{identifiant}", "fl": "abstract_s,keyword_s,language_s", "wt": "json"})
    docs = json.loads(_get(api))["response"]["docs"]
    if not docs:
        return None
    resumes = [nettoyer(a) for a in docs[0].get("abstract_s", []) if a.strip()]
    if not resumes:
        return None
    fr = max(resumes, key=part_francais)
    if part_francais(fr) < 0.12:
        return None  # aucun résumé en français
    mots = []
    for k in docs[0].get("keyword_s", []):
        k = nettoyer(k)
        if k and k.lower() not in {m.lower() for m in mots}:
            mots.append(k)
    return {"texte_auteur": couper(retirer_mots_cles_et_anglais(fr)), "mots_cles": mots, "texte_source": "Résumé de l'auteur, notice HAL"}


def depuis_senat(url):
    page = html.unescape(_get(url))
    m = re.search(r"Le résumé\s*</[^>]+>(.*?)(?:Consulter le rapport|Documents liés)", page, re.S)
    if not m:
        return None
    paragraphes = [nettoyer(p) for p in re.split(r"</p>|<br\s*/?>", m.group(1))]
    texte = "\n".join(p for p in paragraphes if p)
    return {"texte_auteur": texte, "mots_cles": [], "texte_source": "Résumé de la notice du Sénat"} if texte else None


def enrichir(lecture):
    mh = HAL.search(lecture["url"])
    if mh:
        return depuis_hal(mh.group(1))
    if "senat.fr/notice-rapport" in lecture["url"]:
        return depuis_senat(lecture["url"])
    return None


def main():
    d = json.loads(SOURCE.read_text(encoding="utf-8"))
    nb = 0
    for l in d["lectures"]:
        for k in ("texte_auteur", "mots_cles", "texte_source"):
            l.pop(k, None)
        try:
            ajout = enrichir(l)
        except Exception as e:
            print(f"{l['id']} : échec ({e})")
            ajout = None
        if ajout:
            l.update({k: v for k, v in ajout.items() if v})
            nb += 1
            print(f"{l['id']} : {len(ajout['texte_auteur'])} caractères, {len(ajout['mots_cles'])} mots-clés")
        else:
            print(f"{l['id']} : rien (résumé court conservé)")
    SOURCE.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{nb} lectures enrichies sur {len(d['lectures'])}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
