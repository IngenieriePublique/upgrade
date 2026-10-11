import json
import sys
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import geo_lib as g  # noqa: E402


def carre(x, y, c=1.0):
    return {"type": "Polygon", "coordinates": [[[x, y], [x + c, y], [x + c, y + c], [x, y + c], [x, y]]]}


class ProjectionTest(unittest.TestCase):
    def test_lambert93_paris(self):
        # Notre-Dame de Paris : environ (652 470 ; 6 862 035) en Lambert-93
        x, y = g.lambert93(2.3522, 48.8566)
        self.assertAlmostEqual(x, 652469, delta=5)
        self.assertAlmostEqual(y, 6862035, delta=5)

    def test_lambert93_origine(self):
        x, y = g.lambert93(3.0, 46.5)
        self.assertAlmostEqual(x, 700000, delta=1e-3)
        self.assertAlmostEqual(y, 6600000, delta=1e-3)

    def test_locale_centre_a_zero(self):
        p = g.locale(-61.5, 16.2)
        self.assertEqual(p(-61.5, 16.2), (0.0, 0.0))
        x, y = p(-61.5, 17.2)
        self.assertAlmostEqual(y, 111195, delta=200)  # 1 degré de latitude
        self.assertAlmostEqual(x, 0.0)


class GeometrieTest(unittest.TestCase):
    def test_douglas_peucker_garde_extremites_et_supprime_le_bruit(self):
        pts = [(0, 0), (1, 0.01), (2, -0.01), (3, 0), (3, 5)]
        res = g.douglas_peucker(pts, 0.1)
        self.assertEqual(res, [(0, 0), (3, 0), (3, 5)])

    def test_douglas_peucker_longue_ligne_sans_recursion(self):
        pts = [(i, (i % 2) * 0.001) for i in range(20000)]
        self.assertEqual(len(g.douglas_peucker(pts, 0.1)), 2)

    def test_simplifier_anneau_reste_ferme_et_non_degenere(self):
        anneau = [(0, 0), (5, 0.01), (10, 0), (10, 10), (0, 10), (0, 0)]
        res = g.simplifier_anneau(anneau, 0.5)
        self.assertGreaterEqual(len(res), 4)
        self.assertEqual(res[0], res[-1])
        self.assertNotIn((5, 0.01), res)

    def test_aire_et_centre(self):
        r = [(0, 0), (2, 0), (2, 2), (0, 2)]
        self.assertEqual(abs(g.aire_anneau(r)), 4)
        self.assertEqual(g.centre(r), (1.0, 1.0))

    def test_point_dans_geometrie_avec_trou(self):
        poly = {"type": "Polygon", "coordinates": [
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]]}
        self.assertTrue(g.point_dans_geometrie((1, 1), poly))
        self.assertFalse(g.point_dans_geometrie((5, 5), poly))   # dans le trou
        self.assertFalse(g.point_dans_geometrie((20, 5), poly))

    def test_point_interieur_d_un_c(self):
        c = {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]]}
        self.assertTrue(g.point_dans_geometrie(g.point_interieur(c), c))

    def test_type_non_gere(self):
        with self.assertRaises(ValueError):
            g.anneaux({"type": "Point", "coordinates": [0, 0]})


class VoisinsTest(unittest.TestCase):
    def test_voisins_cote_a_cote_pas_en_diagonale(self):
        ents = {"A": carre(0, 0), "B": carre(1, 0), "C": carre(2, 0), "D": carre(1, 1) | {}, "E": carre(2, 1)}
        # A–B côte à côte ; A et D ne se touchent que par un point (0,... ) : B (1,0)-(2,1) et D (1,1)-(2,2) partagent un côté
        v = g.voisins(ents)
        self.assertEqual(v["A"], {"B"})
        self.assertEqual(v["B"], {"A", "C", "D"})
        self.assertNotIn("E", v["A"])       # A et E : aucun sommet commun
        self.assertNotIn("D", v["A"])       # A (0..1) et D (1..2, 1..2) : un seul sommet commun, donc pas voisins
        self.assertEqual(v["E"], {"C", "D"})

    def test_symetrie(self):
        v = g.voisins({"A": carre(0, 0), "B": carre(1, 0), "C": carre(5, 5)})
        self.assertEqual(v, {"A": {"B"}, "B": {"A"}, "C": set()})


