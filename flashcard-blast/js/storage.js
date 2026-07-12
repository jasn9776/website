import { fnv1a } from "./util.js";

const KEY_DECKS = "fc:decks";
const KEY_SCORES = "fc:scores";
const KEY_SCHEMA = "fc:schema";
const KEY_MISSED = "fc:missed";
const SCHEMA_VERSION = 1;

export const MODE_LOWER_IS_BETTER = { match: true, invaders: false, recall: false };

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureSchema() {
  const current = readJSON(KEY_SCHEMA, null);
  if (current !== SCHEMA_VERSION) {
    writeJSON(KEY_SCHEMA, SCHEMA_VERSION);
  }
}

ensureSchema();

function computeDeckId(name, cards) {
  const normalizedName = String(name || "").toLowerCase().trim();
  const sortedCardKeys = cards
    .map((c) => c.q.toLowerCase().trim())
    .sort()
    .join("");
  return "d" + fnv1a(normalizedName + " " + sortedCardKeys);
}

export function getDecks() {
  return readJSON(KEY_DECKS, []);
}

function saveDecks(decks) {
  writeJSON(KEY_DECKS, decks);
}

export function getDeck(id) {
  const decks = getDecks();
  return decks.find((d) => d.id === id) || null;
}

export function upsertDeck({ name, cards }) {
  const decks = getDecks();
  const id = computeDeckId(name, cards);
  const now = Date.now();
  const existingIndex = decks.findIndex((d) => d.id === id);

  if (existingIndex !== -1) {
    const existing = decks[existingIndex];
    const updated = {
      ...existing,
      name,
      cards,
      updatedAt: now,
    };
    decks[existingIndex] = updated;
    saveDecks(decks);
    return updated;
  }

  const deck = {
    id,
    name,
    cards,
    createdAt: now,
    updatedAt: now,
  };
  decks.push(deck);
  saveDecks(decks);
  return deck;
}

export function deleteDeck(id) {
  const decks = getDecks().filter((d) => d.id !== id);
  saveDecks(decks);
  const scores = readJSON(KEY_SCORES, []).filter((s) => s.deckId !== id);
  writeJSON(KEY_SCORES, scores);
  const missed = readJSON(KEY_MISSED, {});
  if (Object.prototype.hasOwnProperty.call(missed, id)) {
    delete missed[id];
    writeJSON(KEY_MISSED, missed);
  }
}

export function getScores(deckId, mode) {
  let scores = readJSON(KEY_SCORES, []);
  if (deckId != null) scores = scores.filter((s) => s.deckId === deckId);
  if (mode != null) scores = scores.filter((s) => s.mode === mode);
  return scores.slice().sort((a, b) => b.at - a.at);
}

export function addScore(record) {
  const scores = readJSON(KEY_SCORES, []);
  const stamped = { ...record, at: Date.now() };
  scores.push(stamped);
  writeJSON(KEY_SCORES, scores);
}

export function bestScore(deckId, mode) {
  const scores = getScores(deckId, mode).filter((s) => !(s.detail && s.detail.study));
  if (scores.length === 0) return null;
  const lowerIsBetter = MODE_LOWER_IS_BETTER[mode];
  return scores.reduce((best, s) => {
    if (best == null) return s;
    if (lowerIsBetter) return s.score < best.score ? s : best;
    return s.score > best.score ? s : best;
  }, null);
}

// ---------- Missed-card pool ("study your mistakes") ----------

function qKey(q) {
  return String(q || "").toLowerCase().trim();
}

export function getMissedQuestions(deckId) {
  const missed = readJSON(KEY_MISSED, {});
  const deckMissed = missed[deckId];
  if (!deckMissed) return [];
  return Object.keys(deckMissed);
}

export function updateMissedPool(deckId, cardResults) {
  if (!cardResults || cardResults.length === 0) return;
  const missed = readJSON(KEY_MISSED, {});
  const deckMissed = missed[deckId] ? { ...missed[deckId] } : {};

  for (const r of cardResults) {
    const key = qKey(r.q);
    if (r.ok) {
      delete deckMissed[key];
    } else {
      const prev = deckMissed[key];
      deckMissed[key] = { count: (prev ? prev.count : 0) + 1, at: Date.now() };
    }
  }

  missed[deckId] = deckMissed;
  writeJSON(KEY_MISSED, missed);
}
