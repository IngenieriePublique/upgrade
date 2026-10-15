"""Drapeaux des pays du jeu : image du drapeau (Wikidata P41, fichier de Wikimedia Commons) réduite en PNG.

    python -I scripts/fetch_drapeaux.py            # télécharge ce qui manque dans site/data/drapeaux/<ISO en minuscules>.png
    python -I scripts/fetch_drapeaux.py --licences # interroge Commons sur la licence de chaque fichier et l'écrit dans la source

Source versionnée : content/territoires/drapeaux.json (pays -> fichier Commons, licence). Les drapeaux sont purement décoratifs dans le jeu.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wiki_lib as w  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
PAYS = RACINE / "content" / "territoires" / "pays.json"
SOURCE = RACINE / "content" / "territoires" / "drapeaux.json"
CIBLE = RACINE / "site" / "data" / "drapeaux"
LARGEUR = 56  # pixels : le drapeau s'affiche à environ 20 pixels de haut


def requete(qids):
    valeurs = " ".join(f"wd:{q}" for q in qids)
    return ("SELECT ?c ?flag ?rank WHERE { VALUES ?c { " + valeurs + " } ?c p:P41 ?st . ?st ps:P41 ?flag . ?st wikibase:rank ?rank . "
            "FILTER NOT EXISTS { ?st pq:P582 ?fin } }")


def choisir(lignes):
    """Une seule image par pays : le rang préféré, sinon la seule valeur normale (sans date de fin)."""
    valides = [r for r in lignes if not r["rank"]["value"].endswith("DeprecatedRank")]
    pref = [r for r in valides if r["rank"]["value"].endswith("PreferredRank")]
    valides = pref or valides
    fichiers = sorted({urllib.parse.unquote(r["flag"]["value"].rsplit("/", 1)[1]) for r in valides})
    return fichiers


def licences(fichiers):
    """{fichier: licence courte} d'après l'API de Commons (métadonnées étendues)."""
    res = {}
    for i in range(0, len(fichiers), 40):
        lot = fichiers[i:i + 40]
        url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "prop": "imageinfo", "iiprop": "extmetadata", "format": "json", "formatversion": 2,
            "titles": "|".join("File:" + f for f in lot)})
        d = json.loads(w._get(url))["query"]["pages"]
        for p in d:
            meta = (p.get("imageinfo") or [{}])[0].get("extmetadata", {})
            res[p["title"][len("File:"):].replace(" ", "_")] = meta.get("LicenseShortName", {}).get("value", "?")
    return res


def main():
    pays = json.loads(PAYS.read_text(encoding="utf-8"))["pays"]
    par_qid = {p["qid"]: p["id"] for p in pays}
    lignes = {}
    qids = sorted(par_qid)
    for i in range(0, len(qids), 60):
        for essai in range(5):
            try:
                reponse = w.sparql(requete(qids[i:i + 60]))
                break
            except Exception as e:  # 502, limite de débit : on réessaie
                if essai == 4:
                    raise
                print(f"Wikidata : essai {essai + 1} échoué ({e}), nouvelle tentative…", file=sys.stderr)
                time.sleep(8 * (essai + 1))
        for r in reponse:
            lignes.setdefault(par_qid[r["c"]["value"].rsplit("/", 1)[1]], []).append(r)
        time.sleep(1)
    fichiers = {}
    for iso in sorted(par_qid.values()):
        f = choisir(lignes.get(iso, []))
        if len(f) != 1:
            print(f"{iso} : {len(f)} images ({', '.join(f)}) : à départager", file=sys.stderr)
            continue
        fichiers[iso] = f[0]
    manque = sorted(set(par_qid.values()) - set(fichiers))
    if manque:
        raise SystemExit("pays sans image unique : " + ", ".join(manque))
    sortie = {"revu": "2026-10-14",
              "source": {"titre": "Wikidata (P41, image du drapeau) et Wikimedia Commons", "url": "https://www.wikidata.org/wiki/Property:P41"},
              "pays": {iso: {"fichier": f} for iso, f in sorted(fichiers.items())}}
    if "--licences" in sys.argv or SOURCE.exists():
        anciennes = json.loads(SOURCE.read_text(encoding="utf-8"))["pays"] if SOURCE.exists() else {}
        if "--licences" in sys.argv:
            lic = licences(sorted(set(fichiers.values())))
            for iso, f in fichiers.items():
                sortie["pays"][iso]["licence"] = lic.get(f.replace(" ", "_"), "?")
        else:
            for iso, e in sortie["pays"].items():
                if "licence" in anciennes.get(iso, {}):
                    e["licence"] = anciennes[iso]["licence"]
    SOURCE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")

    CIBLE.mkdir(parents=True, exist_ok=True)
    for iso, f in sorted(fichiers.items()):
        chemin = CIBLE / f"{iso.lower()}.png"
        if chemin.exists():
            continue
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(f.replace(" ", "_")) + f"?width={LARGEUR}"
        chemin.write_bytes(w._get(url))
        print(f"+ {iso} {f} ({chemin.stat().st_size} o)")
        time.sleep(0.5)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
