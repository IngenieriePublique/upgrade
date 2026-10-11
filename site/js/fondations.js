// Logique pure du curriculum « Fondations » : statut des kits, prochain kit du jour, cartes des kits ouverts.
// Un kit s'ouvre quand l'utilisateur clique « Commencer » : ses cartes entrent alors dans la révision.

export const ID_NOTE = (kitId) => `kit:${kitId}`;

// note : null ou { data: { startedAt, readAt?, doneAt?, debat?: [..] } }
export function statutKit(note) {
  const d = note?.data;
  if (!d || !d.startedAt) return 'a-faire';
  return d.doneAt ? 'termine' : 'en-cours';
}

export const LIBELLES = { 'a-faire': 'À faire', 'en-cours': 'En cours', termine: 'Terminé' };

export function notesParKit(notes) {
  return new Map(notes.filter((n) => n.id.startsWith('kit:') && !n.deleted).map((n) => [n.id.slice(4), n]));
}

// Kit à proposer un jour donné (0 = dimanche … 6 = samedi) : un kit en cours d'abord, sinon le premier non commencé
// du parcours assigné à ce jour. Si plusieurs parcours se partagent le jour, on prend celui qui a le moins de kits terminés.
export function prochainKit(index, notes, jourSemaine) {
  const parNote = notesParKit(notes);
  const statut = (k) => statutKit(parNote.get(k.id));
  const parcoursDuJour = index.parcours.filter((p) => p.jours.includes(jourSemaine));
  if (!parcoursDuJour.length) return null;
  const termines = (p) => index.kits.filter((k) => k.parcours === p.id && statut(k) === 'termine').length;
  const tries = [...parcoursDuJour].sort((a, b) => termines(a) - termines(b) || a.id.localeCompare(b.id));
  for (const p of tries) {
    const kits = index.kits.filter((k) => k.parcours === p.id).sort((a, b) => a.ordre - b.ordre);
    const encours = kits.find((k) => statut(k) === 'en-cours');
    if (encours) return encours;
  }
  for (const p of tries) {
    const suivant = index.kits.filter((k) => k.parcours === p.id).sort((a, b) => a.ordre - b.ordre).find((k) => statut(k) === 'a-faire');
    if (suivant) return suivant;
  }
  return null;
}

export function resumeParcours(index, notes) {
  const parNote = notesParKit(notes);
  return index.parcours.map((p) => {
    const kits = index.kits.filter((k) => k.parcours === p.id);
    const st = (k) => statutKit(parNote.get(k.id));
    return { ...p, total: kits.length, termines: kits.filter((k) => st(k) === 'termine').length, encours: kits.filter((k) => st(k) === 'en-cours').length };
  });
}

// Ajoute (sans doublon) les cartes d'un kit au paquet « Fondations » de son parcours dans `decks` (modifié sur place).
export function ajouterCartesKit(decks, parcours, kit) {
  const id = `fondations-${kit.parcours.toLowerCase()}`;
  let deck = decks.find((d) => d.id === id);
  if (!deck) {
    deck = { id, titre: `Fondations : ${parcours.titre}`, description: parcours.description, cartes: [] };
    decks.push(deck);
  }
  const deja = new Set(deck.cartes.map((c) => c.id));
  for (const c of kit.cartes) {
    if (!deja.has(c.id)) deck.cartes.push({ ...c, deck: id, deckTitre: deck.titre });
  }
  return deck;
}
