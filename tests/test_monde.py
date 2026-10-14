import json
import math
import sys
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_monde as bm  # noqa: E402

SOURCE = RACINE / "content" / "territoires" / "pays.json"
PUBLIE = RACINE / "site" / "data" / "territoires" / "pays.json"
GEO = RACINE / "site" / "data" / "geo"


def ligne(rang, cap, coord="Point(2.35 48.85)"):
    return {"rank": {"value": "http://wikiba.se/ontology#" + rang}, "capLabel": {"value": cap}, "cap": {"value": "http://www.wikidata.org/entity/Q1"},
            "coord": {"value": coord}}


class ProjectionTest(unittest.TestCase):
    def test_le_centre_de_la_projection_est_l_origine(self):
        x, y = bm.azimutale(14, 54)(14, 54)
        self.assertAlmostEqual(x, 0, places=6)
        self.assertAlmostEqual(y, 0, places=6)

    def test_est_vers_la_droite_nord_vers_le_haut(self):
        p = bm.azimutale(14, 54)
        self.assertGreater(p(20, 54)[0], 0)
        self.assertGreater(p(14, 60)[1], 0)
        self.assertLess(p(14, 48)[1], 0)

    def test_la_projection_traverse_la_ligne_de_changement_de_date(self):
        p = bm.azimutale(150, -15)
        # Fidji (179°E) et Tonga (175°O) sont proches l'une de l'autre : un peu plus de 1 000 km
        d = math.dist(p(179, -17), p(-175, -21))
        self.assertTrue(500 < d < 1500, d)

    def test_distance_conservee_au_centre(self):
        p = bm.azimutale(0, 0)
        # 1 degré de longitude à l'équateur : environ 111 km
        self.assertAlmostEqual(p(1, 0)[0], 111.2, delta=0.5)

    def test_vue_a_la_largeur_voulue(self):
        x0, y1, ech, hauteur = bm.vue(bm.azimutale(14, 54), (-25, 34, 47, 71.5))
        self.assertGreater(hauteur, 0)
        px, py = (bm.azimutale(14, 54)(14, 54)[0] - x0) * ech, (y1 - bm.azimutale(14, 54)(14, 54)[1]) * ech
        self.assertTrue(0 < px < bm.LARGEUR and 0 < py < hauteur)


class DecoupeTest(unittest.TestCase):
    def test_un_polygone_dedans_est_inchange(self):
        carre = [(1, 1), (2, 1), (2, 2), (1, 2)]
        self.assertEqual(sorted(bm.decouper(carre, 0, 0, 10, 10)), sorted(carre))

    def test_un_polygone_dehors_disparait(self):
        self.assertEqual(bm.decouper([(20, 20), (21, 20), (21, 21)], 0, 0, 10, 10), [])

    def test_un_polygone_a_cheval_est_coupe_au_cadre(self):
        res = bm.decouper([(5, 5), (15, 5), (15, 8), (5, 8)], 0, 0, 10, 10)
        self.assertTrue(res)
        self.assertTrue(all(0 <= x <= 10 and 0 <= y <= 10 for x, y in res))
        self.assertAlmostEqual(max(x for x, _ in res), 10)


class CapitaleTest(unittest.TestCase):
    def test_une_capitale_simple(self):
        nom, qid, lon, lat = bm.choisir_capitale("FR", [ligne("NormalRank", "Paris")])
        self.assertEqual((nom, qid, lon, lat), ("Paris", "Q1", 2.35, 48.85))

    def test_les_valeurs_deprecies_sont_ecartees(self):
        nom, *_ = bm.choisir_capitale("ID", [ligne("PreferredRank", "Jakarta"), ligne("DeprecatedRank", "Nusantara")])
        self.assertEqual(nom, "Jakarta")

    def test_le_rang_prefere_l_emporte(self):
        nom, *_ = bm.choisir_capitale("BJ", [ligne("PreferredRank", "Porto-Novo"), ligne("NormalRank", "Cotonou")])
        self.assertEqual(nom, "Porto-Novo")

    def test_plusieurs_capitales_se_departagent_dans_la_table(self):
        nom, *_ = bm.choisir_capitale("BO", [ligne("NormalRank", "La Paz"), ligne("NormalRank", "Sucre")])
        self.assertEqual(nom, "Sucre")

    def test_plusieurs_capitales_inconnues_font_echouer(self):
        with self.assertRaises(SystemExit):
            bm.choisir_capitale("XX", [ligne("NormalRank", "A"), ligne("NormalRank", "B")])

    def test_libelle_corrige(self):
        self.assertEqual(bm.choisir_capitale("NO", [ligne("NormalRank", "Q585")])[0], "Oslo")


