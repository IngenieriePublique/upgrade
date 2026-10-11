"""Tests du contenu du sprint candidature : validation (cas limites) et cohérence des fichiers réels. Aucun accès au réseau."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_sprint as bs  # noqa: E402
import check_links as cl  # noqa: E402

S1 = {"titre": "S1", "url": "https://exemple.fr/a"}
S2 = {"titre": "S2", "url": "https://exemple.org/b"}
EMP = {"id": "demo", "nom": "Démo", "type": "Agence", "echelon": "local", "priorite": "A", "mission": "M", "pourquoi": "P",
       "candidater": [{"titre": "Offres", "url": "https://exemple.fr/o"}], "sources": [S1, S2], "revu": "2026-10-11", "perissable": True}


def fiche(**modif):
    e = copy.deepcopy(EMP)
    e.update(modif)
    return {"revu": "2026-10-11", "portails": [], "employeurs": [e]}


def charger(rel):
    return json.loads((RACINE / "content" / rel).read_text(encoding="utf-8"))


class EmployeursTest(unittest.TestCase):
    def test_fiche_valide(self):
        self.assertEqual(bs.valider_employeurs(fiche(), minimum=1), [])

    def test_refuse_une_seule_source_ou_deux_fois_la_meme(self):
        self.assertTrue(any("moins de 2 sources" in x for x in bs.valider_employeurs(fiche(sources=[S1]), minimum=1)))
        self.assertTrue(any("moins de 2 sources" in x for x in bs.valider_employeurs(fiche(sources=[S1, {**S1, "titre": "autre"}]), minimum=1)))

    def test_refuse_champs_invalides(self):
        e = bs.valider_employeurs(fiche(echelon="mondial", priorite="Z", mission=" ", revu="hier", perissable="oui"), minimum=1)
        for attendu in ("échelon invalide", "priorité invalide", "mission vide", "date de revue invalide", "perissable"):
            self.assertTrue(any(attendu in x for x in e), attendu)

    def test_refuse_sans_adresse_de_candidature_et_id_en_double(self):
        self.assertTrue(any("aucune adresse" in x for x in bs.valider_employeurs(fiche(candidater=[]), minimum=1)))
        d = fiche()
        d["employeurs"].append(copy.deepcopy(EMP))
        self.assertTrue(any("en double" in x for x in bs.valider_employeurs(d, minimum=1)))

    def test_exige_le_minimum_de_fiches(self):
        self.assertTrue(any("au moins 30" in x for x in bs.valider_employeurs(fiche())))


class QuestionsTest(unittest.TestCase):
    D = {"avertissement": "a", "categories": [{"id": "c1"}], "sources": [S1, S2],
         "questions": [{"id": "q-1", "categorie": "c1", "question": "Q ?", "cherche": "x", "piste": "y"}]}

    def test_valide_et_cas_limites(self):
        self.assertEqual(bs.valider_questions(copy.deepcopy(self.D), minimum=1), [])
        d = copy.deepcopy(self.D)
        d["questions"][0].update(categorie="inconnue", piste="")
        e = bs.valider_questions(d, minimum=1)
        self.assertTrue(any("catégorie inconnue" in x for x in e))
        self.assertTrue(any("piste vide" in x for x in e))


class FichiersReelsTest(unittest.TestCase):
    def test_contenu_reel_valide(self):
        for rel, valider in bs.FICHIERS:
            self.assertEqual(valider(charger(rel)), [], rel)

    def test_publication_identique_au_contenu(self):
        for rel, _ in bs.FICHIERS:
            self.assertEqual(charger(rel), json.loads((RACINE / "site" / "data" / rel).read_text(encoding="utf-8")),
                             f"{rel} : relancer python scripts/build_sprint.py")

    def test_construire_ecrit_les_fichiers_dans_la_cible(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(bs.construire(cible=Path(t)), [])
            self.assertTrue((Path(t) / "radar" / "employeurs.json").exists())
            self.assertTrue((Path(t) / "oral" / "questions.json").exists())

    def test_les_emplacements_des_histoires_et_pitchs_sont_ceux_attendus_par_le_site(self):
        g = charger("oral/gabarits.json")
        self.assertEqual([p["id"] for p in g["pitchs"]], ["p30", "p90", "p180"])
        self.assertEqual(len(g["star"]["emplacements"]), 8)

    def test_chaque_candidature_pointe_vers_une_adresse_http(self):
        for e in charger("radar/employeurs.json")["employeurs"]:
            for c in e["candidater"]:
                self.assertRegex(c["url"], r"^https?://")


class VerificationLiensTest(unittest.TestCase):
    def test_collecte_des_adresses(self):
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / "a.json"
            f.write_text(json.dumps({"x": [{"url": "https://a.fr", "titre": "t"}], "y": {"url": "https://b.fr"}}), encoding="utf-8")
            self.assertEqual(sorted(cl.collecter([f])), ["https://a.fr", "https://b.fr"])


if __name__ == "__main__":
    unittest.main()
