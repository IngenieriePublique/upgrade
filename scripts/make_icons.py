"""Fabrique icon-192.png et icon-512.png (flèche blanche sur fond bleu) avec la seule bibliothèque standard.
Usage : python scripts/make_icons.py
"""
import struct
import zlib
from pathlib import Path

BLEU = (0x1F, 0x3A, 0x5F)
BLANC = (255, 255, 255)
# Flèche en coordonnées d'un carré 512 (même tracé que icon.svg)
POLY = [(256, 110), (388, 262), (300, 262), (300, 402), (212, 402), (212, 262), (124, 262)]


def dans_polygone(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def dans_coins(x, y, taille, rayon):
    """Vrai si le point est dans le carré aux coins arrondis."""
    cx = min(max(x, rayon), taille - rayon)
    cy = min(max(y, rayon), taille - rayon)
    return (x - cx) ** 2 + (y - cy) ** 2 <= rayon ** 2


def png(taille):
    k = 512 / taille
    lignes = []
    for j in range(taille):
        ligne = bytearray([0])
        for i in range(taille):
            # 2x2 sur-échantillonnage pour lisser les bords
            acc = [0, 0, 0, 0]
            for dy in (0.25, 0.75):
                for dx in (0.25, 0.75):
                    x, y = (i + dx) * k, (j + dy) * k
                    if not dans_coins(x, y, 512, 96):
                        continue
                    c = BLANC if dans_polygone(x, y, POLY) else BLEU
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 1
            n = acc[3]
            ligne += bytes([acc[0] // n, acc[1] // n, acc[2] // n, 255 * n // 4]) if n else bytes([0, 0, 0, 0])
        lignes.append(bytes(ligne))
    brut = b"".join(lignes)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", taille, taille, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(brut, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    dossier = Path(__file__).resolve().parent.parent / "site" / "icons"
    dossier.mkdir(parents=True, exist_ok=True)
    for t in (192, 512):
        (dossier / f"icon-{t}.png").write_bytes(png(t))
        print("écrit", dossier / f"icon-{t}.png")
