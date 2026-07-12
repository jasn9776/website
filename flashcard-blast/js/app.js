import { $, el } from "./util.js";
import { parseDeck } from "./parse.js";
import * as storage from "./storage.js";

import mountMatch from "./games/match.js";
import mountInvaders from "./games/invaders.js";
import mountRecall from "./games/recall.js";

const GAME_MODULES = {
  match: mountMatch,
  invaders: mountInvaders,
  recall: mountRecall,
};

const MODE_LABELS = {
  match: "Match",
  invaders: "Invaders",
  recall: "Free Recall",
};

const SCREENS = [
  "screen-decks",
  "screen-import",
  "screen-modes",
  "screen-game",
  "screen-result",
  "screen-stats",
];

// ---------- App state ----------
const state = {
  currentDeckId: null,
  currentMode: null,
  cleanup: null,
  lastResult: null,
};

function qKey(q) {
  return String(q || "").toLowerCase().trim();
}

// ---------- Screen router ----------
function showScreen(id) {
  for (const s of SCREENS) {
    $("#" + s).classList.toggle("hidden", s !== id);
  }
}

// ---------- Deck list screen ----------
function renderDeckList() {
  const decks = storage.getDecks();
  const container = $("#deck-list");
  container.innerHTML = "";

  if (decks.length === 0) {
    container.appendChild(
      el("div", { className: "empty-state" }, [
        "No decks yet. Import a CSV, TSV, or Anki export to get started.",
      ])
    );
    return;
  }

  const sorted = decks.slice().sort((a, b) => b.updatedAt - a.updatedAt);

  for (const deck of sorted) {
    const scoreBadges = ["match", "invaders", "recall"].map((mode) => {
      const best = storage.bestScore(deck.id, mode);
      const text = best == null ? `${MODE_LABELS[mode]}: —` : `${MODE_LABELS[mode]}: ${formatScore(mode, best.score)}`;
      return el("span", { className: "badge" }, [text]);
    });

    const row = el("div", { className: "card deck-row" }, [
      el("div", { className: "deck-row-main" }, [
        el("div", { className: "deck-name" }, [deck.name]),
        el("div", { className: "deck-meta" }, [
          `${deck.cards.length} card${deck.cards.length === 1 ? "" : "s"}`,
        ]),
        el("div", { className: "deck-scores" }, scoreBadges),
      ]),
      el("div", { className: "deck-row-actions" }, [
        el(
          "button",
          {
            className: "btn btn-primary",
            type: "button",
            onclick: () => openModeSelect(deck.id),
          },
          ["Play"]
        ),
        el(
          "button",
          {
            className: "btn btn-danger",
            type: "button",
            title: "Delete deck",
            onclick: () => onDeleteDeck(deck.id, deck.name),
          },
          ["Delete"]
        ),
      ]),
    ]);

    container.appendChild(row);
  }
}

function onDeleteDeck(id, name) {
  const ok = window.confirm(`Delete deck "${name}"? This also removes its score history.`);
  if (!ok) return;
  storage.deleteDeck(id);
  renderDeckList();
}

function formatScore(mode, score) {
  if (mode === "match") {
    const totalMs = Math.round(score);
    const seconds = (totalMs / 1000).toFixed(1);
    return `${seconds}s`;
  }
  return String(score);
}

// ---------- Import screen ----------
function resetImportScreen() {
  $("#file-input").value = "";
  $("#paste-textarea").value = "";
  $("#import-name").value = "";
  $("#import-message").innerHTML = "";
  $("#dropzone").classList.remove("dragover");
}

function openImportScreen() {
  resetImportScreen();
  showScreen("screen-import");
}

function showImportMessage(text, isError) {
  const box = $("#import-message");
  box.innerHTML = "";
  box.appendChild(
    el("div", { className: isError ? "import-error" : "import-success" }, [text])
  );
}

function finishImport(name, cards) {
  if (!cards || cards.length === 0) {
    showImportMessage("No cards found. Check the file format and try again.", true);
    return;
  }
  const deck = storage.upsertDeck({ name, cards });
  showImportMessage(`Imported "${deck.name}" (${deck.cards.length} cards).`, false);
  renderDeckList();
  setTimeout(() => {
    // only auto-return if the user is still on the import screen
    if (!$("#screen-import").classList.contains("hidden")) {
      showScreen("screen-decks");
    }
  }, 700);
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "");
      const { name, cards } = parseDeck(text, file.name);
      finishImport(name, cards);
    } catch (err) {
      showImportMessage("Could not parse that file: " + (err && err.message ? err.message : err), true);
    }
  };
  reader.onerror = () => {
    showImportMessage("Could not read that file.", true);
  };
  reader.readAsText(file);
}

