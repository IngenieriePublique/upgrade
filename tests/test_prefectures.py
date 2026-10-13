import json
import sys
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_prefectures as bp  # noqa: E402

SOURCE = RACINE / "content" / "territoires" / "prefectures.json"
PUBLIE = RACINE / "site" / "data" / "territoires" / "prefectures.json"
DEPARTEMENTS = RACINE / "content" / "territoires" / "departements.json"


class PrefecturesTest(unittest.TestCase):
    def test_normaliser_ignore_accents_tirets_et_casse(self):
        self.assertEqual(bp.normaliser("Saint-Étienne"), bp.normaliser("saint etienne"))
        self.assertEqual(bp.normaliser("Bourg-en-Bresse"), "bourgenbresse")

    def test_une_prefecture_par_departement_au_bon_nom(self):
        deps = json.loads(DEPARTEMENTS.read_text(encoding="utf-8"))
        src = {p["code"]: p for p in json.loads(SOURCE.read_text(encoding="utf-8"))["prefectures"]}
        pub = json.loads(PUBLIE.read_text(encoding="utf-8"))["prefectures"]
        self.assertEqual(len(src), 101)
        self.assertEqual(set(pub), set(src))
        for d in deps:
            self.assertEqual(src[d["code"]]["nom"], d["prefecture"], d["nom"])
            self.assertEqual(pub[d["code"]]["nom"], d["prefecture"], d["nom"])

    def test_coordonnees_plausibles(self):
        for p in json.loads(SOURCE.read_text(encoding="utf-8"))["prefectures"]:
            metropole = p["code"] not in ("971", "972", "973", "974", "976")
            if metropole:
                self.assertTrue(-5.5 < p["lon"] < 10 and 41 < p["lat"] < 51.5, p["nom"])

    def test_la_source_cite_wikidata(self):
        d = json.loads(SOURCE.read_text(encoding="utf-8"))
        self.assertTrue(any("wikidata.org" in s["url"] for s in d["sources"]))


if __name__ == "__main__":
    unittest.main()
