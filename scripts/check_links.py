"""Vérifie que les adresses citées dans content/**/*.json répondent (HTTP 200).

Les sites qui bloquent les robots ou ont un certificat incomplet côté Python sont signalés « à vérifier à la main »
et ne font pas échouer le script (voir CLAUDE.md).

Usage : python -I scripts/check_links.py [dossier_ou_fichier ...]   (défaut : content/radar et content/oral)
"""
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (UpgradeBot/0.1; projet personnel)", "Accept-Language": "fr"}
A_LA_MAIN = ("ademe.fr", "prefectures-regions.gouv.fr", "cnfpt.fr", "legifrance.gouv.fr", "u-bordeaux.fr")


def urls_de(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "url" and isinstance(v, str):
                yield v
            else:
                yield from urls_de(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from urls_de(v)


def collecter(chemins):
    urls = {}
    for c in chemins:
        c = Path(c)
        for f in ([c] if c.is_file() else sorted(c.rglob("*.json"))):
            for u in urls_de(json.loads(f.read_text(encoding="utf-8"))):
                urls.setdefault(u, f.name)
    return urls


def tester(u, essais=2):
    for i in range(essais):
        try:
            req = urllib.request.Request(u, headers=UA)
            with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as r:
                r.read(2000)
                return u, r.status, ""
        except urllib.error.HTTPError as e:
            res = (u, e.code, str(e)[:60])
            if e.code < 500:
                return res
        except Exception as e:  # noqa: BLE001 : réseau, DNS, certificat
            res = (u, 0, str(e)[:60])
        time.sleep(2)  # erreur serveur passagère : on réessaie une fois
    return res


def main(argv):
    chemins = argv or [RACINE / "content" / "radar", RACINE / "content" / "oral"]
    urls = collecter(chemins)
    with ThreadPoolExecutor(8) as ex:
        resultats = list(ex.map(tester, urls))
    mauvais = 0
    for u, code, msg in sorted(resultats, key=lambda r: r[0]):
        if code == 200:
            continue
        main_ = any(d in u for d in A_LA_MAIN)
        mauvais += 0 if main_ else 1
        print(f"{'À VÉRIFIER À LA MAIN' if main_ else 'ÉCHEC'} {code or 'ERR'} {u} ({urls[u]}) {msg}")
    print(f"{len(urls)} adresses testées, {mauvais} en échec")
    return 1 if mauvais else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