function handlePasteImport() {
  const text = $("#paste-textarea").value;
  const nameInput = $("#import-name").value.trim();
  if (!text.trim()) {
    showImportMessage("Paste some text first.", true);
    return;
  }
  try {
    const filename = (nameInput || "pasted-deck") + ".txt";
    const parsed = parseDeck(text, filename);
    const name = nameInput || parsed.name;
    finishImport(name, parsed.cards);
  } catch (err) {
    showImportMessage("Could not parse that text: " + (err && err.message ? err.message : err), true);
  }
}

function wireImportScreen() {
  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  $("#btn-import-paste").addEventListener("click", handlePasteImport);
  $("#btn-import-open").addEventListener("click", openImportScreen);
  $("#btn-import-cancel").addEventListener("click", () => showScreen("screen-decks"));
}

// ---------- Mode select screen ----------
function openModeSelect(deckId) {
  const deck = storage.getDeck(deckId);
  if (!deck) {
    showScreen("screen-decks");
    return;
  }
  state.currentDeckId = deckId;

  $("#modes-deck-name").textContent = deck.name;
  $("#modes-deck-meta").textContent = `${deck.cards.length} card${deck.cards.length === 1 ? "" : "s"}`;

  const cardCount = deck.cards.length;

  configureModeButton("match", cardCount >= 2, "Match needs at least 2 cards.");
  configureModeButton("invaders", cardCount >= 2, "Invaders needs at least 2 cards.");
  configureModeButton("recall", cardCount >= 1, "Add at least 1 card to play.");

  for (const mode of ["match", "invaders", "recall"]) {
    const best = storage.bestScore(deckId, mode);
    $("#mode-best-" + mode).textContent = best == null ? "" : `Best: ${formatScore(mode, best.score)}`;
  }

  renderStudySection(deck);

  showScreen("screen-modes");
}

// ---------- Study section (mode-select screen) ----------
function renderStudySection(deck) {
  const container = $("#study-section");
  container.innerHTML = "";

  const missedKeys = storage.getMissedQuestions(deck.id);
  const missedCount = missedKeys.length;

  if (missedCount === 0) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");

  const heading = el("div", { className: "study-heading" }, [
    `📖 Study mistakes — ${missedCount} card${missedCount === 1 ? "" : "s"}`,
  ]);

  const canPair = missedCount >= 2;

  const buttons = el("div", { className: "study-buttons" }, [
    el(
      "button",
      {
        className: "btn study-btn",
        type: "button",
        disabled: !canPair,
        title: canPair ? "" : "Needs at least 2 missed cards.",
        onclick: () => {
          if (!canPair) return;
          launchGame(deck.id, "match", true);
        },
      },
      ["Match"]
    ),
    el(
      "button",
      {
        className: "btn study-btn",
        type: "button",
        disabled: !canPair,
        title: canPair ? "" : "Needs at least 2 missed cards.",
        onclick: () => {
          if (!canPair) return;
          launchGame(deck.id, "invaders", true);
        },
      },
      ["Invaders"]
    ),
    el(
      "button",
      {
        className: "btn study-btn",
        type: "button",
        onclick: () => launchGame(deck.id, "recall", true),
      },
      ["Free Recall"]
    ),
  ]);

  container.appendChild(heading);
  container.appendChild(buttons);
}

function configureModeButton(mode, enabled, tooltip) {
  const btn = $("#mode-btn-" + mode);
  btn.disabled = !enabled;
  btn.title = enabled ? "" : tooltip;
}

function wireModeSelectScreen() {
  for (const mode of ["match", "invaders", "recall"]) {
    $("#mode-btn-" + mode).addEventListener("click", () => {
      if ($("#mode-btn-" + mode).disabled) return;
      launchGame(state.currentDeckId, mode);
    });
  }
  $("#btn-modes-back").addEventListener("click", () => showScreen("screen-decks"));
  $("#btn-modes-stats").addEventListener("click", () => openStatsScreen(state.currentDeckId));
}