class CheminSvgTest(unittest.TestCase):
    def test_chemin_ferme_sans_point_final_duplique(self):
        d = g.chemin_svg([[[(0, 0), (10, 0), (10, 5), (0, 0)]]])
        self.assertEqual(d, "M0 0L10 0L10 5Z")

    def test_ignore_les_anneaux_degeneres(self):
        self.assertEqual(g.chemin_svg([[[(0, 0), (1, 1), (0, 0)]]]), "")

    def test_decimales_conservees(self):
        self.assertEqual(g.chemin_svg([[[(0.3, 0), (10, 0.5), (10, 5), (0.3, 0)]]]), "M0.3 0L10 0.5L10 5Z")


WIKITEXT = '''Intro
{|class="wikitable sortable"
|-
!scope="col"| N°
!scope="col"| Département
!scope="col"| Préfecture
!scope="col"| Population
!scope="col"| Sous-préfectures
|-
!scope="row" style="text-align:center"| 01{{0}}
| [[Ain (département)|Ain]] || [[Bourg-en-Bresse]] ||style="text-align:right"| {{formatnum:{{Population de France/dernière pop||Bourg-en-Bresse}}}} || [[Belley]], [[Gex]], [[Nantua]]
|-
!scope="row" style="text-align:center"| {{Tri|20|2A}}{{0}}
| [[Corse-du-Sud]] || \'\'\'[[Ajaccio]]\'\'\' ||style="text-align:right"| {{formatnum:{{Population de France/dernière pop||Ajaccio}}}} || [[Sartène]]
|-
!scope="row" style="text-align:center"| 75
| [[Paris]] || [[Paris]] (capitale) ||style="text-align:right"| {{formatnum:{{Population de France/dernière pop||Paris}}}} || —
|}
suite'''


class PrefecturesTest(unittest.TestCase):
    def test_lecture_du_tableau(self):
        p = g.lire_prefectures(WIKITEXT)
        self.assertEqual(sorted(p), ["01", "2A", "75"])
        self.assertEqual(p["01"]["prefecture"], "Bourg-en-Bresse")
        self.assertEqual(p["01"]["sous_prefectures"], ["Belley", "Gex", "Nantua"])
        self.assertFalse(p["01"]["prefecture_region"])
        self.assertTrue(p["2A"]["prefecture_region"])          # en gras = préfecture de région
        self.assertEqual(p["2A"]["departement"], "Corse-du-Sud")
        self.assertEqual(p["75"]["sous_prefectures"], [])      # tiret long = aucune
        self.assertEqual(p["75"]["prefecture"], "Paris")


class DonneesPubliees(unittest.TestCase):
    """Cohérence des fichiers committés (content/territoires), sans réseau."""

    @classmethod
    def setUpClass(cls):
        d = RACINE / "content" / "territoires"
        cls.deps = json.loads((d / "departements.json").read_text(encoding="utf-8"))
        cls.regs = json.loads((d / "regions.json").read_text(encoding="utf-8"))
        cls.anciennes = json.loads((d / "anciennes-regions.json").read_text(encoding="utf-8"))

    def test_effectifs(self):
        self.assertEqual((len(self.deps), len(self.regs), len(self.anciennes)), (101, 18, 22))

    def test_codes_uniques_et_voisinage_symetrique(self):
        codes = [d["code"] for d in self.deps]
        self.assertEqual(len(set(codes)), 101)
        par = {d["code"]: d for d in self.deps}
        for d in self.deps:
            for v in d["voisins"]:
                self.assertIn(d["code"], par[v]["voisins"], f"{d['code']}-{v}")

    def test_chaque_departement_est_dans_une_region_et_une_seule(self):
        vus = [c for r in self.regs for c in r["departements"]]
        self.assertEqual(sorted(vus), sorted(d["code"] for d in self.deps))

    def test_sources_et_dates(self):
        for t in self.deps + self.regs + self.anciennes:
            self.assertGreaterEqual(len({s["url"] for s in t["sources"]}), 2, t["nom"])
            self.assertRegex(t["revu"], r"^\d{4}-\d{2}-\d{2}$")

    def test_faits_de_reference(self):
        par = {d["code"]: d for d in self.deps}
        self.assertEqual(par["33"]["prefecture"], "Bordeaux")
        self.assertEqual(par["95"]["prefecture"], "Cergy")
        self.assertEqual(par["976"]["prefecture"], "Mamoudzou")
        self.assertEqual(sum(len(d["sous_prefectures"]) for d in self.deps), 234)
        self.assertEqual(sum(1 for d in self.deps if d["prefecture_region"]), 18)


if __name__ == "__main__":
    unittest.main()