class ContinentTest(unittest.TestCase):
    def test_rattachement(self):
        c = bm.continent_de
        self.assertEqual(c("FR", {"CONTINENT": "Europe", "SUBREGION": "Western Europe"}), "europe")
        self.assertEqual(c("CY", {"CONTINENT": "Asia", "SUBREGION": "Western Asia"}), "europe")
        self.assertEqual(c("MU", {"CONTINENT": "Seven seas (open ocean)", "SUBREGION": "Eastern Africa"}), "afrique")
        self.assertEqual(c("CU", {"CONTINENT": "North America", "SUBREGION": "Caribbean"}), "caraibes")
        self.assertEqual(c("GT", {"CONTINENT": "North America", "SUBREGION": "Central America"}), "amerique-nord")
        with self.assertRaises(ValueError):
            c("XX", {"CONTINENT": "Antarctica", "SUBREGION": ""})


class PublicationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = json.loads(SOURCE.read_text(encoding="utf-8"))
        cls.pub = json.loads(PUBLIE.read_text(encoding="utf-8"))

    def test_193_etats_une_seule_fois(self):
        ids = [p["id"] for p in self.src["pays"]]
        self.assertEqual(len(ids), 193)
        self.assertEqual(len(set(ids)), 193)
        self.assertEqual(ids and sorted(ids), sorted(p["id"] for p in self.pub["pays"]))
        self.assertEqual(set(ids), set(bm.ARTICLES))

    def test_chaque_pays_a_nom_capitale_continent_et_wikidata(self):
        for p in self.src["pays"]:
            self.assertTrue(p["nom"] and p["capitale"], p["id"])
            self.assertIn(p["continent"], bm.CODES_CONTINENTS)
            self.assertRegex(p["qid"], r"^Q\d+$")
            self.assertRegex(p["capitale_qid"], r"^Q\d+$")
            self.assertTrue(-180 <= p["lon"] <= 180 and -90 <= p["lat"] <= 90, p["nom"])

    def test_la_source_cite_wikidata_et_natural_earth(self):
        urls = " ".join(s["url"] for s in self.src["sources"])
        self.assertIn("wikidata.org", urls)
        self.assertIn("naturalearthdata.com", urls)
        self.assertGreaterEqual(len(self.src["sources"]), 2)

    def test_capitales_connues(self):
        cap = {p["id"]: p["capitale"] for p in self.src["pays"]}
        self.assertEqual([cap[i] for i in ("FR", "DE", "ES", "CA", "AU", "ZA", "BO")], ["Paris", "Berlin", "Madrid", "Ottawa", "Canberra", "Pretoria", "Sucre"])
        notes = {p["id"]: p.get("note", "") for p in self.src["pays"]}
        self.assertIn("La Paz", notes["BO"])

    def test_cartes_de_continent_coherentes(self):
        for cont in bm.CONTINENTS:
            geo = json.loads((GEO / f"monde-{cont['code']}.json").read_text(encoding="utf-8"))
            _, _, largeur, hauteur = (float(v) for v in geo["viewBox"].split())
            pays = [p for p in self.pub["pays"] if p["continent"] == cont["code"]]
            self.assertGreater(len(pays), 5)
            for p in pays:
                f = geo["pays"][p["id"]]
                self.assertTrue(0 <= p["cx"] <= largeur and 0 <= p["cy"] <= hauteur, p["nom"])
                self.assertTrue(0 <= p["x"] <= largeur and 0 <= p["y"] <= hauteur, f"capitale de {p['nom']}")
                self.assertTrue(f["d"] or f.get("petit"), p["nom"])

    def test_les_pays_voisins_sont_dessines_en_contexte(self):
        geo = json.loads((GEO / "monde-europe.json").read_text(encoding="utf-8"))
        self.assertIn("TR", geo["pays"])
        self.assertIn("MC", geo["pays"])
        self.assertTrue(geo["pays"]["MC"].get("petit"))
        self.assertFalse(geo["pays"]["FR"].get("petit"))

    def test_monde_centre_sur_les_territoires_francais(self):
        om = json.loads((GEO / "monde-om.json").read_text(encoding="utf-8"))
        self.assertEqual([m["code"] for m in om["marqueurs"]], ["971", "972", "973", "974", "976", "metropole"])
        self.assertIn("FR", om["pays"])
        _, _, largeur, hauteur = (float(v) for v in om["viewBox"].split())
        self.assertTrue(all(0 < m["x"] < largeur and 0 < m["y"] < hauteur for m in om["marqueurs"]))
        # pas le monde entier : l'Asie de l'Est et le Pacifique sont hors de la fenêtre (de 72° O à 66° E)
        self.assertNotIn("JP", om["pays"])
        self.assertNotIn("AU", om["pays"])

    def test_poids_raisonnable(self):
        total = sum(f.stat().st_size for f in GEO.glob("monde-*.json"))
        self.assertLess(total, 600_000, total)


if __name__ == "__main__":
    unittest.main()
