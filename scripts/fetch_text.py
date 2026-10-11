"""Affiche le texte lisible d'une page web (pour rédiger une fiche à partir de sources officielles).

Usage : python -I scripts/fetch_text.py URL [nb_caractères_max] [mot_clé]
Avec un mot-clé, n'affiche que les paragraphes qui le contiennent (insensible à la casse).
Les sites qui bloquent les robots renvoient une erreur : on note alors la source comme « à lire à la main ».
"""
import gzip
import re
import ssl
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = {"User-Agent": "Mozilla/5.0 (UpgradeBot/0.1; projet personnel; +https://github.com/IngenieriePublique/upgrade)",
      "Accept-Language": "fr", "Accept-Encoding": "gzip"}
IGNORE = {"script", "style", "nav", "header", "footer", "noscript", "svg", "form", "aside", "button"}
BLOCS = {"p", "li", "h1", "h2", "h3", "h4", "tr", "div", "section", "article", "br", "dt", "dd", "blockquote"}


class Extracteur(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.morceaux, self.profondeur_ignore = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in IGNORE:
            self.profondeur_ignore += 1
        if tag in BLOCS:
            self.morceaux.append("\n")
        if tag in ("h1", "h2", "h3", "h4"):
            self.morceaux.append("\n## ")

    def handle_endtag(self, tag):
        if tag in IGNORE and self.profondeur_ignore:
            self.profondeur_ignore -= 1
        if tag in BLOCS:
            self.morceaux.append("\n")

    def handle_data(self, data):
        if not self.profondeur_ignore:
            self.morceaux.append(data)


def lire(url, timeout=40):
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?&=%#()_',-.~+;@!*"), headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
        brut = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            brut = gzip.decompress(brut)
        charset = r.headers.get_content_charset() or "utf-8"
    html = brut.decode(charset, errors="replace")
    ex = Extracteur()
    ex.feed(html)
    texte = "".join(ex.morceaux)
    lignes = [re.sub(r"[ \t\xa0]+", " ", l).strip() for l in texte.split("\n")]
    return "\n".join(l for l in lignes if l)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    t = lire(sys.argv[1])
    if len(sys.argv) > 3:
        t = "\n".join(p for p in t.split("\n") if sys.argv[3].lower() in p.lower())
    print(t[:int(sys.argv[2])] if len(sys.argv) > 2 else t)
