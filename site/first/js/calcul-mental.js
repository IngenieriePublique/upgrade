// Calcul mental : générateur de questions sans fin, à réponse entière, par niveau de difficulté. Chaque type de question
// porte une astuce de méthode (affichée au survol de l'ampoule) dont l'exemple n'est jamais la question posée.
// Logique pure : pas de DOM, le hasard est injecté (tests avec un générateur à graine).

export const NIVEAUX = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile', 4: 'Expert' };

const FINE = ' '; // espace fine insécable : 2 347
export const nombre = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, FINE);

const entier = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const choisir = (r, tab) => tab[Math.floor(r() * tab.length)];
const q = (texte, reponse, extra = {}) => ({ texte, reponse, ...extra });

export const TYPES = [
  // ---------- niveau 1 ----------
  { id: 'add2', niveau: 1, tip: 'Arrondis à la dizaine : 58 + 39 = 58 + 40 − 1 = 97.',
    faire: (r) => { const a = entier(r, 11, 89); const b = entier(r, 11, 99); return q(`${a} + ${b}`, a + b); } },
  { id: 'sub2', niveau: 1, tip: 'Compte en remontant : 82 − 47 → 3 pour aller à 50, puis 32 pour aller à 82 ; 3 + 32 = 35.',
    faire: (r) => { const a = entier(r, 31, 99); const b = entier(r, 11, a - 6); return q(`${a} − ${b}`, a - b); } },
  { id: 'table', niveau: 1,
    tip: (x) => {
      if (x.facteurs.includes(9)) return '× 9 : multiplie par 10, puis retire le nombre. 9 × 12 = 120 − 12 = 108.';
      if (x.facteurs.includes(5)) return '× 5 : prends la moitié du × 10. 5 × 14 = 140 ÷ 2 = 70.';
      if (x.facteurs.includes(4)) return '× 4 : double, puis double encore. 4 × 13 → 26, puis 52.';
      if (x.facteurs.includes(8)) return '× 8 : double trois fois. 8 × 12 → 24, 48, 96.';
      return 'Décompose : 7 × 12 = 7 × 10 + 7 × 2 = 70 + 14 = 84.';
    },
    faire: (r) => { const a = entier(r, 2, 9); const b = entier(r, 2, 9); return q(`${a} × ${b}`, a * b, { facteurs: [a, b] }); } },
  { id: 'double', niveau: 1, tip: 'Double par morceaux : 126 → 100 × 2 + 26 × 2 = 200 + 52 = 252.',
    faire: (r) => { const a = entier(r, 12, 99); return q(`Double de ${a}`, 2 * a); } },
  { id: 'moitie', niveau: 1, tip: 'Moitié par morceaux : 134 → 100 ÷ 2 = 50, 34 ÷ 2 = 17, soit 67.',
    faire: (r) => { const a = 2 * entier(r, 11, 99); return q(`Moitié de ${a}`, a / 2); } },

  // ---------- niveau 2 ----------
  { id: 'add3', niveau: 2, tip: 'Arrondis à la centaine : 368 + 297 = 368 + 300 − 3 = 665.',
    faire: (r) => { const a = entier(r, 120, 880); const b = entier(r, 120, 880); return q(`${a} + ${b}`, a + b); } },
  { id: 'sub3', niveau: 2, tip: 'Soustrais en deux temps : 524 − 187 = 524 − 200 + 13 = 337.',
    faire: (r) => { const a = entier(r, 300, 999); const b = entier(r, 101, a - 50); return q(`${a} − ${b}`, a - b); } },
  { id: 'compl', niveau: 2,
    tip: 'Complément à 1 000 (ou 100) : complète chaque chiffre à 9, le dernier à 10. 1 000 − 637 → 3, 6, 3 : 363.',
    faire: (r) => (r() < 0.5 ? (() => { const n = entier(r, 11, 89); return q(`100 − ${n}`, 100 - n); })()
      : (() => { const n = entier(r, 101, 899); return q(`${nombre(1000)} − ${n}`, 1000 - n); })()) },
  { id: 'mul2x1', niveau: 2, tip: 'Décompose le grand nombre : 47 × 6 = 40 × 6 + 7 × 6 = 240 + 42 = 282.',
    faire: (r) => { const a = entier(r, 12, 99); const b = entier(r, 3, 9); return q(`${a} × ${b}`, a * b); } },
  { id: 'mul11', niveau: 2,
    tip: '× 11 : écris le premier chiffre, la somme des deux, puis le dernier. 53 × 11 → 5 (5+3) 3 = 583. Si la somme dépasse 9, retiens 1.',
    faire: (r) => { const a = entier(r, 12, 99); return q(`${a} × 11`, a * 11); } },
  { id: 'div', niveau: 2, tip: 'Cherche la multiplication à l\'envers : 78 ÷ 6 → 6 × ? = 78. Ou coupe : 60 + 18 → 10 + 3 = 13.',
    faire: (r) => { const b = entier(r, 3, 9); const c = entier(r, 6, 19); return q(`${b * c} ÷ ${b}`, c); } },
  { id: 'pct10', niveau: 2, tip: '10 % : décale la virgule d\'un rang (10 % de 1 450 = 145). 50 % : la moitié.',
    faire: (r) => (r() < 0.5 ? (() => { const b = 10 * entier(r, 12, 99); return q(`10 % de ${b}`, b / 10); })()
      : (() => { const b = 2 * entier(r, 11, 99); return q(`50 % de ${b}`, b / 2); })()) },

  // ---------- niveau 3 ----------
  { id: 'mul2x2', niveau: 3, tip: 'Décompose un facteur : 23 × 14 = 23 × 10 + 23 × 4 = 230 + 92 = 322.',
    faire: (r) => { const a = entier(r, 12, 39); const b = entier(r, 11, 29); return q(`${a} × ${b}`, a * b); } },
  { id: 'carre5', niveau: 3, tip: 'Un nombre qui finit par 5 : n × (n + 1), puis colle 25. 105² : 10 × 11 = 110 → 11 025.',
    faire: (r) => { const n = entier(r, 1, 9); const a = 10 * n + 5; return q(`${a}²`, a * a); } },
  { id: 'pct', niveau: 3,
    tip: 'Construis-le : 15 % = 10 % + 5 %, et 5 % est la moitié de 10 %. 15 % de 140 → 14 + 7 = 21.',
    faire: (r) => { const p = choisir(r, [5, 15, 20, 25, 30, 75]); const b = 20 * entier(r, 3, 30); return q(`${p} % de ${b}`, (p * b) / 100); } },
  { id: 'div3', niveau: 3, tip: 'Découpe en morceaux faciles : 624 ÷ 6 = 600 ÷ 6 + 24 ÷ 6 = 100 + 4 = 104.',
    faire: (r) => { const b = entier(r, 4, 9); const c = entier(r, 21, 99); return q(`${b * c} ÷ ${b}`, c); } },
  { id: 'sub4', niveau: 3, tip: 'Soustrais par blocs : 2 000 − 1 386 = 2 000 − 1 400 + 14 = 614.',
    faire: (r) => { const a = 100 * entier(r, 15, 99); const b = entier(r, 1001, a - 120); return q(`${nombre(a)} − ${nombre(b)}`, a - b); } },

  // ---------- niveau 4 ----------
  { id: 'mul2x2big', niveau: 4, tip: 'Passe par un nombre rond : 47 × 38 = 47 × 40 − 47 × 2 = 1 880 − 94 = 1 786.',
    faire: (r) => { const a = entier(r, 31, 99); const b = entier(r, 12, 49); return q(`${a} × ${b}`, a * b); } },
  { id: 'carre', niveau: 4, tip: '(n − a)(n + a) + a² : 53² = 50 × 56 + 3² = 2 800 + 9 = 2 809.',
    faire: (r) => { let a; do a = entier(r, 13, 49); while (a % 5 === 0); return q(`${a}²`, a * a); } },
  { id: 'mul3x1', niveau: 4, tip: 'Par centaines, dizaines, unités : 134 × 7 = 700 + 210 + 28 = 938.',
    faire: (r) => { const a = entier(r, 112, 987); const b = entier(r, 4, 9); return q(`${a} × ${b}`, a * b); } },
  { id: 'pctPlus', niveau: 4,
    tip: '+ 15 % : ajoute 10 % puis 5 %. − 20 % : retire 10 % deux fois. 160 + 15 % = 160 + 16 + 8 = 184.',
    faire: (r) => {
      const p = choisir(r, [5, 10, 15, 20, 25]); const b = 20 * entier(r, 4, 40); const plus = r() < 0.5;
      return q(`${b} ${plus ? '+' : '−'} ${p} %`, b + (plus ? 1 : -1) * ((p * b) / 100));
    } },
  { id: 'fraction', niveau: 4, tip: 'Divise par le dénominateur, multiplie par le numérateur : 5/6 de 126 → 126 ÷ 6 = 21, × 5 = 105.',
    faire: (r) => {
      const d = choisir(r, [3, 4, 5, 6, 8, 12]); const n = entier(r, 1, d - 1); const b = d * entier(r, 3, 15);
      return q(`${n}/${d} de ${b}`, (b / d) * n);
    } },
  { id: 'add4', niveau: 4, tip: 'Arrondis à la centaine : 3 478 + 2 596 = 3 478 + 2 600 − 4 = 6 074.',
    faire: (r) => { const a = entier(r, 1100, 8900); const b = entier(r, 1100, 8900); return q(`${nombre(a)} + ${nombre(b)}`, a + b); } },
];

// Question suivante : jamais deux fois de suite le même type ni la même question (si le niveau le permet).
export function question(niveau, rng = Math.random, precedente = null) {
  const types = TYPES.filter((t) => t.niveau === niveau);
  if (!types.length) throw new Error(`niveau inconnu : ${niveau}`);
  let essai = null;
  for (let i = 0; i < 8; i++) {
    const t = choisir(rng, types);
    const base = t.faire(rng);
    essai = { ...base, type: t.id, niveau, astuce: typeof t.tip === 'function' ? t.tip(base) : t.tip };
    if (!precedente || (essai.type !== precedente.type && essai.texte !== precedente.texte)) break;
  }
  return essai;
}

// Réponse saisie → nombre (espaces et espaces insécables ignorés, virgule acceptée) ; NaN si ce n'est pas un nombre.
export function lireReponse(saisie) {
  const t = String(saisie ?? '').replace(/[\s  ]/g, '').replace(',', '.').replace('−', '-');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
