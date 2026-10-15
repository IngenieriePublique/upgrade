"""Serveur local (scripts/serve_local.py) : API de sauvegarde, copies de sécurité, hôtes refusés. Aucun accès au réseau externe."""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import serve_local as srv  # noqa: E402


def sauvegarde(seances=(), journal=()):
    return {"format": srv.FORMAT, "version": 2, "exportedAt": 0, "journal": list(journal), "days": [], "notes": [],
            "meta": {srv.CLE_SEANCES: list(seances), srv.CLE_DEBUT: "2026-10-12", srv.CLE_ETIQUETTES: ["upgrade"]}}


def seance(debut):
    return {"id": str(debut), "debut": debut, "fin": debut + 60000, "duree": 60, "tags": ["upgrade"], "tache": "x"}


class OutilsTest(unittest.TestCase):
    def test_hote_local(self):
        for ok in ("127.0.0.1:8765", "localhost:8765", "http://127.0.0.1:8765", "[::1]:8765", "localhost"):
            self.assertTrue(srv.hote_local(ok), ok)
        for ko in (None, "", "evil.example", "evil.example:8765", "http://127.0.0.1.evil.example", "192.168.1.5:8765"):
            self.assertFalse(srv.hote_local(ko), ko)

    def test_valider_refuse_ce_qui_n_est_pas_une_sauvegarde(self):
        for mauvais in (b"pas du json", b"[]", b'{"format":"autre","journal":[]}', b'{"format":"upgrade-sauvegarde"}'):
            with self.assertRaises(ValueError):
                srv.valider(mauvais)
        self.assertEqual(srv.valider(json.dumps(sauvegarde()).encode())["version"], 2)

    def test_export_des_seances_trie_les_plus_recentes_d_abord(self):
        s = srv.exporter_seances(sauvegarde([seance(1000), seance(3000), seance(2000)]))
        self.assertEqual([x["debut"] for x in s["seances"]], [3000, 2000, 1000])
        self.assertEqual(s["programme"], {"debut": "2026-10-12"})
        self.assertEqual(s["etiquettes"], ["upgrade"])

    def test_copies_de_securite(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t)
            srv.enregistrer(d, json.dumps(sauvegarde([seance(1)])).encode(), maintenant=1_800_000_000)
            self.assertFalse((d / "progression.prec.json").exists())  # rien avant la première
            srv.enregistrer(d, json.dumps(sauvegarde([seance(1), seance(2)])).encode(), maintenant=1_800_000_005)
            prec = json.loads((d / "progression.prec.json").read_text(encoding="utf-8"))
            self.assertEqual(len(prec["meta"][srv.CLE_SEANCES]), 1)  # l'état d'avant
            os.utime(d / "progression.prec.json", (1_800_000_005, 1_800_000_005))  # l'heure simulée, pas l'heure réelle
            self.assertEqual(len(list((d / "archives").glob("progression-*.json"))), 1)
            # moins de 10 minutes plus tard : la copie « précédente » n'est pas écrasée
            srv.enregistrer(d, json.dumps(sauvegarde([seance(1), seance(2), seance(3)])).encode(), maintenant=1_800_000_010)
            prec = json.loads((d / "progression.prec.json").read_text(encoding="utf-8"))
            self.assertEqual(len(prec["meta"][srv.CLE_SEANCES]), 1)
            # un autre jour : une archive de plus
            srv.enregistrer(d, json.dumps(sauvegarde()).encode(), maintenant=1_800_000_000 + 2 * 86400)
            self.assertEqual(len(list((d / "archives").glob("progression-*.json"))), 2)

    def test_une_sauvegarde_invalide_n_ecrase_rien(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t)
            srv.enregistrer(d, json.dumps(sauvegarde([seance(1)])).encode())
            avant = (d / "progression.json").read_bytes()
            with self.assertRaises(ValueError):
                srv.enregistrer(d, b"{}")
            self.assertEqual((d / "progression.json").read_bytes(), avant)


class ArretAutomatiqueTest(unittest.TestCase):
    def test_le_serveur_s_arrete_sans_requete_et_reste_tant_qu_on_l_interroge(self):
        with tempfile.TemporaryDirectory() as t:
            serveur = srv.creer_serveur(0, donnees=t)
            port = serveur.server_address[1]
            fini = threading.Event()

            def servir():
                serveur.serve_forever()
                fini.set()
            threading.Thread(target=servir, daemon=True).start()
            threading.Thread(target=srv.surveiller, args=(serveur, 0.6, 0.05), daemon=True).start()
            for _ in range(6):  # des requêtes régulières le maintiennent en vie plus longtemps que le délai
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping"):
                    pass
                self.assertFalse(fini.wait(0.2))
            self.assertTrue(fini.wait(3), "le serveur aurait dû s'arrêter")
            serveur.server_close()


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.serveur = srv.creer_serveur(0, donnees=cls.tmp.name)
        cls.base = f"http://127.0.0.1:{cls.serveur.server_address[1]}"
        threading.Thread(target=cls.serveur.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()
        cls.serveur.server_close()
        cls.tmp.cleanup()

    def appel(self, chemin, methode="GET", corps=None, entetes=None):
        req = urllib.request.Request(self.base + chemin, data=corps, method=methode, headers=entetes or {})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            with e:
                return e.code, e.read()

    def test_ping(self):
        code, corps = self.appel("/api/ping")
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(corps)["local"])

    def test_ecriture_puis_relecture(self):
        code, _ = self.appel("/api/sauvegarde")
        self.assertEqual(code, 204)  # rien d'enregistré au départ
        donnees = sauvegarde([seance(5000)])
        code, corps = self.appel("/api/sauvegarde", "PUT", json.dumps(donnees).encode(), {"Content-Type": "application/json"})
        self.assertEqual((code, json.loads(corps)["seances"]), (200, 1))
        code, corps = self.appel("/api/sauvegarde")
        self.assertEqual((code, json.loads(corps)), (200, donnees))
        self.assertTrue((Path(self.tmp.name) / "seances-de-travail.json").exists())

    def test_refus(self):
        code, _ = self.appel("/api/sauvegarde", "PUT", b"pas du json")
        self.assertEqual(code, 400)
        code, _ = self.appel("/api/ping", entetes={"Host": "evil.example"})
        self.assertEqual(code, 403)
        code, _ = self.appel("/api/sauvegarde", "PUT", json.dumps(sauvegarde()).encode(), {"Origin": "https://evil.example"})
        self.assertEqual(code, 403)
        code, _ = self.appel("/api/autre", "PUT", b"{}")
        self.assertEqual(code, 404)

    def test_un_port_occupe_echoue_et_le_serveur_deja_lance_est_reconnu(self):
        port = self.serveur.server_address[1]
        with self.assertRaises(OSError):
            srv.creer_serveur(port, donnees=self.tmp.name)
        self.assertTrue(srv.deja_lance(port))

    def test_sert_le_site_et_les_modules_en_javascript(self):
        code, _ = self.appel("/site/index.html")
        self.assertEqual(code, 200)
        req = urllib.request.Request(self.base + "/site/first/js/main.js")
        with urllib.request.urlopen(req) as r:
            self.assertIn("javascript", r.headers["Content-Type"])
            self.assertEqual(r.headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
