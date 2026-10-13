import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_lectures as bl  # noqa: E402

SOURCE = RACINE / "content" / "lectures" / "lectures.json"
reel = lambda: json.loads(SOURCE.read_text(encoding="utf-8"))


class LecturesTest(unittest.TestCase):
    def setUp(self):
        self.d = copy.deepcopy(reel())

    def test_contenu_reel_valide(self):
        self.assertEqual(bl.valider(self.d), [])

    def test_publication_a_jour(self):
        pub = json.loads((RACINE / "site" / "data" / "lectures" / "lectures.json").read_text(encoding="utf-8"))
        attendu = {"themes": reel()["themes"], "lectures": reel()["lectures"]}
        self.assertEqual(pub, attendu, "lectures.json publié n'est plus à jour : relancer build_lectures.py")

    def test_construire_dans_un_dossier_temporaire(self):
        with tempfile.TemporaryDirectory() as t:
            cible = Path(t) / "sous" / "lectures.json"
            self.assertEqual(bl.construire(SOURCE, cible), [])
            self.assertTrue(cible.exists())

    def test_au_moins_un_article_par_theme_et_quinze_lectures(self):
        self.assertGreaterEqual(len(self.d["lectures"]), 15)

    def test_identifiant_en_double(self):
        self.d["lectures"][1]["id"] = self.d["lectures"][0]["id"]
        self.assertTrue(any("double" in e for e in bl.valider(self.d)))

    def test_annee_hors_periode(self):
        self.d["lectures"][0]["annee"] = 2018
        self.assertTrue(any("2020-2026" in e for e in bl.valider(self.d)))

    def test_adresse_non_https(self):
        self.d["lectures"][0]["url"] = "http://exemple.fr"
        self.assertTrue(any("https" in e for e in bl.valider(self.d)))

    def test_theme_inconnu(self):
        self.d["lectures"][0]["theme"] = "inconnu"
        self.assertTrue(any("thème inconnu" in e for e in bl.valider(self.d)))

    def test_resume_trop_long(self):
        self.d["lectures"][0]["resume"] = "x" * 501
        self.assertTrue(any("trop long" in e for e in bl.valider(self.d)))

    def test_texte_de_l_auteur_sans_source(self):
        self.d["lectures"][0]["texte_auteur"] = "Un résumé."
        self.d["lectures"][0].pop("texte_source", None)
        self.assertTrue(any("texte_source" in e for e in bl.valider(self.d)))

    def test_texte_de_l_auteur_trop_long(self):
        self.d["lectures"][0].update(texte_auteur="x" * 3601, texte_source="HAL")
        self.assertTrue(any("trop long" in e for e in bl.valider(self.d)))

    def test_mots_cles_invalides(self):
        self.d["lectures"][0]["mots_cles"] = "pas une liste"
        self.assertTrue(any("mots_cles" in e for e in bl.valider(self.d)))

    def test_la_plupart_des_lectures_ont_le_texte_de_l_auteur(self):
        avec = [l for l in self.d["lectures"] if l.get("texte_auteur")]
        self.assertGreaterEqual(len(avec), 15)


if __name__ == "__main__":
    unittest.main()
