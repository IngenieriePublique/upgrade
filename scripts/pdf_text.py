"""Extrait le texte d'un PDF simple (polices à codage littéral, flux Flate) sans dépendance externe.
Suffisant pour les tableaux et rapports administratifs courants ; ne gère pas les PDF scannés ni les polices à codage CID.

Usage : python -I scripts/pdf_text.py fichier.pdf [nb_caractères_max] [mot_clé]
Sortie : une ligne par ligne de texte (cellules d'un même rang séparées par « | »), pages séparées par « ----- page n ».
"""
import re
import sys
import zlib

TM = re.compile(rb"([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm")
TD = re.compile(rb"([-\d.]+) ([-\d.]+) Td")
TJ = re.compile(rb"\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^)\\]|\\.)*)\)\s*Tj")
STR = re.compile(rb"\(((?:[^)\\]|\\.)*)\)")
ESC = re.compile(rb"\\([nrtbf()\\]|[0-7]{1,3})")


def _decode(b):
    def sub(m):
        g = m.group(1)
        return {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f"}.get(g, g if g in (b"(", b")", b"\\") else bytes([int(g, 8) & 255]))
    return ESC.sub(sub, b).decode("cp1252", errors="replace")


def pages(donnees):
    flux = re.findall(rb"stream\r?\n(.*?)\r?\nendstream", donnees, re.S)
    for s in flux:
        try:
            t = zlib.decompress(s)
        except zlib.error:
            continue
        if b"BT" in t and (b"TJ" in t or b"Tj" in t):
            yield t


def lignes_de_page(contenu):
    morceaux = []
    x = y = 0.0
    for bloc in re.split(rb"\bET\b", contenu):
        m = None
        for m in TM.finditer(bloc):
            pass
        if m:
            x, y = float(m.group(5)), float(m.group(6))
        else:
            d = None
            for d in TD.finditer(bloc):
                pass
            if d:
                x, y = x + float(d.group(1)), y + float(d.group(2))
        texte = ""
        for t in TJ.finditer(bloc):
            if t.group(1) is not None:
                texte += "".join(_decode(p) for p in STR.findall(t.group(1)))
            else:
                texte += _decode(t.group(2))
        if texte.strip():
            morceaux.append((round(y), x, texte))
    rangs = {}
    for y, x, t in morceaux:
        rangs.setdefault(y, []).append((x, t))
    return [" | ".join(t.strip() for _, t in sorted(cells) if t.strip()) for y, cells in sorted(rangs.items(), reverse=True)]


def extraire(chemin):
    donnees = open(chemin, "rb").read()
    sortie = []
    for i, contenu in enumerate(pages(donnees), 1):
        sortie.append(f"----- page {i}")
        sortie += lignes_de_page(contenu)
    return "\n".join(sortie)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    t = extraire(sys.argv[1])
    if len(sys.argv) > 3:
        t = "\n".join(l for l in t.split("\n") if sys.argv[3].lower() in l.lower())
    print(t[:int(sys.argv[2])] if len(sys.argv) > 2 else t)
