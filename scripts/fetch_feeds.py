"""Récupère et normalise les flux RSS/Atom du Brief (stdlib seulement).

Bibliothèque pour build_brief.py, et petit outil de contrôle :
    python -I scripts/fetch_feeds.py --check          # teste chaque source de content/brief/config.json
    python -I scripts/fetch_feeds.py --check --url https://exemple.fr/rss   # teste un flux candidat

Une source n'est adoptée que si le contrôle la donne « OK » (réponse valide, entrées datées, dernier article récent).
"""
import concurrent.futures
import datetime as dt
import email.utils
import gzip
import html
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; UpgradeBot/0.2; projet personnel)"
MAX_OCTETS = 3_000_000

MOIS = {m: i for i, m in enumerate(
    ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"], 1)}
PARAMS_SUIVI = re.compile(r"^(utm_|pk_|mtm_|xtor|at_|cmp|ito$|fbclid|gclid|_ga)", re.I)
# Caractères de contrôle interdits en XML 1.0 (vus dans le flux de Toute l'Europe).
CTRL = re.compile(rb"[\x00-\x08\x0b\x0c\x0e-\x1f]")


# ---------- réseau ----------

def http_get(url, timeout=20, tentatives=2):
    """Télécharge `url` (gzip géré, taille plafonnée). Lève l'exception de la dernière tentative."""
    derniere = None
    for _ in range(tentatives):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept-Encoding": "gzip",
                "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read(MAX_OCTETS)
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                return data
        except Exception as e:  # noqa: BLE001 : on réessaie quelle que soit l'erreur réseau
            derniere = e
    raise derniere


# ---------- texte ----------

class _Texte(HTMLParser):
    IGNORE = {"script", "style", "figure", "figcaption", "iframe"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.niveau = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.IGNORE:
            self.niveau += 1
        elif tag in ("p", "br", "li", "div"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in self.IGNORE and self.niveau:
            self.niveau -= 1

    def handle_data(self, data):
        if not self.niveau:
            self.parts.append(data)


def texte_brut(s):
    """HTML (éventuellement échappé) -> texte simple, espaces normalisés."""
    if not s:
        return ""
    if "<" not in s and "&lt;" in s:  # HTML échappé dans le XML
        s = html.unescape(s)
    p = _Texte()
    try:
        p.feed(s)
        p.close()
    except Exception:  # noqa: BLE001 : HTML cassé, on garde ce qu'on a
        pass
    t = html.unescape("".join(p.parts))
    if "Ã" in t or "â€" in t:  # UTF-8 lu comme du Latin-1 par la source (vu chez Maire-info)
        try:
            t = t.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return re.sub(r"\s+", " ", t.replace("\xa0", " ").replace(" ", " ")).strip()


def chapo(resume, titre="", limite=200):
    """Une phrase de chapô (au plus `limite` caractères), jamais le texte de l'article."""
    t = texte_brut(resume)
    if not t or (t.lower().startswith(titre.lower()[:40]) and len(t) < len(titre) + 10):
        return ""  # vide, ou le résumé ne fait que répéter le titre
    if len(t) <= limite:
        return t
    coupe = t[:limite]
    fin = max(coupe.rfind(". "), coupe.rfind("? "), coupe.rfind("! "))
    if fin >= 60:
        return coupe[:fin + 1]
    return coupe[:coupe.rfind(" ")].rstrip(" ,;:") + "…"


def normaliser(s):
    """Minuscules sans accents ni ponctuation (pour comparer des titres)."""
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def nettoyer_lien(url):
    """Retire les paramètres de suivi (pk_campaign, utm_…) et le fragment ; passe en https (certains flux donnent des liens en http)."""
    p = urllib.parse.urlsplit(url.strip())
    if p.scheme == "http":
        p = p._replace(scheme="https", netloc=p.netloc.removesuffix(":80"))
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not PARAMS_SUIVI.match(k)]
    return urllib.parse.urlunsplit((p.scheme, p.netloc.replace(":443", ""), p.path, urllib.parse.urlencode(q), ""))


# ---------- dates ----------

def parse_date(s):
    """Date d'un flux -> datetime UTC, ou None. Gère RFC 822, ISO 8601, « Jeudi 8 octobre 2026 »."""
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
        if d is not None:
            return d.astimezone(dt.timezone.utc) if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
    except (TypeError, ValueError):
        pass
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
        return d.astimezone(dt.timezone.utc) if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        pass
    m = re.search(r"(\d{1,2})\s+([a-zéûè]+)\s+(\d{4})", s.lower())
    if m and m.group(2) in MOIS:
        return dt.datetime(int(m.group(3)), MOIS[m.group(2)], int(m.group(1)), 12, tzinfo=dt.timezone.utc)
    return None


# ---------- analyse ----------

def _local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _enfant(el, *noms):
    for c in el:
        if _local(c.tag) in noms and (c.text or c.attrib):
            return c
    return None


def _texte(el):
    return (el.text or "") if el is not None else ""


def parse_feed(data):
    """Octets d'un flux RSS ou Atom -> liste de {titre, lien, date, resume}. Lève ValueError si ce n'est pas un flux."""
    data = CTRL.sub(b"", data.lstrip())
    try:
        racine = ET.fromstring(data)
    except ET.ParseError as e:
        raise ValueError(f"XML invalide ({e})") from e
    nom = _local(racine.tag)
    if nom not in ("rss", "feed", "RDF"):
        raise ValueError(f"ce n'est pas un flux RSS/Atom (balise {nom!r})")
    sortie = []
    for el in racine.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        lien = ""
        for c in el:
            if _local(c.tag) == "link":
                if c.attrib.get("href") and c.attrib.get("rel", "alternate") == "alternate":
                    lien = c.attrib["href"]
                    break
                if (c.text or "").strip():
                    lien = c.text.strip()
                    break
        if not lien:
            g = _enfant(el, "guid", "id")
            if g is not None and _texte(g).startswith("http"):
                lien = _texte(g).strip()
        sortie.append({
            "titre": texte_brut(_texte(_enfant(el, "title"))),
            "lien": nettoyer_lien(lien) if lien.startswith("http") else "",
            "date": parse_date(_texte(_enfant(el, "pubDate", "published", "date", "updated"))),
            "resume": _texte(_enfant(el, "description", "summary", "encoded", "content")),
        })
    return sortie


# ---------- récupération groupée ----------

def fetch_source(src, getter=http_get):
    """-> (entrées, erreur). Chaque entrée garde l'identifiant de sa source."""
    try:
        entrees = parse_feed(getter(src["url"]))
    except Exception as e:  # noqa: BLE001 : une source en panne ne doit jamais bloquer les autres
        return [], f"{type(e).__name__}: {str(e)[:120]}"
    for e in entrees:
        e["source_id"] = src["id"]
    return entrees, None


def fetch_all(sources, getter=http_get, workers=6):
    """-> {id_source: {'entrees': [...], 'erreur': str|None}}"""
    with concurrent.futures.ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(lambda s: fetch_source(s, getter), sources))
    return {s["id"]: {"entrees": e, "erreur": err} for s, (e, err) in zip(sources, res)}


# ---------- contrôle ----------

def diagnostic(entrees, erreur, maintenant, age_max_jours):
    """Verdict d'une source : (statut, message)."""
    if erreur:
        return "ECHEC", erreur
    if not entrees:
        return "VIDE", "aucune entrée"
    dates = [e["date"] for e in entrees if e["date"]]
    if not dates:
        return "SANS-DATE", f"{len(entrees)} entrées sans date exploitable"
    recent = max(dates)
    age = (maintenant - recent).days
    defauts = sum(1 for e in entrees if not e["lien"] or not e["titre"])
    msg = f"{len(entrees)} entrées, dernière {recent:%Y-%m-%d %H:%M} (il y a {age} j)"
    if defauts:
        msg += f", {defauts} sans titre/lien"
    if age > age_max_jours:
        return "PERIME", msg
    return "OK", msg


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if "--check" not in argv:
        print(__doc__)
        return 2
    if "--url" in argv:
        sources = [{"id": "candidat", "url": argv[argv.index("--url") + 1], "type": "presse"}]
    else:
        sources = json.loads((RACINE / "content/brief/config.json").read_text(encoding="utf-8"))["sources"]
    maintenant = dt.datetime.now(dt.timezone.utc)
    res = fetch_all(sources)
    mauvais = 0
    for s in sources:
        r = res[s["id"]]
        age_max = {"presse": 3, "institution": 30}.get(s.get("type"), 60)  # les études de fond sont rares
        statut, msg = diagnostic(r["entrees"], r["erreur"], maintenant, age_max)
        mauvais += statut != "OK"
        print(f"{statut:9} {s['id']:28} {msg}")
    print(f"\n{len(sources) - mauvais}/{len(sources)} sources OK")
    return 1 if mauvais else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
