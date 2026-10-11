import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_content as bc  # noqa: E402

CARTE = {"id": "demo-un", "recto": "A", "verso": "B", "perissable": False, "revu": "2026-10-11",
         "sources": [{"titre": "S1", "url": "https://exemple.fr/a"}, {"titre": "S2", "url": "https://exemple.org/b"}]}
PAQUET = {"id": "demo", "titre": "Démo", "description": "Un paquet", "cartes": [CARTE]}


def paquet(**modif_carte):
    p = copy.deepcopy(PAQUET)
    p["cartes"][0].update(modif_carte)
    return p


class ValidationTest(unittest.TestCase):
    def test_paquet_valide(self):
        self.assertEqual(bc.valider_paquet(copy.deepcopy(PAQUET)), [])

    def test_refuse_une_seule_source(self):
        e = bc.valider_paquet(paquet(sources=[CARTE["sources"][0]]))
        self.assertTrue(any("moins de 2 sources" in x for x in e))

    def test_refuse_deux_fois_la_meme_source(self):
        s = CARTE["sources"][0]
        e = bc.valider_paquet(paquet(sources=[s, {**s, "titre": "autre"}]))
        self.assertTrue(any("moins de 2 sources" in x for x in e))

    def test_refuse_source_sans_https(self):
        e = bc.valider_paquet(paquet(sources=[{"titre": "x", "url": "ftp://a"}, CARTE["sources"][1]]))
        self.assertTrue(any("mal formée" in x for x in e))

    def test_refuse_verso_vide_et_date_invalide(self):
        e = bc.valider_paquet(paquet(verso=" ", revu="hier"))
        self.assertTrue(any("verso vide" in x for x in e))
        self.assertTrue(any("date de revue" in x for x in e))

    def test_identifiant_doit_porter_le_nom_du_paquet(self):
        e = bc.valider_paquet(paquet(id="autre-un"))
        self.assertTrue(any("identifiant invalide" in x for x in e))

    def test_identifiants_en_double(self):
        p = copy.deepcopy(PAQUET)
        p["cartes"].append(copy.deepcopy(CARTE))
        self.assertTrue(any("en double" in x for x in bc.valider_paquet(p)))

    def test_perissable_doit_etre_booleen(self):
        self.assertTrue(bc.valider_paquet(paquet(perissable="oui")))


class ConstructionTest(unittest.TestCase):
    def test_ecrit_les_paquets_et_l_index(self):
        with tempfile.TemporaryDirectory() as t:
            src, dst = Path(t, "src"), Path(t, "dst")
            src.mkdir()
            (src / "demo.json").write_text(json.dumps(PAQUET), encoding="utf-8")
            self.assertEqual(bc.construire(src, dst), [])
            idx = json.loads((dst / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(idx["paquets"][0]["nombre"], 1)
            self.assertEqual(len(json.loads((dst / "demo.json").read_text(encoding="utf-8"))["cartes"]), 1)

    def test_n_ecrit_rien_si_invalide(self):
        with tempfile.TemporaryDirectory() as t:
            src, dst = Path(t, "src"), Path(t, "dst")
            src.mkdir()
            (src / "demo.json").write_text(json.dumps(paquet(sources=[])), encoding="utf-8")
            self.assertTrue(bc.construire(src, dst))
            self.assertFalse(dst.exists())


class ContenuReelTest(unittest.TestCase):
    def test_les_paquets_du_depot_sont_valides(self):
        ids = set()
        for f in sorted((Path(__file__).resolve().parent.parent / "content" / "cartes").glob("*.json")):
            d = json.loads(f.read_text(encoding="utf-8"))
            self.assertEqual(bc.valider_paquet(d, ids), [], f.name)


if __name__ == "__main__":
    unittest.main()
