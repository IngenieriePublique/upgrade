"""Télécharge, depuis Wikisource, le texte brut des œuvres du domaine public qui alimentent les dictées.
Les fichiers vont dans data_local/dictees/ (hors dépôt) ; extract_dictees.py en tire ensuite des passages.

Usage : python -I scripts/fetch_dictees.py            # toutes les pages de PAGES
        python -I scripts/fetch_dictees.py "titre"    # une page de plus (titre exact Wikisource)
Les textes Wikisource sont sous licence CC BY-SA 4.0 (transcription) ; les œuvres sont du domaine public.
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wiki_lib as w  # noqa: E402

w.API = "https://fr.wikisource.org/w/api.php"
RACINE = Path(__file__).resolve().parent.parent
CIBLE = RACINE / "data_local" / "dictees"

PAGES = [
    "Lettres de mon moulin/La chèvre de monsieur Seguin",
    "Lettres de mon moulin/Le secret de maître Cornille",
    "Lettres de mon moulin/Les étoiles",
    "Contes du jour et de la nuit (éd. Flammarion, 1885)/La Parure",
    "Germinal/Partie I/Chapitre 1",
    "Trois Contes (Flaubert)/Un Cœur simple",
    "Madame Bovary/Première partie/1",
    "Du contrat social (Édition Beaulavon 1903)/Livre I-I",
    "Candide, ou l’Optimisme/Beuchot 1829/Chapitre 1",
    "Le Tour du monde en quatre-vingts jours/Chapitre 1",
    "Le Horla (recueil, Ollendorff 1895)/Le Horla",
    "De la démocratie en Amérique/Édition 1848/Tome 1/Introduction",
    "De la démocratie en Amérique/Édition 1848/Tome 1/Première partie/Chapitre 5",
]


def slug(titre):
    return re.sub(r"[^a-z0-9]+", "-", titre.lower().encode("ascii", "ignore").decode()).strip("-")[:80]


class _Paragraphes(HTMLParser):
    """Ne garde que le texte des paragraphes <p> (hors notes, tableaux, bandeaux de navigation)."""
    IGNORES = {"sup", "table", "style", "script", "sub"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paras, self._cur, self._p, self._skip = [], [], 0, []

    def handle_starttag(self, tag, attrs):
        cl = dict(attrs).get("class", "") or ""
        if tag in self.IGNORES or "noprint" in cl or "ws-noexport" in cl or "mw-editsection" in cl or "reference" in cl:
            self._skip.append(tag)
        elif tag == "p" and not self._skip:
            self._p += 1
        elif tag == "br" and self._p and not self._skip:
            self._cur.append(" ")

    def handle_endtag(self, tag):
        if self._skip and tag == self._skip[-1]:
            self._skip.pop()
        elif tag == "p" and self._p:
            self._p -= 1
            t = re.sub(r"\s+", " ", "".join(self._cur)).strip()
            if t:
                self.paras.append(t)
            self._cur = []

    def handle_data(self, data):
        if self._p and not self._skip:
            self._cur.append(data)


def telecharger(titre):
    d = w.api(action="parse", page=titre, prop="text", redirects=1)["parse"]
    p = _Paragraphes()
    p.feed(d["text"])
    return d.get("title", titre), "\n\n".join(p.paras)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    CIBLE.mkdir(parents=True, exist_ok=True)
    for titre in (sys.argv[1:] or PAGES):
        vrai, texte = telecharger(titre)
        f = CIBLE / (slug(titre) + ".txt")
        f.write_text(f"# {vrai}\n{texte}\n", encoding="utf-8", newline="\n")
        print(f"{len(texte):>8} car.  {f.name}  <- {vrai}")
