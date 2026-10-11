import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_fondations as bf  # noqa: E402

PARCOURS = {"A", "B"}
SRC = [{"titre": "S1", "url": "https://exemple.fr/a"}, {"titre": "S2", "url": "https://exemple.org/b"}]
MOT = "mot "


def kit_valide():
    return {
        "id": "a01-demo", "parcours": "A", "ordre": 1, "titre": "Démo", "accroche": "Ça change quelque chose.",
        "duree_min": 120, "perissable": False, "revu": "2026-10-11",
        "fiche": [{"titre": f"Partie {i}", "paragraphes": [MOT * 90]} for i in range(3)],
        "ressource": {"titre": "R", "url": "https://exemple.fr/r", "type": "podcast", "pourquoi": "Parce que."},
        "debat": ["Une ?", "Deux ?", "Trois ?"],
        "sources": copy.deepcopy(SRC),
        "cartes": [{"id": f"a01-demo-{i:02d}", "recto": f"Q{i}", "verso": f"R{i}"} for i in range(12)],
    }


class ValidationTest(unittest.TestCase):
    def erreurs(self, **modif):
        k = kit_valide()
        k.update(modif)
        return bf.valider_kit(k, PARCOURS)

    def test_kit_valide(self):
        self.assertEqual(bf.valider_kit(kit_valide(), PARCOURS), [])

    def test_une_seule_source_refusee(self):
        self.assertTrue(any("moins de 2 sources" in e for e in self.erreurs(sources=SRC[:1])))

    def test_memes_sources_refusees(self):
        self.assertTrue(any("moins de 2 sources" in e for e in self.erreurs(sources=[SRC[0], dict(SRC[0])])))

    def test_parcours_inconnu_et_lettre_incoherente(self):
        self.assertTrue(any("parcours inconnu" in e for e in self.erreurs(parcours="Z")))
        self.assertTrue(any("lettre du parcours" in e for e in self.erreurs(parcours="B")))

    def test_identifiant_invalide(self):
        self.assertTrue(any("identifiant invalide" in e for e in self.erreurs(id="demo")))

    def test_fiche_trop_courte_ou_trop_longue(self):
        courte = [{"titre": f"P{i}", "paragraphes": ["trois mots ici"]} for i in range(3)]
        self.assertTrue(any("mots" in e for e in self.erreurs(fiche=courte)))
        longue = [{"titre": f"P{i}", "paragraphes": [MOT * 600]} for i in range(3)]
        self.assertTrue(any("mots" in e for e in self.erreurs(fiche=longue)))
        self.assertTrue(any("3 sections" in e for e in self.erreurs(fiche=kit_valide()["fiche"][:2])))

    def test_trois_questions_de_debat_avec_point_d_interrogation(self):
        self.assertTrue(any("3 questions" in e for e in self.erreurs(debat=["Une ?", "Deux ?"])))
        self.assertTrue(any("3 questions" in e for e in self.erreurs(debat=["Une ?", "Deux ?", "Trois."])))

    def test_ressource_obligatoire(self):
        self.assertTrue(any("ressource" in e for e in self.erreurs(ressource={"titre": "R"})))

    def test_nombre_de_cartes(self):
        self.assertTrue(any("cartes" in e for e in self.erreurs(cartes=kit_valide()["cartes"][:5])))

    def test_carte_mal_identifiee_ou_en_double(self):
        k = kit_valide()
        k["cartes"][0]["id"] = "b01-autre-00"
        k["cartes"][1]["id"] = k["cartes"][2]["id"]
        e = bf.valider_kit(k, PARCOURS)
        self.assertTrue(any("identifiant invalide" in x for x in e))
        self.assertTrue(any("en double" in x for x in e))

    def test_kit_perissable_exige_une_note(self):
        self.assertTrue(any("perissable_note" in e for e in self.erreurs(perissable=True)))
        self.assertEqual(self.erreurs(perissable=True, perissable_note="Taux de 2026."), [])

    def test_sources_propres_a_une_carte_doivent_etre_deux(self):
        k = kit_valide()
        k["cartes"][0]["sources"] = SRC[:1]
        self.assertTrue(any("moins de 2 sources" in e for e in bf.valider_kit(k, PARCOURS)))

    def test_date_de_revue_invalide(self):
        self.assertTrue(any("date de revue" in e for e in self.erreurs(revu="hier")))

    def test_heritage_des_cartes(self):
        k = kit_valide()
        k["cartes"][0]["perissable"] = True
        e = bf.etendre(k)
        self.assertEqual(e["cartes"][1]["sources"], k["sources"])
        self.assertEqual((e["cartes"][0]["perissable"], e["cartes"][1]["perissable"]), (True, False))
        self.assertEqual(e["cartes"][1]["revu"], "2026-10-11")


class ConstructionTest(unittest.TestCase):
    def test_construction_complete_sur_dossier_temporaire(self):
        with tempfile.TemporaryDirectory() as d:
            src, cible = Path(d) / "src", Path(d) / "cible"
            src.mkdir()
            (src / "parcours.json").write_text(json.dumps([{"id": "A", "titre": "T", "description": "D", "jours": [1]}]), encoding="utf-8")
            (src / "a01-demo.json").write_text(json.dumps(kit_valide()), encoding="utf-8")
            self.assertEqual(bf.construire(src, cible), [])
            index = json.loads((cible / "index.json").read_text(encoding="utf-8"))
            self.assertEqual([k["id"] for k in index["kits"]], ["a01-demo"])
            self.assertEqual(index["kits"][0]["nombre_cartes"], 12)
            kit = json.loads((cible / "a01-demo.json").read_text(encoding="utf-8"))
            self.assertEqual(kit["cartes"][0]["sources"], SRC)

    def test_nom_de_fichier_different_de_l_identifiant(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "src"
            src.mkdir()
            (src / "parcours.json").write_text(json.dumps([{"id": "A", "titre": "T", "description": "D", "jours": [1]}]), encoding="utf-8")
            (src / "a02-autre.json").write_text(json.dumps(kit_valide()), encoding="utf-8")
            self.assertTrue(any("nom du fichier" in e for e in bf.construire(src, Path(d) / "c")))

    def test_ordres_en_double(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "src"
            src.mkdir()
            (src / "parcours.json").write_text(json.dumps([{"id": "A", "titre": "T", "description": "D", "jours": [1]}]), encoding="utf-8")
            k2 = kit_valide()
            k2["id"] = "a02-autre"
            k2["cartes"] = [dict(c, id=c["id"].replace("a01-demo", "a02-autre")) for c in k2["cartes"]]
            (src / "a01-demo.json").write_text(json.dumps(kit_valide()), encoding="utf-8")
            (src / "a02-autre.json").write_text(json.dumps(k2), encoding="utf-8")
            self.assertTrue(any("ordre en double" in e for e in bf.construire(src, Path(d) / "c")))


class ContenuPublie(unittest.TestCase):
    """Les kits réellement présents dans content/fondations respectent les règles (sans réseau)."""

    def test_tous_les_kits_sont_valides(self):
        self.assertEqual(bf.construire(RACINE / "content" / "fondations", Path(tempfile.mkdtemp())), [])


if __name__ == "__main__":
    unittest.main()
