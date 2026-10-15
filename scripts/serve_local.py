"""Serveur local de First Upgrade : sert le projet sur 127.0.0.1 et garde la progression dans un fichier du disque.

    python scripts/serve_local.py [--port 8765] [--ouvrir] [--auto-arret [MINUTES]]

- Le site est sur http://127.0.0.1:8765/site/ (les tests sur /tests/index.html).
- Le site détecte ce serveur (GET /api/ping) : il passe alors en mode « local » (toutes les activités) et envoie son état
  complet à chaque écriture (PUT /api/sauvegarde). Sans ce serveur (GitHub Pages, téléphone), le site reste en mode « light ».
- Fichiers écrits dans data_local/progression/ (hors dépôt) :
    progression.json            état complet (cartes, séances, notes, réglages) ; relu à l'ouverture
    progression.prec.json       l'état d'avant (au plus une copie toutes les 10 minutes)
    seances-de-travail.json     les séances de travail seules, au format de l'export de la page Séances
    archives/progression-AAAA-MM-JJ.json   une copie par jour, les 30 derniers jours
- `--auto-arret` : le serveur s'arrête seul quand plus rien ne l'interroge depuis 5 minutes (la page ouverte le sollicite toutes les
  30 secondes) ; c'est ce qu'utilise « Lancer First Upgrade.bat », qui le lance avec pythonw (sans fenêtre). Journal : data_local/serveur-local.log.
- Bibliothèque standard seulement ; n'écoute que 127.0.0.1 et refuse les requêtes dont l'hôte n'est pas local.
"""
import argparse
import datetime
import json
import os
import shutil
import sys
import threading
import time
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "data_local" / "progression"
FORMAT = "upgrade-sauvegarde"
PORT = 8765
MAX_OCTETS = 100 * 1024 * 1024
HOTES_LOCAUX = {"127.0.0.1", "localhost", "[::1]", "::1"}
JOURS_ARCHIVES = 30
INACTIVITE_MINUTES = 5
ECART_PRECEDENTE = 600  # secondes entre deux copies « progression.prec.json »

CLE_SEANCES = "first-methode-seances"
CLE_ETIQUETTES = "first-methode-etiquettes"
CLE_DEBUT = "first-methode-debut"


def hote_local(valeur):
    """True si l'en-tête Host (ou Origin) désigne cette machine."""
    if not valeur:
        return False
    nom = urlparse(valeur if "//" in valeur else "//" + valeur).hostname
    return nom in HOTES_LOCAUX or (nom or "").strip("[]") in HOTES_LOCAUX


def valider(octets):
    """Décode et vérifie une sauvegarde ; lève ValueError si elle n'a pas la forme attendue."""
    try:
        data = json.loads(octets.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError(f"JSON illisible : {e}") from e
    if not isinstance(data, dict) or data.get("format") != FORMAT or not isinstance(data.get("journal"), list):
        raise ValueError("ce n'est pas une sauvegarde First Upgrade")
    return data


def exporter_seances(data):
    """Les séances de travail seules, au format de l'export de la page Séances (réimportable)."""
    meta = data.get("meta") or {}
    seances = [s for s in (meta.get(CLE_SEANCES) or []) if isinstance(s, dict)]
    seances.sort(key=lambda s: s.get("debut", 0), reverse=True)
    return {"version": 1, "programme": {"debut": meta.get(CLE_DEBUT)},
            "etiquettes": meta.get(CLE_ETIQUETTES) or [], "seances": seances}


def ecrire_atomique(chemin, octets):
    tmp = chemin.with_name(chemin.name + ".tmp")
    tmp.write_bytes(octets)
    os.replace(tmp, chemin)


def enregistrer(dossier, octets, maintenant=None):
    """Écrit la sauvegarde (après validation) et les copies de sécurité ; renvoie le nombre de séances de travail."""
    data = valider(octets)
    maintenant = maintenant or time.time()
    dossier.mkdir(parents=True, exist_ok=True)
    courant = dossier / "progression.json"
    if courant.exists():
        prec = dossier / "progression.prec.json"
        if not prec.exists() or maintenant - prec.stat().st_mtime > ECART_PRECEDENTE:
            shutil.copy2(courant, prec)
        archives = dossier / "archives"
        archives.mkdir(exist_ok=True)
        jour = datetime.date.fromtimestamp(maintenant).isoformat()
        copie = archives / f"progression-{jour}.json"
        if not copie.exists():
            shutil.copy2(courant, copie)
            for vieille in sorted(archives.glob("progression-*.json"))[:-JOURS_ARCHIVES]:
                vieille.unlink()
    ecrire_atomique(courant, octets)
    seances = exporter_seances(data)
    ecrire_atomique(dossier / "seances-de-travail.json", json.dumps(seances, ensure_ascii=False, indent=2).encode("utf-8"))
    return len(seances["seances"])


class Gestionnaire(SimpleHTTPRequestHandler):
    def handle_one_request(self):
        self.server.derniere = time.time()  # pour --auto-arret
        super().handle_one_request()

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript",
                      ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json"}
    donnees = DONNEES

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" not in self.path:
            super().log_message(fmt, *args)

    def _verifier(self):
        if not hote_local(self.headers.get("Host")) or (self.headers.get("Origin") and not hote_local(self.headers["Origin"])):
            self._reponse(403, {"erreur": "hôte non autorisé"})
            return False
        return True

    def _reponse(self, code, corps=None, brut=None):
        octets = brut if brut is not None else (json.dumps(corps, ensure_ascii=False).encode("utf-8") if corps is not None else b"")
        self.send_response(code)
        if octets:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(octets)))
        self.end_headers()
        if octets and self.command != "HEAD":
            self.wfile.write(octets)

    def do_GET(self):
        chemin = urlparse(self.path).path
        if chemin == "/api/ping":
            if self._verifier():
                self._reponse(200, {"local": True, "version": 1})
        elif chemin == "/api/sauvegarde":
            if not self._verifier():
                return
            fichier = self.donnees / "progression.json"
            if fichier.exists():
                self._reponse(200, brut=fichier.read_bytes())
            else:
                self._reponse(204)
        else:
            super().do_GET()

    def do_PUT(self):
        if urlparse(self.path).path != "/api/sauvegarde":
            self._reponse(404, {"erreur": "inconnu"})
            return
        if not self._verifier():
            return
        try:
            taille = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._reponse(411, {"erreur": "Content-Length requis"})
            return
        if taille <= 0 or taille > MAX_OCTETS:
            self._reponse(413, {"erreur": "taille refusée"})
            return
        try:
            n = enregistrer(self.donnees, self.rfile.read(taille))
        except ValueError as e:
            self._reponse(400, {"erreur": str(e)})
            return
        except OSError as e:
            self._reponse(500, {"erreur": f"écriture impossible : {e}"})
            return
        self._reponse(200, {"ok": True, "seances": n})

    do_POST = do_PUT


