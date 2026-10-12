import datetime
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import audit_croisiere as ac  # noqa: E402
import signalements as sg  # noqa: E402

D = datetime.date


class MoisTest(unittest.TestCase):
    def test_mois_entiers(self):
        self.assertEqual(ac.mois_entre(D(2026, 10, 12), D(2027, 4, 12)), 6)
        self.assertEqual(ac.mois_entre(D(2026, 10, 12), D(2027, 4, 11)), 5)
        self.assertEqual(ac.mois_entre(D(2026, 10, 12), D(2026, 10, 12)), 0)
        self.assertEqual(ac.mois_entre(D(2026, 10, 12), D(2026, 9, 1)), 0)  # revue dans le futur : pas ancienne

    def test_date_invalide(self):
        self.assertIsNone(ac.date_ou_none("pas une date"))
        self.assertIsNone(ac.date_ou_none(None))


class CollecteTest(unittest.TestCase):
    def test_collecte_les_revues_a_tous_les_niveaux(self):
        x = {"revu": "2026-01-01", "employeurs": [{"id": "a", "revu": "2026-02-01", "perissable": True}, {"id": "b"}],
             "cartes": [{"revu": "invalide"}]}
        r = ac.collecter(x)
        self.assertEqual(sorted((c, d.isoformat(), p) for c, d, p in r),
                         [(".", "2026-01-01", False), ("/employeurs[0]", "2026-02-01", True)])

    def test_resume_perissable_et_autres(self):
        entrees = [(".", D(2026, 1, 1), True), ("/a", D(2026, 1, 1), False), ("/b", D(2026, 9, 1), True)]
        r = ac.resume_fichier(entrees, D(2026, 10, 12))
        self.assertEqual(r["n"], 3)
        self.assertEqual(r["a_revoir"], 1)   # seul le périssable de janvier a plus de 6 mois ; l'autre n'a pas 12 mois
        self.assertEqual(r["perissables"], 2)
        self.assertEqual(r["plus_ancienne"], D(2026, 1, 1))
        r2 = ac.resume_fichier(entrees, D(2027, 2, 1))
        self.assertEqual(r2["a_revoir"], 3 - 1)  # le périssable de septembre (5 mois) n'est pas encore à revoir
        self.assertIsNone(ac.resume_fichier([], D(2026, 10, 12)))


class KitsBriefTest(unittest.TestCase):
    def test_kits_par_parcours_et_reste(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t)
            for i, p in enumerate("AAB"):
                (d / f"{p.lower()}0{i}-x.json").write_text(json.dumps({"parcours": p}), encoding="utf-8")
            (d / "parcours.json").write_text("[]", encoding="utf-8")
            e = ac.etat_kits(d, cible=11, par_mois=4)
            self.assertEqual(e, {"par_parcours": {"A": 2, "B": 1}, "total": 3, "reste": 8, "mois": 2})

    def test_brief_frais_ou_ancien(self):
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / "index.json"
            f.write_text(json.dumps({"derniere": "2026-10-10"}), encoding="utf-8")
            self.assertTrue(ac.etat_brief(f, D(2026, 10, 12))["ok"])
            self.assertFalse(ac.etat_brief(f, D(2026, 10, 20))["ok"])
            self.assertFalse(ac.etat_brief(Path(t) / "absent.json", D(2026, 10, 20))["ok"])


class AuditReelTest(unittest.TestCase):
    def test_audit_du_depot_aujourd_hui_rien_a_revoir(self):
        a = ac.audit(RACINE, D(2026, 10, 13))
        self.assertTrue(all(not f.get("a_revoir") and not f.get("erreur") for f in a["fichiers"].values()))
        self.assertGreaterEqual(a["kits"]["total"], 25)

    def test_audit_dans_un_an_tout_est_a_revoir(self):
        a = ac.audit(RACINE, D(2027, 10, 13))
        self.assertTrue(ac.a_quelque_chose_a_revoir(a))
        self.assertIn("Contenus à revoir", ac.rapport(a))


class SignalementsTest(unittest.TestCase):
    SAUVEGARDE = {"format": "upgrade-sauvegarde", "meta": {"flags": [
        {"cardId": "sigles-anct", "ts": 5}, {"cardId": "terr-placer-33", "ts": 3}, {"cardId": "inexistante", "ts": 9}, {"pas": "une carte"}]}}

    def test_flags_tries_par_date(self):
        self.assertEqual([f["ts"] for f in sg.signalements(self.SAUVEGARDE)], [3, 5, 9])

    def test_rapport_croise_avec_le_contenu(self):
        r = sg.rapport(self.SAUVEGARDE, sg.cartes_du_depot())
        self.assertIn("3 signalement(s)", r)
        self.assertIn("sigles-anct  (content/cartes/sigles.json)", r)
        self.assertIn("Recto :", r)
        self.assertIn("Source :", r)
        self.assertIn("terr-placer-33 : carte non écrite dans content/", r)

    def test_aucun_signalement(self):
        self.assertEqual(sg.rapport({"meta": {}}, {}), "Aucun signalement dans cette sauvegarde.")

    def test_cartes_de_kits_heritent_des_sources_du_kit(self):
        idx = sg.cartes_du_depot()
        _, carte, sources = idx["c01-evaluation-definition-01"]
        self.assertTrue(sources and sources[0].get("url", "").startswith("http"), carte)


if __name__ == "__main__":
    unittest.main()
