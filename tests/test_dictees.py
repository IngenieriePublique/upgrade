import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_dictees as bd  # noqa: E402
import dictee_lib as d  # noqa: E402

TEXTE = ("Il y avait une fois un vieux meunier. Il vivait seul, dans son moulin ; les gens du village le plaignaient. "
         "M. Seguin passait chaque matin. « Bonjour, maître Cornille ! » disait-il. Le vieux ne répondait pas, car il avait honte. "
         "Un jour, pourtant, tout se découvrit.")


class NettoyageTest(unittest.TestCase):
    def test_apostrophes_et_abreviations(self):
        self.assertEqual(d.nettoyer("l'homme et M Loisel"), "l’homme et M. Loisel")

    def test_compte_les_mots(self):
        self.assertEqual(d.nb_mots("Ah ! Gringoire, — qu’elle était jolie"), 5)


class ExtraireTest(unittest.TestCase):
    def test_s_arrete_a_la_fin_de_phrase_apres_le_minimum(self):
        t = d.extraire(TEXTE, "Il y avait une fois", 10)
        self.assertTrue(t.endswith("le plaignaient."))

    def test_une_abreviation_ne_termine_pas_une_phrase(self):
        t = d.extraire(TEXTE, "Il vivait seul", 15)
        self.assertIn("M. Seguin passait chaque matin.", t)

    def test_guillemets_toujours_fermes(self):
        t = d.extraire(TEXTE, "M. Seguin passait", 6)
        self.assertEqual(t.count("«"), t.count("»"))
        self.assertTrue(t.endswith("disait-il."))

    def test_debut_introuvable_ou_ambigu(self):
        with self.assertRaises(ValueError):
            d.extraire(TEXTE, "texte absent", 5)
        with self.assertRaises(ValueError):
            d.extraire("Il dit. Il dit. Il part.", "Il dit", 1)

    def test_texte_trop_court(self):
        with self.assertRaises(ValueError):
            d.extraire(TEXTE, "Un jour, pourtant", 50)

    def test_alineas_conserves(self):
        t = d.extraire("Première ligne un peu longue ici.\n\nDeuxième ligne un peu longue ici.", "Première", 8)
        self.assertIn("\n\n", t)


class DecoupageTest(unittest.TestCase):
    def test_les_segments_recomposent_le_texte(self):
        seg = d.decouper(TEXTE)
        self.assertEqual(" ".join(seg).split(), TEXTE.split())

    def test_pas_de_segment_trop_court_ni_trop_long(self):
        for s in d.decouper(TEXTE):
            self.assertLessEqual(d.nb_mots(s), 13)
        self.assertTrue(all(d.nb_mots(s) >= 3 for s in d.decouper(TEXTE)[:-1]))

    def test_decoupe_les_phrases_longues(self):
        long = " ".join(["mot"] * 40) + "."
        self.assertGreater(len(d.decouper(long)), 2)
        self.assertEqual(" ".join(d.decouper(long)).split(), long.split())


class FinsAlineaTest(unittest.TestCase):
    def test_une_fin_par_alinea(self):
        texte = "Un premier alinéa assez court ici.\n\nUn second alinéa, un peu plus long que le premier, tout de même."
        fins = d.fins_alinea(texte)
        self.assertEqual(len(fins), len(d.decouper(texte)))
        self.assertEqual(sum(fins), 2)
        self.assertTrue(fins[-1])


class ProfilTest(unittest.TestCase):
    def test_categories_completes(self):
        self.assertEqual(set(d.profil(TEXTE)), set(d.CATEGORIES))

    def test_detecte_des_pieges(self):
        p = d.profil("Ils ont mangé ses pommes et ces poires qu’elle a achetées, car ils étaient affamés.")
        self.assertGreater(p["homophone"], 0)
        self.assertGreater(p["pp"], 0)
        self.assertGreater(p["ponctuation"], 0)


def dictee_valide():
    texte = " ".join(["mot"] * 60) + "."
    return {"id": "d01", "titre": "T", "auteur": "A", "oeuvre": "O", "annee": 1900, "niveau": 1, "texte": texte,
            "mots": 60, "profil": d.profil(texte), "segments": d.decouper(texte),
            "fins_alinea": d.fins_alinea(texte),
            "source": {"titre": "S", "url": "https://exemple.fr/x"}, "licence": "libre", "revu": "2026-10-12"}


class ValidationDicteeTest(unittest.TestCase):
    def erreurs(self, **modif):
        x = dictee_valide()
        x.update(modif)
        return bd.valider_dictee(x, set())

    def test_valide(self):
        self.assertEqual(self.erreurs(), [])

    def test_mots_annonces_faux(self):
        self.assertTrue(any("annonce" in e for e in self.erreurs(mots=61)))

    def test_niveau_invalide(self):
        self.assertTrue(any("niveau" in e for e in self.erreurs(niveau=5)))

    def test_texte_trop_court(self):
        self.assertTrue(any("mots (attendu" in e for e in self.erreurs(texte="Trop court.", mots=2)))

    def test_segments_incoherents(self):
        self.assertTrue(any("segments" in e for e in self.erreurs(segments=["autre chose"])))

    def test_fins_d_alinea_incoherentes(self):
        self.assertTrue(any("alinéa" in e for e in self.erreurs(fins_alinea=[False])))

    def test_apostrophe_droite_refusee(self):
        texte = "l'" + " ".join(["mot"] * 60)
        self.assertTrue(any("apostrophe" in e for e in self.erreurs(texte=texte, mots=d.nb_mots(texte), segments=d.decouper(texte), fins_alinea=d.fins_alinea(texte))))

    def test_identifiant_en_double(self):
        ids = set()
        bd.valider_dictee(dictee_valide(), ids)
        self.assertTrue(any("double" in e for e in bd.valider_dictee(dictee_valide(), ids)))


class ContenuPublieTest(unittest.TestCase):
    """Les fichiers versionnés du dépôt doivent passer la validation et se publier à l'identique."""

    def test_contenu_du_depot_valide(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(bd.construire(cible=Path(tmp)), [])
            publie = json.loads((RACINE / "site" / "data" / "dictees" / "dictees.json").read_text(encoding="utf-8"))
            neuf = json.loads((Path(tmp) / "dictees.json").read_text(encoding="utf-8"))
            self.assertEqual(publie, neuf)

    def test_quarante_dictees_et_toutes_les_categories(self):
        dic = json.loads((RACINE / "content" / "dictees" / "dictees.json").read_text(encoding="utf-8"))["dictees"]
        self.assertEqual(len(dic), 40)
        self.assertEqual({x["niveau"] for x in dic}, {1, 2, 3, 4})
        regles = json.loads((RACINE / "content" / "dictees" / "regles.json").read_text(encoding="utf-8"))
        self.assertEqual({c["categorie"] for c in regles["cartes"]}, set(d.CATEGORIES))

    def test_regle_sans_deux_sources_refusee(self):
        regles = json.loads((RACINE / "content" / "dictees" / "regles.json").read_text(encoding="utf-8"))
        r = copy.deepcopy(regles)
        r["cartes"][0]["sources"] = r["cartes"][0]["sources"][:1]
        self.assertTrue(any("moins de 2 sources" in e for e in bd.valider_regles(r)))

    def test_categorie_inconnue_refusee(self):
        regles = json.loads((RACINE / "content" / "dictees" / "regles.json").read_text(encoding="utf-8"))
        r = copy.deepcopy(regles)
        r["cartes"][0]["categorie"] = "inconnue"
        self.assertTrue(any("catégorie inconnue" in e for e in bd.valider_regles(r)))


if __name__ == "__main__":
    unittest.main()
