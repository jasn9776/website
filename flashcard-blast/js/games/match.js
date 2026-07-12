// Match game: drag an elastic line from a question card to its matching answer card.
import { shuffle, el, particleBurst, createTimer } from '../util.js';

const MAX_PAIRS = 10;
const MIN_PAIRS = 2;
const CARD_W = 150;
const CARD_H = 84;
const JITTER = 10; // px of random offset within a grid cell, bounded to avoid overlap

export default function mount(container, deck, onFinish) {
  let finished = false;
  let destroyed = false;

  // ---- pick cards ----
  const n = Math.max(MIN_PAIRS, Math.min(MAX_PAIRS, deck.cards.length));
  const pairIds = shuffle(deck.cards.map((_, i) => i)).slice(0, n);
  const pairs = pairIds.map((i, idx) => ({
    id: 'p' + idx,
    card: deck.cards[i],
    matched: false
  }));

  let mistakes = 0;
  let remaining = pairs.length;
  const wrongPairIds = new Set();
  const timer = createTimer();
  timer.start();

  // ---- DOM scaffold ----
  container.classList.add('match-game');

  const hud = el('div', { class: 'match-hud' }, [
    el('div', { class: 'match-hud-item' }, [
      el('span', { class: 'match-hud-label' }, ['Time']),
      el('span', { class: 'match-hud-value', 'data-role': 'timer' }, ['0:00'])
    ]),
    el('div', { class: 'match-hud-item' }, [
      el('span', { class: 'match-hud-label' }, ['Mistakes']),
      el('span', { class: 'match-hud-value', 'data-role': 'mistakes' }, ['0'])
    ]),
    el('div', { class: 'match-hud-item' }, [
      el('span', { class: 'match-hud-label' }, ['Remaining']),
      el('span', { class: 'match-hud-value', 'data-role': 'remaining' }, [String(remaining)])
    ])
  ]);

  const board = el('div', { class: 'match-board' });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'match-line-layer');
  const lineEl = document.createElementNS(svgNS, 'path');
  lineEl.setAttribute('class', 'match-elastic-line');
  lineEl.style.display = 'none';
  svg.appendChild(lineEl);
  board.appendChild(svg);

  container.appendChild(hud);
  container.appendChild(board);

  const timerValueEl = hud.querySelector('[data-role="timer"]');
  const mistakesValueEl = hud.querySelector('[data-role="mistakes"]');
  const remainingValueEl = hud.querySelector('[data-role="remaining"]');

  // ---- build cards ----
  // Build a shuffled list of "slots": one question + one answer per pair, in random order.
  const slots = shuffle(
    pairs.flatMap(p => ([
      { kind: 'q', pairId: p.id, text: p.card.q },
      { kind: 'a', pairId: p.id, text: p.card.a }
    ]))
  );

  const cardEls = new Map(); // pairId -> { q: HTMLElement, a: HTMLElement }
  pairs.forEach(p => cardEls.set(p.id, {}));

  slots.forEach(slot => {
    const cardEl = el('div', {
      class: `card match-card match-card-${slot.kind === 'q' ? 'question' : 'answer'}`,
      'data-pair-id': slot.pairId,
      'data-kind': slot.kind
    }, [el('div', { class: 'match-card-text' }, [slot.text])]);
    board.appendChild(cardEl);
    cardEls.get(slot.pairId)[slot.kind] = cardEl;
  });

  const allCardEls = Array.from(board.querySelectorAll('.match-card'));

  // ---- grid-jitter layout (§4) ----
  function layout() {
    const rect = board.getBoundingClientRect();
    const w = Math.max(rect.width, CARD_W + 40);
    const h = Math.max(rect.height, CARD_H * 4);
    const count = allCardEls.length;
    // columns bounded by how many cards physically fit, so cells are never
    // smaller than a card (cellW >= CARD_W + gap guarantees no overlap)
    const gap = 12;
    const fitCols = Math.max(1, Math.floor(w / (CARD_W + gap)));
    const cols = Math.max(1, Math.min(fitCols, Math.ceil(Math.sqrt(2 * count))));
    const rows = Math.max(1, Math.ceil(count / cols));

    const cellW = w / cols;
    const cellH = Math.max(h / rows, CARD_H + gap);

    // bounded jitter so cards never leave their cell (and thus never overlap)
    const maxJitterX = Math.max(0, Math.min(JITTER, (cellW - CARD_W) / 2));
    const maxJitterY = Math.max(0, Math.min(JITTER, (cellH - CARD_H) / 2));

    const cellIndices = shuffle(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, count);

    allCardEls.forEach((cardEl, i) => {
      const cellIndex = cellIndices[i];
      const col = cellIndex % cols;
      const row = Math.floor(cellIndex / cols);

      const baseX = col * cellW + (cellW - CARD_W) / 2;
      const baseY = row * cellH + (cellH - CARD_H) / 2;

      const jx = (Math.random() * 2 - 1) * maxJitterX;
      const jy = (Math.random() * 2 - 1) * maxJitterY;

      const x = Math.max(0, Math.min(w - CARD_W, baseX + jx));
      const y = Math.max(0, Math.min(h - CARD_H, baseY + jy));

      cardEl.style.left = x + 'px';
      cardEl.style.top = y + 'px';
    });

    const neededHeight = rows * cellH;
    board.style.minHeight = neededHeight + 'px';
  }

  layout();

  let resizeRAF = null;
  function onResize() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = null;
      if (!destroyed) layout();
    });
  }
  window.addEventListener('resize', onResize);

  // ---- HUD tick ----
  let hudInterval = setInterval(() => {
    if (destroyed) return;
    const ms = timer.elapsed();
    timerValueEl.textContent = formatTime(ms);
  }, 250);

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // ---- drag / tap-to-select interaction ----
  let activeQuestion = null; // { pairId, el, pointerId }
  let tapSelectedQuestion = null; // for tap-to-select flow

  function boardPoint(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function showLine(x1, y1, x2, y2) {
    lineEl.style.display = '';
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    // slight elastic curve via quadratic bezier using a perpendicular bow
    const dx = x2 - x1, dy = y2 - y1;
    const bow = 0.08;
    const cx = midX - dy * bow;
    const cy = midY + dx * bow;
    lineEl.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
  }

  function hideLine() {
    lineEl.style.display = 'none';
  }

  function cardCenter(cardEl) {
    const rect = cardEl.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    return {
      x: rect.left - boardRect.left + rect.width / 2,
      y: rect.top - boardRect.top + rect.height / 2,
      viewportX: rect.left + rect.width / 2,
      viewportY: rect.top + rect.height / 2
    };
  }

  function clearTapSelection() {
    if (tapSelectedQuestion) {
      tapSelectedQuestion.classList.remove('match-selected');
      tapSelectedQuestion = null;
    }
    hideLine();
  }

  function onPointerDown(e) {
    const cardEl = e.target.closest('.match-card-question');
    if (!cardEl || cardEl.classList.contains('match-inert')) return;
    if (finished) return;
    e.preventDefault();

    clearTapSelection();

    activeQuestion = { pairId: cardEl.dataset.pairId, el: cardEl, pointerId: e.pointerId };
    cardEl.setPointerCapture(e.pointerId);
    cardEl.classList.add('match-dragging');

    const start = cardCenter(cardEl);
    const pt = boardPoint(e.clientX, e.clientY);
    showLine(start.x, start.y, pt.x, pt.y);

    cardEl.addEventListener('pointermove', onPointerMove);
    cardEl.addEventListener('pointerup', onPointerUp);
    cardEl.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(e) {
    if (!activeQuestion) return;
    const start = cardCenter(activeQuestion.el);
    const pt = boardPoint(e.clientX, e.clientY);
    showLine(start.x, start.y, pt.x, pt.y);
  }

  function endDrag(cardEl) {
    cardEl.removeEventListener('pointermove', onPointerMove);
    cardEl.removeEventListener('pointerup', onPointerUp);
    cardEl.removeEventListener('pointercancel', onPointerCancel);
    cardEl.classList.remove('match-dragging');
  }

  function onPointerUp(e) {
    if (!activeQuestion) return;
    const q = activeQuestion;
    activeQuestion = null;
    endDrag(q.el);
    try { q.el.releasePointerCapture(q.pointerId); } catch (err) { /* noop */ }

    hideLine();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const answerEl = target && target.closest ? target.closest('.match-card-answer') : null;
    if (answerEl && !answerEl.classList.contains('match-inert')) {
      attemptMatch(q.el, answerEl);
    }
  }

  function onPointerCancel(e) {
    if (!activeQuestion) return;
    const q = activeQuestion;
    activeQuestion = null;
    endDrag(q.el);
    hideLine();
  }

  function onCardClick(e) {
    // tap-to-select fallback (also fires after a plain click on touch/mouse)
    if (finished) return;
    const questionEl = e.target.closest('.match-card-question');
    const answerEl = e.target.closest('.match-card-answer');

    if (questionEl && !questionEl.classList.contains('match-inert')) {
      if (tapSelectedQuestion === questionEl) {
        clearTapSelection();
        return;
      }
      clearTapSelection();
      tapSelectedQuestion = questionEl;
      questionEl.classList.add('match-selected');
      return;
    }

    if (answerEl && !answerEl.classList.contains('match-inert') && tapSelectedQuestion) {
      const q = tapSelectedQuestion;
      tapSelectedQuestion = null;
      q.classList.remove('match-selected');
      attemptMatch(q, answerEl);
    }
  }

  function attemptMatch(questionEl, answerEl) {
    const pairId = questionEl.dataset.pairId;
    const isCorrect = pairId === answerEl.dataset.pairId;

    if (isCorrect) {
      const center = cardCenter(answerEl);
      questionEl.classList.add('flash-correct');
      answerEl.classList.add('flash-correct');
      particleBurst(center.viewportX, center.viewportY, { color: 'var(--correct)' });

      questionEl.classList.add('match-inert');
      answerEl.classList.add('match-inert');

      setTimeout(() => {
        if (destroyed) return;
        questionEl.classList.add('match-out');
        answerEl.classList.add('match-out');
      }, 250);

      const pair = pairs.find(p => p.id === pairId);
      if (pair) pair.matched = true;
      remaining -= 1;
      remainingValueEl.textContent = String(remaining);

      if (remaining <= 0) {
        finish();
      }
    } else {
      mistakes += 1;
      mistakesValueEl.textContent = String(mistakes);
      wrongPairIds.add(questionEl.dataset.pairId);
      wrongPairIds.add(answerEl.dataset.pairId);
      questionEl.classList.add('flash-wrong');
      answerEl.classList.add('flash-wrong');
      setTimeout(() => {
        if (destroyed) return;
        questionEl.classList.remove('flash-wrong');
        answerEl.classList.remove('flash-wrong');
      }, 420);
    }
  }

  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('click', onCardClick);

  function finish() {
    if (finished) return;
    finished = true;
    const timeMs = timer.stop();
    const cardResults = pairs.map(p => ({ q: p.card.q, ok: !wrongPairIds.has(p.id) }));
    onFinish({
      score: timeMs + mistakes * 5000,
      detail: { timeMs, mistakes, cardResults }
    });
  }

  function cleanup() {
    if (destroyed) return;
    destroyed = true;

    window.removeEventListener('resize', onResize);
    if (resizeRAF) { cancelAnimationFrame(resizeRAF); resizeRAF = null; }
    if (hudInterval) { clearInterval(hudInterval); hudInterval = null; }

    board.removeEventListener('pointerdown', onPointerDown);
    board.removeEventListener('click', onCardClick);

    if (activeQuestion) {
      endDrag(activeQuestion.el);
      activeQuestion = null;
    }

    try { timer.stop(); } catch (err) { /* already stopped */ }
  }

  return cleanup;
}