// ---------- Game screen ----------
function launchGame(deckId, mode, study) {
  const deck = storage.getDeck(deckId);
  if (!deck) {
    showScreen("screen-decks");
    return;
  }
  state.currentDeckId = deckId;
  state.currentMode = mode;

  let gameDeck = deck;
  if (study) {
    const missedSet = new Set(storage.getMissedQuestions(deckId));
    gameDeck = { ...deck, cards: deck.cards.filter((c) => missedSet.has(qKey(c.q))) };
  }

  const host = $("#game-host");
  host.innerHTML = "";
  host.className = ""; // games add their own root class to the host; clear stale ones
  $("#game-mode-label").textContent = MODE_LABELS[mode] + (study ? " · Study" : "");

  const mount = GAME_MODULES[mode];

  // reveal the screen before mounting so games measure a real container size
  showScreen("screen-game");

  const cleanup = mount(host, gameDeck, (result) => {
    // per the game contract, cleanup is idempotent and safe after onFinish
    abortGame();
    if (!result.aborted) {
      storage.updateMissedPool(deck.id, (result.detail && result.detail.cardResults) || []);
      const detail = study ? { ...result.detail, study: true } : result.detail;
      storage.addScore({
        deckId: deck.id,
        mode,
        score: result.score,
        detail,
      });
      result = { ...result, detail };
    }
    showResultScreen(result, deck, mode, study);
  });

  state.cleanup = cleanup;
}

function abortGame() {
  if (state.cleanup) {
    try {
      state.cleanup();
    } catch (e) {
      // ignore cleanup errors
    }
    state.cleanup = null;
  }
}

function wireGameScreen() {
  $("#btn-game-back").addEventListener("click", () => {
    abortGame();
    if (state.currentDeckId) {
      openModeSelect(state.currentDeckId);
    } else {
      showScreen("screen-decks");
    }
  });
}

// ---------- Result screen ----------
function showResultScreen(result, deck, mode, study) {
  state.lastResult = { result, deck, mode, study: !!study };

  $("#result-score").textContent = result.aborted ? "—" : formatScore(mode, result.score);

  const detailEl = $("#result-detail");
  detailEl.innerHTML = "";
  if (result.aborted) {
    detailEl.appendChild(el("div", {}, ["Round abandoned."]));
  } else if (result.detail) {
    const parts = Object.entries(result.detail)
      .filter(([k]) => k !== "cardResults" && k !== "study")
      .map(([k, v]) => `${k}: ${v}`);
    const line = (study ? "📖 Study round  ·  " : "") + parts.join("  ·  ");
    detailEl.appendChild(el("div", {}, [line]));
  }

  showScreen("screen-result");
}

function wireResultScreen() {
  $("#btn-result-again").addEventListener("click", () => {
    const { deck, mode, study } = state.lastResult || {};
    if (deck && mode) launchGame(deck.id, mode, study);
  });
  $("#btn-result-menu").addEventListener("click", () => {
    const { deck } = state.lastResult || {};
    if (deck) openModeSelect(deck.id);
    else showScreen("screen-decks");
  });
  $("#btn-result-decks").addEventListener("click", () => {
    renderDeckList();
    showScreen("screen-decks");
  });
}

// ---------- Stats screen ----------
function openStatsScreen(deckId) {
  const deck = storage.getDeck(deckId);
  if (!deck) {
    showScreen("screen-decks");
    return;
  }
  state.currentDeckId = deckId;
  $("#stats-deck-name").textContent = `${deck.name} — Stats`;

  const body = $("#stats-body");
  body.innerHTML = "";

  let anyScores = false;

  for (const mode of ["match", "invaders", "recall"]) {
    const scores = storage.getScores(deckId, mode);
    if (scores.length === 0) continue;
    anyScores = true;

    const best = storage.bestScore(deckId, mode);

    const table = el("table", { className: "stats-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, ["Date"]),
          el("th", {}, ["Score"]),
          el("th", {}, ["Detail"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        scores.map((s) =>
          el(
            "tr",
            { className: best && s.at === best.at && s.score === best.score ? "best-row" : "" },
            [
              el("td", {}, [
                new Date(s.at).toLocaleString(),
                s.detail && s.detail.study
                  ? el("span", { className: "badge badge-study" }, ["📖 study"])
                  : null,
              ]),
              el("td", {}, [formatScore(mode, s.score)]),
              el("td", {}, [
                s.detail
                  ? Object.entries(s.detail)
                      .filter(([k]) => k !== "cardResults" && k !== "study")
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")
                  : "",
              ]),
            ]
          )
        )
      ),
    ]);

    body.appendChild(
      el("div", { className: "stats-mode-group" }, [
        el("div", { className: "stats-mode-title" }, [MODE_LABELS[mode]]),
        table,
      ])
    );
  }

  if (!anyScores) {
    body.appendChild(el("div", { className: "empty-state" }, ["No games played yet."]));
  }

  showScreen("screen-stats");
}

function wireStatsScreen() {
  $("#btn-stats-back").addEventListener("click", () => openModeSelect(state.currentDeckId));
}

// ---------- Init ----------
function init() {
  wireImportScreen();
  wireModeSelectScreen();
  wireGameScreen();
  wireResultScreen();
  wireStatsScreen();

  renderDeckList();
  showScreen("screen-decks");
}

init();
