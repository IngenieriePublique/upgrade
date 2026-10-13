import json
import sys
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_villes as bv  # noqa: E402

SOURCE = RACINE / "content" / "territoires" / "villes.json"
PUBLIE = RACINE / "site" / "data" / "territoires" / "villes.json"


def ville(nom, population, lon, lat):
    return {"qid": nom, "nom": nom, "population": population, "lon": lon, "lat": lat}


class VillesTest(unittest.TestCase):
    def test_lire_point(self):
        self.assertEqual(bv.lire_point("Point(2.35 48.85)"), (2.35, 48.85))
        self.assertEqual(bv.lire_point("Point(-1.55 47.21)"), (-1.55, 47.21))

    def test_distance_paris_lyon(self):
        d = bv.distance_km((2.352, 48.857), (4.835, 45.767))
        self.assertTrue(388 < d < 399, d)  # environ 392 km à vol d'oiseau

    def test_selection_ecarte_les_banlieues_et_les_petites_communes(self):
        lignes = [ville("Paris", 2_100_000, 2.352, 48.857), ville("Saint-Denis", 150_000, 2.354, 48.935),
                  ville("Lyon", 520_000, 4.835, 45.767), ville("Villeurbanne", 160_000, 4.879, 45.766),
                  ville("Petite", 50_000, 0.0, 47.0), ville("Saint-Denis (Réunion)", 155_000, 55.45, -20.88)]
        self.assertEqual([v["nom"] for v in bv.selectionner(lignes)], ["Paris", "Lyon"])

    def test_selection_triee_par_population(self):
        lignes = [ville("B", 200_000, 0.0, 47.0), ville("A", 900_000, 5.0, 44.0)]
        self.assertEqual([v["nom"] for v in bv.selectionner(lignes)], ["A", "B"])

    def test_projection_croissante_vers_l_est_et_decroissante_vers_le_nord(self):
        x0, y0 = bv.projeter(0.0, 45.0, 0.0, 7000.0)
        x1, y1 = bv.projeter(5.0, 48.0, 0.0, 7000.0)
        self.assertGreater(x1, x0)
        self.assertLess(y1, y0)  # le SVG a son origine en haut : plus au nord = y plus petit

    def test_publication_coherente_avec_la_source(self):
        src = json.loads(SOURCE.read_text(encoding="utf-8"))["villes"]
        pub = json.loads(PUBLIE.read_text(encoding="utf-8"))["villes"]
        self.assertEqual([v["qid"] for v in src], [v["id"] for v in pub])
        self.assertEqual([v["nom"] for v in src], [v["nom"] for v in pub])
        self.assertGreaterEqual(len(pub), 30)
        for v in pub:
            self.assertTrue(0 < v["x"] < 1160 and 0 < v["y"] < 1080, v["nom"])

    def test_la_source_cite_wikidata(self):
        d = json.loads(SOURCE.read_text(encoding="utf-8"))
        self.assertTrue(any("wikidata.org" in s["url"] for s in d["sources"]))
        self.assertTrue(all(v["population"] >= bv.SEUIL for v in d["villes"]))


if __name__ == "__main__":
    unittest.main()