class Serveur(ThreadingHTTPServer):
    # Sous Windows, SO_REUSEADDR (activé par défaut) laisse un second serveur prendre le même port : il faut qu'un port occupé échoue.
    allow_reuse_address = False
    derniere = 0.0  # heure de la dernière requête (voir surveiller)


def creer_serveur(port=PORT, racine=RACINE, donnees=DONNEES):
    classe = type("GestionnaireLocal", (Gestionnaire,), {"donnees": Path(donnees)})
    return Serveur(("127.0.0.1", port), partial(classe, directory=str(racine)))


def deja_lance(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=2) as r:
            return json.load(r).get("local") is True
    except Exception:
        return False


def surveiller(serveur, delai, pas=10):
    """Arrête le serveur quand aucune requête n'est arrivée depuis `delai` secondes (page fermée, ordinateur en veille)."""
    serveur.derniere = time.time()
    while time.time() - serveur.derniere <= delai:
        time.sleep(pas)
    print("Plus aucune page ouverte : arrêt du serveur.")
    serveur.shutdown()


def rediriger_sorties():
    """Lancé par pythonw (sans fenêtre), il n'y a pas de console : les messages vont dans data_local/serveur-local.log."""
    if sys.stdout is None or sys.stderr is None:
        (RACINE / "data_local").mkdir(exist_ok=True)
        sys.stdout = sys.stderr = open(RACINE / "data_local" / "serveur-local.log", "a", encoding="utf-8", buffering=1)


def main():
    rediriger_sorties()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description="Serveur local de First Upgrade")
    p.add_argument("--port", type=int, default=PORT)
    p.add_argument("--ouvrir", action="store_true", help="ouvre le site dans le navigateur par défaut")
    p.add_argument("--auto-arret", nargs="?", type=float, const=INACTIVITE_MINUTES, default=None, metavar="MINUTES",
                   help=f"s'arrête seul sans requête depuis ce nombre de minutes (défaut {INACTIVITE_MINUTES})")
    p.add_argument("--donnees", type=Path, default=DONNEES, help="dossier de la progression (par défaut data_local/progression)")
    a = p.parse_args()
    adresse = f"http://127.0.0.1:{a.port}/site/"
    try:
        serveur = creer_serveur(a.port, donnees=a.donnees)
    except OSError:
        if deja_lance(a.port):
            print(f"First Upgrade tourne déjà : {adresse}")
            if a.ouvrir:
                webbrowser.open(adresse)
            return 0
        print(f"Le port {a.port} est occupé par autre chose. Relancer avec --port <autre numéro>.", file=sys.stderr)
        return 1
    print(f"First Upgrade (version locale) : {adresse}")
    print(f"Progression enregistrée dans : {a.donnees}")
    if a.auto_arret is None:
        print("Laisser cette fenêtre ouverte pendant l'utilisation ; la fermer arrête le serveur.")
    else:
        threading.Thread(target=surveiller, args=(serveur, a.auto_arret * 60), daemon=True).start()
    if a.ouvrir:
        threading.Timer(0.6, webbrowser.open, [adresse]).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        serveur.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
