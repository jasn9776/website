// Free Recall game: phase 1 tests free-typed recall of each answer (auto-marked via
// fuzzy match), phase 2 shows a review table where marks can be manually overridden.
import { shuffle, el, fuzzyMatch, particleBurst } from '../util.js';

export default function mount(container, deck, onFinish) {
  let finished = false;
  let destroyed = false;

  const order = shuffle(deck.cards.map((_, i) => i));
  const total = order.length;

  // results[i] -> { card, guess, ok (bool, possibly overridden), ratio }
  const results = [];

  let phase = 'test'; // 'test' | 'review'
  let idx = 0;
  let advancing = false; // guards double-submit while feedback is showing

  container.classList.add('recall-game');

  // ---- teardown bookkeeping ----
  // Listeners are scoped per-render: renderFns are cleared each time the view
  // switches (renderTest -> renderTest -> renderReview), and again on cleanup().
  let renderCleanupFns = [];
  function track(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    renderCleanupFns.push(() => target.removeEventListener(type, handler, opts));
  }

  function clearContainer() {
    for (const off of renderCleanupFns) off();
    renderCleanupFns = [];
    container.innerHTML = '';
  }

  // ================= Phase 1: test =================

  function renderTest() {
    clearContainer();

    const card = deck.cards[order[idx]];

    const progress = el('div', { class: 'recall-progress' }, [
      `${idx + 1}/${total}`
    ]);

    const questionCard = el('div', { class: 'card recall-question-card' }, [
      el('div', { class: 'recall-label' }, ['Question']),
      el('div', { class: 'recall-question-text' }, [card.q])
    ]);

    const input = el('input', {
      type: 'text',
      class: 'recall-input',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'Type your answer…'
    });

    const submitBtn = el('button', { class: 'btn btn-primary recall-submit', type: 'button' }, ['Submit']);

    const feedback = el('div', { class: 'recall-feedback hidden' });

    const form = el('div', { class: 'recall-test-form' }, [input, submitBtn]);

    const panel = el('div', { class: 'recall-panel' }, [
      progress,
      questionCard,
      form,
      feedback
    ]);

    container.appendChild(panel);

    input.focus();

    function submit() {
      if (advancing || destroyed) return;
      const guess = input.value;
      const match = fuzzyMatch(guess, card.a);

      results.push({ card, guess, ok: match.ok, ratio: match.ratio });

      advancing = true;
      input.disabled = true;
      submitBtn.disabled = true;

      questionCard.classList.add(match.ok ? 'flash-correct' : 'flash-wrong');

      feedback.classList.remove('hidden');
      feedback.classList.add(match.ok ? 'recall-feedback-correct' : 'recall-feedback-wrong');
      feedback.textContent = match.ok
        ? 'Correct!'
        : `Answer: ${card.a}`;

      if (match.ok) {
        const rect = questionCard.getBoundingClientRect();
        particleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }

      window.setTimeout(() => {
        if (destroyed) return;
        advancing = false;
        idx += 1;
        if (idx >= total) {
          phase = 'review';
          render();
        } else {
          render();
        }
      }, 900);
    }

    track(submitBtn, 'click', submit);
    track(input, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  // ================= Phase 2: review =================

  function renderReview() {
    clearContainer();

    const heading = el('div', { class: 'recall-review-heading' }, [
      el('h3', {}, ['Review your answers']),
      el('p', { class: 'recall-review-hint' }, ['Tap the mark to override auto-grading.'])
    ]);

    const table = el('table', { class: 'recall-review-table' });
    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, ['Question']),
        el('th', {}, ['Your answer']),
        el('th', {}, ['Correct answer']),
        el('th', {}, ['Mark'])
      ])
    ]);
    const tbody = el('tbody');

    results.forEach((r, i) => {
      const markBtn = el('button', {
        class: `recall-mark-btn ${r.ok ? 'recall-mark-correct' : 'recall-mark-wrong'}`,
        type: 'button',
        'aria-label': 'Toggle mark'
      }, [r.ok ? '✓' : '✗']);

      track(markBtn, 'click', () => {
        r.ok = !r.ok;
        markBtn.classList.toggle('recall-mark-correct', r.ok);
        markBtn.classList.toggle('recall-mark-wrong', !r.ok);
        markBtn.textContent = r.ok ? '✓' : '✗';
        row.classList.toggle('recall-row-correct', r.ok);
        row.classList.toggle('recall-row-wrong', !r.ok);
      });

      const row = el('tr', { class: `recall-review-row ${r.ok ? 'recall-row-correct' : 'recall-row-wrong'}` }, [
        el('td', { class: 'recall-review-q' }, [r.card.q]),
        el('td', { class: 'recall-review-guess' }, [r.guess && r.guess.trim() ? r.guess : '(blank)']),
        el('td', { class: 'recall-review-answer' }, [r.card.a]),
        el('td', { class: 'recall-review-mark-cell' }, [markBtn])
      ]);

      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    const finishBtn = el('button', { class: 'btn btn-primary recall-finish-btn', type: 'button' }, ['Finish']);
    track(finishBtn, 'click', () => {
      if (finished || destroyed) return;
      finished = true;
      const correct = results.filter((r) => r.ok).length;
      const score = Math.round((100 * correct) / total);
      const cardResults = results.map((r) => ({ q: r.card.q, ok: r.ok }));
      onFinish({ score, detail: { correct, total, cardResults } });
    });

    const panel = el('div', { class: 'recall-panel recall-review-panel' }, [
      heading,
      el('div', { class: 'recall-review-table-wrap' }, [table]),
      el('div', { class: 'recall-review-actions' }, [finishBtn])
    ]);

    container.appendChild(panel);
  }

  function render() {
    if (destroyed) return;
    if (phase === 'test') renderTest();
    else renderReview();
  }

  render();

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    for (const off of renderCleanupFns) off();
    renderCleanupFns = [];
  }

  return cleanup;
}
