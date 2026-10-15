@echo off
rem Lance First Upgrade (version locale) sans fenetre : le serveur tourne en arriere-plan sur 127.0.0.1:8765, ouvre le site dans
rem le navigateur, enregistre la progression dans data_local\progression\ et s'arrete seul quelques minutes apres la fermeture
rem de la page. Journal : data_local\serveur-local.log. Double-clic pour demarrer ; cette fenetre se ferme toute seule.
cd /d "%~dp0"
rem Recupere le Brief du jour publie sur GitHub (sans effet s'il n'y a pas de connexion ou si le depot local a diverge).
git pull --ff-only --quiet 2>nul
where pythonw >nul 2>nul
if errorlevel 1 (
  start "" /min python scripts\serve_local.py --ouvrir --auto-arret
) else (
  start "" pythonw scripts\serve_local.py --ouvrir --auto-arret
)
