import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_bilan as bb  # noqa: E402

SOURCE = RACINE / "content" / "bilan" / "bilan.json"
reel = lambda: json.loads(SOURCE.read_text(encoding="utf-8"))


class BilanTest(unittest.TestCase):
    def setUp(self):
        self.b = copy.deepcopy(reel())

    def test_contenu_reel_valide(self):
        self.assertEqual(bb.valider(self.b), [])

    def test_publication_identique_a_la_source(self):
        pub = json.loads((RACINE / "site" / "data" / "bilan" / "bilan.json").read_text(encoding="utf-8"))
        self.assertEqual(pub, reel(), "bilan.json publié n'est plus à jour : relancer build_bilan.py")

    def test_construire_dans_un_dossier_temporaire(self):
        with tempfile.TemporaryDirectory() as t:
            cible = Path(t) / "sous" / "bilan.json"
            self.assertEqual(bb.construire(SOURCE, cible), [])
            self.assertTrue(cible.exists())

    def test_objectif_non_numerique(self):
        self.b["objectifs"]["kits_publies"] = "trente"
        self.assertTrue(any("kits_publies" in e for e in bb.valider(self.b)))

    def test_reduction_hors_bornes(self):
        self.b["objectifs"]["reduction_reseaux_pct"] = 150
        self.assertTrue(any("entre 10 et 100" in e for e in bb.valider(self.b)))

    def test_revue_doit_avoir_cinq_questions(self):
        self.b["revue"]["questions"].pop()
        self.assertTrue(any("5 questions" in e for e in bb.valider(self.b)))

    def test_question_sans_point_d_interrogation(self):
        self.b["revue"]["questions"][0]["label"] = "Dis-moi ce qui a marché."
        self.assertTrue(any("terminé par" in e for e in bb.valider(self.b)))

    def test_audit_bloc_manquant(self):
        self.b["audit"]["modules"][0]["bloc"] = "inconnu"
        self.assertTrue(any("blocs" in e for e in bb.valider(self.b)))

    def test_decisions_modifiees(self):
        self.b["audit"]["decisions"].pop()
        self.assertTrue(any("décisions" in e for e in bb.valider(self.b)))

    def test_besoin_sans_lien_interne(self):
        self.b["reseaux"]["besoins"][0]["ou"] = "https://exemple.org"
        self.assertTrue(any("lien interne" in e for e in bb.valider(self.b)))

    def test_outil_avec_une_seule_source(self):
        self.b["reseaux"]["blocage"][0]["sources"] = self.b["reseaux"]["blocage"][0]["sources"][:1]
        self.assertTrue(any("2 sources distinctes" in e for e in bb.valider(self.b)))

    def test_outil_sans_source_declare(self):
        # le dernier outil du fichier se déclare « sans source externe » : accepté sans source
        dernier = self.b["reseaux"]["blocage"][-1]
        self.assertIn("sans source", dernier["outil"].lower())
        self.assertEqual(dernier["sources"], [])
        self.assertEqual(bb.valider(self.b), [])

    def test_outil_sans_etapes(self):
        self.b["reseaux"]["blocage"][1]["etapes"] = ["une seule"]
        self.assertTrue(any("3 étapes" in e for e in bb.valider(self.b)))

    def test_si_alors_incomplet(self):
        self.b["reseaux"]["si_alors"]["champs"] = self.b["reseaux"]["si_alors"]["champs"][:2]
        self.assertTrue(any("si… alors" in e for e in bb.valider(self.b)))

    def test_pas_de_decision_automatique_sur_les_appareils(self):
        # l'avertissement doit rappeler que l'utilisateur applique lui-même les étapes
        self.assertIn("toi-même", self.b["reseaux"]["avertissement"])


if __name__ == "__main__":
    unittest.main()
