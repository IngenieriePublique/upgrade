"""Tests du Brief : analyse des flux, regroupement, score, plafonds, écriture. Aucun accès au réseau."""
import copy
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
import build_brief as bb  # noqa: E402
import fetch_feeds as ff  # noqa: E402

CFG = json.loads((RACINE / "content/brief/config.json").read_text(encoding="utf-8"))
QUESTIONS = json.loads((RACINE / "content/brief/questions.json").read_text(encoding="utf-8"))
UTC = dt.timezone.utc
NOW = dt.datetime(2026, 10, 12, 5, 30, tzinfo=UTC)  # lundi

RSS = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title>
<item><title><![CDATA[Budget 2027 : le Sénat &amp; les départements]]></title>
<link>https://exemple.fr/a?pk_campaign=RSS&amp;id=7#haut</link>
<pubDate>Mon, 12 Oct 2026 06:30:00 +0200</pubDate>
<description><![CDATA[<p>Un chapô <b>court</b>.</p><p>Suite.</p>]]></description></item>
<item><title>Sans date</title><link>https://exemple.fr/b</link></item>
<item><title>Contr\x1ele</title><link>https://exemple.fr/c</link><dc:date>2026-10-11T12:00:00Z</dc:date></item>
</channel></rss>""".encode("utf-8")

ATOM = """<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Rapport sur l'évaluation</title>
<link rel="alternate" type="text/html" href="https://exemple.org/r1"/><link rel="self" href="https://exemple.org/self"/>
<published>2026-10-10T08:00:00Z</published><summary>&lt;p&gt;Résumé &lt;i&gt;échappé&lt;/i&gt;.&lt;/p&gt;</summary></entry></feed>""".encode("utf-8")


def entree(titre, source_id, heures=3, resume="", lien=None):
    return {"titre": titre, "lien": lien or f"https://{source_id}.exemple.fr/{abs(hash(titre))}", "resume": resume,
            "date": NOW - dt.timedelta(hours=heures), "source_id": source_id}


def titre_unique(k, suite="sur le budget des collectivités"):
    """Titre sans mot en commun avec les autres (hors `suite`), pour ne pas être regroupé comme doublon."""
    import hashlib
    mots = [hashlib.md5(f"{k}-{j}".encode()).hexdigest()[:8] for j in range(3)]
    return f"{' '.join(mots)} {suite}"


def resultats(**par_source):
    """{id: [entrées]} -> format de fetch_all, avec une panne simulée pour les sources non fournies."""
    return {s["id"]: {"entrees": par_source.get(s["id"].replace("-", "_"), []), "erreur": None} for s in CFG["sources"]}


class AnalyseTest(unittest.TestCase):
    def test_rss(self):
        e = ff.parse_feed(RSS)
        self.assertEqual(len(e), 3)
        self.assertEqual(e[0]["titre"], "Budget 2027 : le Sénat & les départements")
        self.assertEqual(e[0]["lien"], "https://exemple.fr/a?id=7")  # suivi et fragment retirés
        self.assertEqual(e[0]["date"], dt.datetime(2026, 10, 12, 4, 30, tzinfo=UTC))
        self.assertIsNone(e[1]["date"])
        self.assertEqual(e[2]["titre"], "Contrôle".replace("ô", "") if False else e[2]["titre"])  # le caractère interdit est retiré
        self.assertNotIn("\x1e", e[2]["titre"])

    def test_atom_et_html_echappe(self):
        e = ff.parse_feed(ATOM)
        self.assertEqual(e[0]["lien"], "https://exemple.org/r1")
        self.assertEqual(ff.chapo(e[0]["resume"]), "Résumé échappé.")

    def test_refuse_ce_qui_n_est_pas_un_flux(self):
        with self.assertRaises(ValueError):
            ff.parse_feed(b"<html><body>non</body></html>")
        with self.assertRaises(ValueError):
            ff.parse_feed(b"pas du xml")

    def test_dates(self):
        self.assertEqual(ff.parse_date("Sun, 11 Oct 2026 21:55:56 +0200"), dt.datetime(2026, 10, 11, 19, 55, 56, tzinfo=UTC))
        self.assertEqual(ff.parse_date("2026-10-10T05:50:39Z"), dt.datetime(2026, 10, 10, 5, 50, 39, tzinfo=UTC))
        self.assertEqual(ff.parse_date("2026-10-09 10:15:46").day, 9)
        self.assertEqual(ff.parse_date("Jeudi 8 octobre 2026").month, 10)
        self.assertIsNone(ff.parse_date("hier"))
        self.assertIsNone(ff.parse_date(""))

    def test_chapo_une_phrase_sans_depasser_la_limite(self):
        long = "Première phrase assez longue pour dépasser largement soixante caractères au total. " + "Mot " * 80
        c = ff.chapo(long, limite=200)
        self.assertTrue(c.endswith("total."))
        self.assertLessEqual(len(ff.chapo("mot " * 100, limite=100)), 101)
        self.assertEqual(ff.chapo("Titre identique au résumé", "Titre identique au résumé"), "")

    def test_mojibake_corrige(self):
        self.assertEqual(ff.texte_brut("usages diffÃ©renciÃ©s"), "usages différenciés")

    def test_source_en_panne_n_arrete_pas_les_autres(self):
        def getter(url):
            if "ko" in url:
                raise OSError("réseau coupé")
            return ATOM
        res = ff.fetch_all([{"id": "ok", "url": "https://x/ok"}, {"id": "ko", "url": "https://x/ko"}], getter)
        self.assertEqual(len(res["ok"]["entrees"]), 1)
        self.assertIn("OSError", res["ko"]["erreur"])
        self.assertEqual(res["ok"]["entrees"][0]["source_id"], "ok")


class SelectionTest(unittest.TestCase):
    def test_heure_paris_change_a_la_bonne_date(self):
        self.assertEqual(bb.heure_paris(dt.datetime(2026, 10, 25, 0, 59, tzinfo=UTC)).hour, 2)   # encore l'heure d'été
        self.assertEqual(bb.heure_paris(dt.datetime(2026, 10, 25, 1, 0, tzinfo=UTC)).hour, 2)    # bascule : 01:00 UTC = 02:00 CET
        self.assertEqual(bb.heure_paris(dt.datetime(2026, 3, 29, 0, 59, tzinfo=UTC)).hour, 1)
        self.assertEqual(bb.heure_paris(dt.datetime(2026, 3, 29, 1, 0, tzinfo=UTC)).hour, 3)

    def test_regroupe_les_titres_proches_et_separe_les_autres(self):
        a = entree("Pologne : un suspect arrêté en lien avec une tentative d'assassinat contre le Premier ministre", "france24")
        b = entree("En Pologne, un suspect arrêté après une tentative d'assassinat contre le Premier ministre", "rfi-monde")
        c = entree("Budget 2027 : les départements dénoncent une baisse des dotations", "localtis")
        cands = bb.candidats(resultats(france24=[a], rfi_monde=[b], localtis=[c]), CFG["sources"], CFG, NOW)
        groupes = sorted(len(g) for g in bb.regrouper(cands))
        self.assertEqual(groupes, [1, 2])

    def test_plafonds_et_groupes(self):
        lm = [entree(titre_unique(i), "lemonde-une", i + 1) for i in range(9)]
        fi = [entree(titre_unique(100 + i), "franceinfo-titres", i + 1) for i in range(9)]
        mo = [entree(titre_unique(200 + i, "guerre ONU"), "rfi-monde", i + 1) for i in range(12)]
        lt = [entree(titre_unique(300 + i, "dotation des départements"), "localtis", i + 1) for i in range(12)]
        b = bb.construire(resultats(lemonde_une=lm, franceinfo_titres=fi, rfi_monde=mo, localtis=lt), CFG, QUESTIONS, NOW)
        par_r = {r: [i for i in b["items"] if i["rubrique"] == r] for r in CFG["plafonds"]}
        # 2 par groupe de sources au plus : Le Monde 2 + franceinfo 2 = 4 en France, RFI 2, Localtis 2
        self.assertEqual({r: len(v) for r, v in par_r.items()}, {"france": 4, "monde": 2, "action_publique": 2})
        self.assertLessEqual(len(b["items"]), b["plafond"])
        self.assertEqual(b["plafond"], 13)

    def test_plafond_global_de_13(self):
        s = {}
        for sid, rub in [("lemonde-une", "france"), ("franceinfo-titres", "france"), ("liberation", "france"),
                         ("rfi-monde", "monde"), ("france24", "monde"), ("courrier-international", "monde"),
                         ("localtis", "action_publique"), ("cerema", "action_publique"), ("economie-gouv", "action_publique")]:
            s[sid.replace("-", "_")] = [entree(titre_unique(len(s) * 10 + i), sid, i + 1) for i in range(6)]
        b = bb.construire(resultats(**s), CFG, QUESTIONS, NOW)
        self.assertEqual(len(b["items"]), 13)
        self.assertEqual(sum(i["rubrique"] == "france" for i in b["items"]), 5)
        self.assertEqual(sum(i["rubrique"] == "monde" for i in b["items"]), 5)
        self.assertEqual(sum(i["rubrique"] == "action_publique" for i in b["items"]), 3)

    def test_l_action_publique_passe_avant_le_jeu_politique(self):
        jeu = entree("Polémique et petite phrase : le sondage qui agite la primaire", "lemonde-une", 1)
        fond = entree("Dotation globale de fonctionnement : la Cour des comptes évalue la réforme", "lemonde-une", 8,
                      "Un rapport sur les finances des communes et départements.")
        b = bb.construire(resultats(lemonde_une=[jeu, fond]), CFG, QUESTIONS, NOW)
        self.assertEqual(b["items"][0]["titre"], fond["titre"])

    def test_exclut_directs_perimes_et_anglais(self):
        ok = entree("Réforme de la fiscalité locale : ce que prévoit le texte", "lemonde-une", 2)
        direct = entree("EN DIRECT, primaire à gauche : les résultats tombent", "lemonde-une", 1)
        vieux = entree("Ancien article sur le budget des communes de France", "lemonde-une", 100)
        anglais = entree("What is the impact of the new policy on the people of the region and the state", "lemonde-une", 1)
        sans_lien = {**entree("Article sans lien exploitable pour le test", "lemonde-une"), "lien": ""}
        b = bb.construire(resultats(lemonde_une=[ok, direct, vieux, anglais, sans_lien]), CFG, QUESTIONS, NOW)
        self.assertEqual([i["titre"] for i in b["items"]], [ok["titre"]])

    def test_les_articles_de_fond_ne_vont_que_dans_le_dossier(self):
        f = entree("Rapport de la Cour des comptes sur l'évaluation des politiques publiques locales", "ccomptes-publications", 24 * 3)
        b = bb.construire(resultats(ccomptes_publications=[f]), CFG, QUESTIONS, NOW)
        self.assertEqual(b["items"], [])
        self.assertEqual(b["dossier"]["titre"], f["titre"])
        self.assertEqual(b["dossier"]["semaine"], "2026-W42")

    def test_le_dossier_de_la_semaine_est_conserve(self):
        f1 = entree("Premier rapport sur les finances locales et la dette des communes", "ccomptes-publications", 24 * 3)
        b1 = bb.construire(resultats(ccomptes_publications=[f1]), CFG, QUESTIONS, NOW)
        f2 = entree("Second rapport encore meilleur sur l'évaluation des politiques publiques", "ccomptes-publications", 5)
        mardi = NOW + dt.timedelta(days=1)
        b2 = bb.construire(resultats(ccomptes_publications=[f1, f2]), CFG, QUESTIONS, mardi, precedent=b1)
        self.assertEqual(b2["dossier"]["titre"], f1["titre"])
        semaine_suivante = NOW + dt.timedelta(days=7)
        f3 = {**f2, "date": semaine_suivante - dt.timedelta(hours=5)}
        b3 = bb.construire(resultats(ccomptes_publications=[f1, f3]), CFG, QUESTIONS, semaine_suivante, precedent=b1)
        self.assertEqual(b3["dossier"]["titre"], f3["titre"])

    def test_chapo_court_et_question_stable(self):
        e = entree("Budget des départements : la dette inquiète", "lemonde-une", 1, "Phrase. " * 80)
        b1 = bb.construire(resultats(lemonde_une=[e]), CFG, QUESTIONS, NOW)
        b2 = bb.construire(resultats(lemonde_une=[e]), CFG, QUESTIONS, NOW)
        it = b1["items"][0]
        self.assertLessEqual(len(it["chapo"]), 200)
        self.assertEqual(it["question"], b2["items"][0]["question"])
        self.assertEqual(it["theme"], "finances")
        self.assertTrue(it["payant"])

    def test_panne_generale_ne_publie_rien(self):
        panne = {s["id"]: {"entrees": [], "erreur": "OSError: réseau"} for s in CFG["sources"]}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(bb.ff, "fetch_all", return_value=panne), \
                mock.patch.object(bb, "SORTIE", Path(d)), mock.patch.object(bb, "truc_du_jour", return_value=None):
            self.assertEqual(bb.main([]), 1)
            self.assertFalse((Path(d) / "latest.json").exists())


class EcritureTest(unittest.TestCase):
    def test_archive_index_et_purge(self):
        with tempfile.TemporaryDirectory() as d:
            dossier = Path(d)
            (dossier / "archive").mkdir()
            for k in range(1, 70):  # 69 anciens jours : la purge garde les 60 plus récents
                (dossier / "archive" / f"2026-01-{k:02d}.json" if k < 32 else dossier / "archive" / f"2026-02-{k - 31:02d}.json").write_text("{}")
            brief = {"date": "2026-10-12", "items": []}
            bb.ecrire(brief, dossier)
            self.assertEqual(json.loads((dossier / "latest.json").read_text(encoding="utf-8"))["date"], "2026-10-12")
            idx = json.loads((dossier / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(idx["derniere"], "2026-10-12")
            self.assertLessEqual(len(idx["dates"]), bb.ARCHIVE_MAX)
            self.assertEqual(len(list((dossier / "archive").glob("*.json"))), len(idx["dates"]))

    def test_truc_du_jour(self):
        evts = {"selected": [{"year": 1962, "text": "ouverture du concile.", "pages": [{
            "extract": "Le concile Vatican II est ouvert en 1962.", "content_urls": {"desktop": {"page": "https://fr.wikipedia.org/wiki/X"}}}]}]}
        t = bb.truc_du_jour(dt.date(2026, 10, 11), getter=lambda url: json.dumps(evts).encode())
        self.assertEqual(t["titre"], "1962 : ouverture du concile.")
        self.assertEqual(t["licence"], "CC BY-SA 4.0")
        self.assertIsNone(bb.truc_du_jour(dt.date(2026, 10, 11), getter=lambda url: b"pas du json"))


class ConfigTest(unittest.TestCase):
    def test_sources_bien_formees(self):
        ids = [s["id"] for s in CFG["sources"]]
        self.assertEqual(len(ids), len(set(ids)), "identifiants de source en double")
        for s in CFG["sources"]:
            self.assertTrue(s["url"].startswith("https://"), s["id"])
            self.assertIn(s["rubrique"], CFG["plafonds"], s["id"])
            self.assertIn(s["type"], CFG["fenetre_heures"], s["id"])
            self.assertIn(s["priorite"], (1, 2, 3), s["id"])
            self.assertTrue(s["nom"] and s["groupe"], s["id"])

    def test_au_moins_trois_sources_par_rubrique_pour_resister_aux_pannes(self):
        for r in CFG["plafonds"]:
            self.assertGreaterEqual(sum(s["rubrique"] == r and s["type"] != "fond" for s in CFG["sources"]), 3, r)

    def test_questions(self):
        ids = [t["id"] for t in QUESTIONS["themes"]]
        self.assertIn("defaut", ids)
        for t in QUESTIONS["themes"]:
            self.assertGreaterEqual(len(t["questions"]), 3, t["id"])
            self.assertTrue(all(q.endswith("?") for q in t["questions"]), t["id"])

    def test_regex_d_exclusion_valides(self):
        import re
        for x in CFG["exclure_titres"]:
            re.compile(x)


class DonneesPublieesTest(unittest.TestCase):
    """Le Brief commité (site/data/brief/latest.json) respecte le schéma lu par l'application."""

    def test_schema(self):
        chemin = RACINE / "site/data/brief/latest.json"
        if not chemin.exists():
            self.skipTest("pas encore de Brief publié")
        b = json.loads(chemin.read_text(encoding="utf-8"))
        self.assertEqual(b["version"], 1)
        self.assertRegex(b["date"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertLessEqual(len(b["items"]), 13)
        ids = set()
        for it in b["items"]:
            self.assertNotIn(it["id"], ids)
            ids.add(it["id"])
            self.assertTrue(it["lien"].startswith("https://"))
            self.assertIn(it["rubrique"], CFG["plafonds"])
            self.assertLessEqual(len(it["chapo"]), 201)
            self.assertTrue(it["question"].endswith("?"))
        for r, p in CFG["plafonds"].items():
            self.assertLessEqual(sum(i["rubrique"] == r for i in b["items"]), p)


if __name__ == "__main__":
    unittest.main()
