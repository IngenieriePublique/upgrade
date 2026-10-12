import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_atelier as ba  # noqa: E402
import portfolio_ofgl as po  # noqa: E402

SOURCE = RACINE / "content" / "atelier"
lire = lambda nom: json.loads((SOURCE / nom).read_text(encoding="utf-8"))


class NombresTest(unittest.TestCase):
    def test_formats_francais(self):
        self.assertEqual(ba.nombres("1 225,9 M€ et 7 % en 2025"), {"1225,9", "7", "2025"})

    def test_ignore_les_renvois(self):
        self.assertEqual(ba.nombres("Selon la Cour [D1, D2] et [D3], 52,5 %"), {"52,5"})

    def test_ignore_le_signe_moins(self):
        self.assertEqual(ba.nombres("−3,6 % puis -62,5 M€"), {"3,6", "62,5"})


class ContenuReelTest(unittest.TestCase):
    def test_tout_le_contenu_est_valide(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(ba.construire(SOURCE, Path(t)), [])
            self.assertEqual(sorted(p.name for p in Path(t).iterdir()), ["courts.json", "grille.json", "notes.json", "portfolio.json"])

    def test_les_donnees_publiees_correspondent_au_contenu(self):
        for nom in ("grille", "notes", "courts", "portfolio"):
            pub = json.loads((RACINE / "site" / "data" / "atelier" / f"{nom}.json").read_text(encoding="utf-8"))
            self.assertEqual(pub, lire(f"{nom}.json"), f"{nom}.json publié n'est plus à jour : relancer build_atelier.py")


class GrilleTest(unittest.TestCase):
    def test_critere_manquant(self):
        g = lire("grille.json")
        g["criteres"] = g["criteres"][:-1]
        self.assertTrue(any("critères doivent être" in e for e in ba.valider_grille(g)))

    def test_niveau_manquant(self):
        g = lire("grille.json")
        g["criteres"][0]["niveaux"] = g["criteres"][0]["niveaux"][:3]
        self.assertTrue(any("quatre descriptions" in e for e in ba.valider_grille(g)))

    def test_une_seule_source(self):
        g = lire("grille.json")
        g["sources"] = g["sources"][:1]
        self.assertTrue(any("sources distinctes" in e for e in ba.valider_grille(g)))


class NoteTest(unittest.TestCase):
    def setUp(self):
        self.n = copy.deepcopy(lire("notes.json")["notes"][0])

    def erreurs(self):
        return ba.valider_note(self.n, set())

    def test_note_valide(self):
        self.assertEqual(self.erreurs(), [])

    def test_nombre_invente_est_refuse(self):
        self.n["modele"]["sections"][0]["paragraphes"][0] += " Le déficit atteindrait 777 Md€."
        self.assertTrue(any("777" in e for e in self.erreurs()))

    def test_nombre_justifie_par_un_calcul_est_accepte(self):
        self.n["modele"]["sections"][0]["paragraphes"][0] += " Soit 4242 communes."
        self.n["modele"]["calculs"].append("4242 communes : somme de deux lignes du tableau D3.")
        self.assertEqual(self.erreurs(), [])

    def test_renvoi_inexistant(self):
        self.n["modele"]["sections"][0]["paragraphes"][0] += " [D9]"
        self.assertTrue(any("D9" in e for e in self.erreurs()))

    def test_document_jamais_cite(self):
        for s in self.n["modele"]["sections"]:
            s["paragraphes"] = [p.replace("[D2]", "").replace("D2, ", "").replace(", D2", "") for p in s.get("paragraphes", [])]
            s["liste"] = [p.replace("[D2]", "") for p in s.get("liste", [])]
        self.assertTrue(any("D2" in e and "cité" in e for e in self.erreurs()))

    def test_note_trop_courte(self):
        self.n["modele"]["sections"] = self.n["modele"]["sections"][:4]
        for s in self.n["modele"]["sections"]:
            s["paragraphes"] = ["[D1] [D2] [D3] court."]
            s["liste"] = []
        self.assertTrue(any("mots" in e for e in self.erreurs()))

    def test_corpus_de_deux_documents(self):
        self.n["corpus"] = self.n["corpus"][:2]
        self.assertTrue(any("3 documents" in e for e in self.erreurs()))

    def test_adresses_identiques(self):
        self.n["corpus"][1]["url"] = self.n["corpus"][0]["url"]
        self.assertTrue(any("adresses distinctes" in e for e in self.erreurs()))

    def test_tableau_irregulier(self):
        self.n["corpus"][2]["tableau"]["lignes"][0].pop()
        self.assertTrue(any("longueur" in e for e in self.erreurs()))

    def test_limite_obligatoire(self):
        self.n["corpus"][0]["limite"] = ""
        self.assertTrue(any("limite" in e for e in self.erreurs()))


class CourtTest(unittest.TestCase):
    def setUp(self):
        self.types = lire("courts.json")["types"]
        self.c = copy.deepcopy(next(c for c in lire("courts.json")["courts"] if c["type"] == "dix-lignes"))

    def erreurs(self):
        return ba.valider_court(self.c, self.types, set())

    def test_valide(self):
        self.assertEqual(self.erreurs(), [])

    def test_chiffre_invente(self):
        self.c["modele"]["paragraphes"][0] += " Cela représente 99 Md€."
        self.assertTrue(any("99" in e for e in self.erreurs()))

    def test_modele_trop_long_pour_dix_lignes(self):
        self.c["modele"]["paragraphes"] = [" ".join(["mot"] * 150)]
        self.assertTrue(any("140" in e for e in self.erreurs()))

    def test_type_inconnu(self):
        self.c["type"] = "dissertation"
        self.assertTrue(any("type inconnu" in e for e in self.erreurs()))

    def test_titres_en_nombre_different(self):
        c = copy.deepcopy(next(c for c in lire("courts.json")["courts"] if c["type"] == "titres"))
        c["modele"]["liste"] = c["modele"]["liste"][:-1]
        self.assertTrue(any("autant de titres" in e for e in ba.valider_court(c, self.types, set())))


class PortfolioTest(unittest.TestCase):
    def setUp(self):
        self.p = copy.deepcopy(lire("portfolio.json"))
        self.kits = ba.kits_existants()

    def test_valide(self):
        self.assertEqual(ba.valider_portfolio(self.p, self.kits), [])

    def test_kit_inconnu(self):
        self.p["projets"][0]["kits"].append("z99")
        self.assertTrue(any("kit inconnu" in e for e in ba.valider_portfolio(self.p, self.kits)))

    def test_etapes_finales(self):
        self.p["projets"][0]["etapes"].reverse()
        self.assertTrue(any("relire" in e for e in ba.valider_portfolio(self.p, self.kits)))

    def test_donnee_sans_licence(self):
        self.p["projets"][1]["donnees"][0]["licence"] = ""
        self.assertTrue(any("mal décrite" in e for e in ba.valider_portfolio(self.p, self.kits)))

    def test_trop_peu_de_projets(self):
        self.p["projets"] = self.p["projets"][:2]
        self.assertTrue(any("au moins 3 projets" in e for e in ba.valider_portfolio(self.p, self.kits)))


class IndicateursTest(unittest.TestCase):
    LIGNES = [
        {"exer": "2024-01-01T00:00:00+00:00", "dep_code": "33", "dep_name": "Gironde", "agregat": "Recettes de fonctionnement", "montant": 1000e6, "ptot": 1000000},
        {"exer": "2024", "dep_code": "33", "dep_name": "Gironde", "agregat": "Epargne brute", "montant": -20e6, "ptot": 1000000},
        {"exer": "2024", "dep_code": "33", "dep_name": "Gironde", "agregat": "Encours de dette", "montant": 500e6, "ptot": 1000000},
        {"exer": "2024", "dep_code": "87", "dep_name": "Haute-Vienne", "agregat": "Recettes de fonctionnement", "montant": 400e6, "ptot": 350000},
        {"exer": "2024", "dep_code": "87", "dep_name": "Haute-Vienne", "agregat": "Epargne brute", "montant": 40e6, "ptot": 350000},
        {"exer": "2024", "dep_code": "87", "dep_name": "Haute-Vienne", "agregat": "Encours de dette", "montant": 80e6, "ptot": 350000},
    ]

    def test_ratios(self):
        r = {x["dep_code"]: x for x in po.indicateurs(self.LIGNES)}
        self.assertEqual(r["87"]["taux_epargne_brute"], 10.0)
        self.assertEqual(r["87"]["desendettement_annees"], 2.0)
        self.assertEqual(r["87"]["dette_par_hab"], 229)
        self.assertEqual(r["33"]["taux_epargne_brute"], -2.0)

    def test_desendettement_sans_objet_si_epargne_negative(self):
        r = {x["dep_code"]: x for x in po.indicateurs(self.LIGNES)}
        self.assertIsNone(r["33"]["desendettement_annees"])

    def test_tableau(self):
        colonnes, lignes = po.tableau(po.indicateurs(self.LIGNES), [2024])
        self.assertEqual(colonnes[0], "Département")
        self.assertEqual(lignes[0][0], "Gironde (33)")
        self.assertEqual(lignes[0][-1], "sans objet")
        self.assertEqual(lignes[1][1:3], ["40,0", "10,0"])

    def test_url_export(self):
        u = po.url_export("75", 2018, 2025)
        self.assertIn("reg_code%3D%2275%22", u)
        self.assertIn("exports/json", u)

    def test_csv(self):
        with tempfile.TemporaryDirectory() as t:
            chemin = Path(t) / "sous" / "x.csv"
            po.ecrire_csv(po.indicateurs(self.LIGNES), chemin)
            lignes = chemin.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lignes), 3)
            self.assertTrue(lignes[0].startswith("annee;dep_code"))


if __name__ == "__main__":
    unittest.main()
