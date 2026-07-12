// Answer Invaders — canvas-based game.
// Contract: export default function mount(container, deck, onFinish) -> cleanup
import { shuffle, normalize, el, particleBurst } from '../util.js';

const N_LANES = 4;
const BASE_FALL_SPEED = 46; // px/sec at questionIndex 0
const SPEED_RAMP = 0.08; // per question index
const MAX_FALL_SPEED = 220; // cap so ship can always intercept
const INVADER_W = 150;
const INVADER_H = 56;
const SHIP_W = 54;
const SHIP_H = 28;
const SHIP_SPEED = 420; // px/sec
const BULLET_SPEED = 560; // px/sec
const BULLET_COOLDOWN = 0.28; // sec

export default function mount(container, deck, onFinish) {
  let finished = false;
  let destroyed = false;

  // ---- DOM scaffold ----
  container.classList.add('invaders-root');

  const hud = el('div', { className: 'invaders-hud' }, [
    el('div', { className: 'invaders-question', id: '' }),
    el('div', { className: 'invaders-stats' }, [
      el('span', { className: 'invaders-hits' }, ['Hits: 0']),
      el('span', { className: 'invaders-misses' }, ['Misses: 0']),
    ]),
  ]);
  const questionEl = hud.querySelector('.invaders-question');
  const hitsEl = hud.querySelector('.invaders-hits');
  const missesEl = hud.querySelector('.invaders-misses');

  const canvasWrap = el('div', { className: 'invaders-canvas-wrap' });
  const canvas = el('canvas', { className: 'invaders-canvas' });
  const flair = el('div', { className: 'invaders-flair hidden' });
  const flash = el('div', { className: 'invaders-flash hidden' });
  canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(flair);
  canvasWrap.appendChild(flash);

  container.appendChild(hud);
  container.appendChild(canvasWrap);

  const ctx = canvas.getContext('2d');

  // ---- game state ----
  const cards = shuffle(deck.cards);
  let questionIndex = 0;
  let hits = 0;
  let misses = 0;
  let hadMiss = false;
  const results = [];

  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  let ship = { x: 0, y: 0, vx: 0 };
  let bullets = []; // {x, y}
  let invaders = []; // {x, y, w, h, text, correct, alive, lane}
  let particles = []; // simple canvas particles (fallback if particleBurst is DOM-based)
  let bulletCooldown = 0;
  let waveActive = false;
  let paused = false;
  let gameEnded = false;

  const keys = { left: false, right: false, shoot: false };

  // touch/drag state
  let dragging = false;
  let dragLastX = 0;

  function currentCard() {
    return cards[questionIndex];
  }

  function pickDistractors(card) {
    const correctNorm = normalize(card.a);
    const others = cards.filter((c) => c !== card);
    const differentNorm = shuffle(others.filter((c) => normalize(c.a) !== correctNorm));
    const sameNorm = shuffle(others.filter((c) => normalize(c.a) === correctNorm));
    const pool = differentNorm.concat(sameNorm);
    const maxCandidates = Math.min(4, cards.length);
    const need = Math.max(0, maxCandidates - 1);
    const seen = new Set([correctNorm]);
    const distractors = [];
    for (const c of pool) {
      if (distractors.length >= need) break;
      const n = normalize(c.a);
      if (seen.has(n)) continue;
      seen.add(n);
      distractors.push(c.a);
    }
    // If still short (tiny deck with many duplicate answers), allow reuse of
    // duplicate-normalized answers before ever duplicating the correct one.
    if (distractors.length < need) {
      for (const c of pool) {
        if (distractors.length >= need) break;
        if (c.a === card.a) continue;
        if (distractors.includes(c.a)) continue;
        distractors.push(c.a);
      }
    }
    return distractors;
  }

  function layoutSize() {
    const rect = container.getBoundingClientRect();
    cssWidth = Math.max(240, rect.width || container.clientWidth || 480);
    cssHeight = Math.max(320, (rect.height || container.clientHeight || 640) - hud.offsetHeight);
    if (cssHeight < 240) cssHeight = 360;
  }

  function resizeCanvas() {
    layoutSize();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ship.y = cssHeight - SHIP_H - 16;
    if (ship.x === 0) ship.x = cssWidth / 2 - SHIP_W / 2;
    ship.x = Math.min(Math.max(0, ship.x), cssWidth - SHIP_W);
    // reposition existing invaders' lanes on resize
    repositionInvaderLanes();
  }

  function laneCenters() {
    const laneW = cssWidth / N_LANES;
    const centers = [];
    for (let i = 0; i < N_LANES; i++) centers.push(laneW * i + laneW / 2);
    return centers;
  }

  function repositionInvaderLanes() {
    if (!invaders.length) return;
    const centers = laneCenters();
    invaders.forEach((inv) => {
      const cx = centers[inv.lane] !== undefined ? centers[inv.lane] : cssWidth / 2;
      inv.x = cx - inv.w / 2;
    });
  }

  function wrapText(text, maxWidth) {
    ctx.font = '600 14px ' + getComputedFont();
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function getComputedFont() {
    return getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif';
  }

  function spawnWave() {
    const card = currentCard();
    if (!card) return;
    questionEl.textContent = card.q;

    const distractors = pickDistractors(card);
    const answerObjs = [{ text: card.a, correct: true }].concat(
      distractors.map((a) => ({ text: a, correct: false }))
    );
    const shuffled = shuffle(answerObjs);
    const lanesAvailable = shuffle([...Array(N_LANES).keys()]).slice(0, shuffled.length);
    lanesAvailable.sort((a, b) => a - b);

    const centers = laneCenters();
    const speed = Math.min(MAX_FALL_SPEED, BASE_FALL_SPEED * (1 + SPEED_RAMP * questionIndex));

    invaders = shuffled.map((obj, i) => {
      const lane = lanesAvailable[i];
      const w = Math.min(INVADER_W, cssWidth / N_LANES - 12);
      const cx = centers[lane];
      return {
        x: cx - w / 2,
        y: -INVADER_H - i * 40,
        w,
        h: INVADER_H,
        text: obj.text,
        correct: obj.correct,
        alive: true,
        lane,
        vy: speed,
      };
    });
    waveActive = true;
  }

  function nextQuestionOrEnd() {
    questionIndex++;
    if (questionIndex >= cards.length) {
      endGame(true);
      return;
    }
    spawnWave();
  }

  function showFlair(text, cls) {
    flair.textContent = text;
    flair.className = 'invaders-flair ' + cls;
    // force reflow to restart animation
    void flair.offsetWidth;
    flair.classList.add('show');
    window.setTimeout(() => {
      flair.classList.remove('show');
    }, 550);
  }

  function showFlash() {
    flash.classList.remove('hidden');
    flash.classList.add('show');
    window.setTimeout(() => {
      flash.classList.remove('show');
      flash.classList.add('hidden');
    }, 260);
  }

  function spawnExplosion(x, y, color) {
    // Canvas-local particle burst (self-contained, matches game's own render loop)
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 60 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        color: color || '#ffb454',
      });
    }
    // Also trigger shared DOM particle burst at viewport coords for consistency
    try {
      const rect = canvas.getBoundingClientRect();
      particleBurst(rect.left + x, rect.top + y, { color });
    } catch (e) {
      // particleBurst is optional visual flourish; ignore failures
    }
  }

  function updateHUD() {
    hitsEl.textContent = 'Hits: ' + hits;
    missesEl.textContent = 'Misses: ' + misses;
  }

  function fireBullet() {
    if (bulletCooldown > 0 || gameEnded) return;
    bullets.push({ x: ship.x + SHIP_W / 2, y: ship.y - 4 });
    bulletCooldown = BULLET_COOLDOWN;
  }

  function endGame(victory) {
    if (gameEnded) return;
    gameEnded = true;
    waveActive = false;
    if (victory) {
      drawVictoryOverlay();
    }
    window.setTimeout(() => {
      finish({
        score: hits * 100 - misses * 25,
        detail: { hits, misses, cardResults: results.slice() },
      });
    }, victory ? 900 : 0);
  }

  function drawVictoryOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(15,18,32,0.75)';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#37d67a';
    ctx.textAlign = 'center';
    ctx.font = '700 28px ' + getComputedFont();
    ctx.fillText('Victory!', cssWidth / 2, cssHeight / 2);
    ctx.restore();
  }

  function finish(result) {
    if (finished) return;
    finished = true;
    onFinish(result);
  }

  // ---- input handling ----
  function onKeyDown(e) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = true;
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = true;
        e.preventDefault();
        break;
      case 'Space':
      case 'ArrowUp':
        fireBullet();
        e.preventDefault();
        break;
    }
  }
  function onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        keys.left = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        keys.right = false;
        break;
    }
  }

  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return clientX - rect.left;
  }

  function onPointerDown(e) {
    dragging = true;
    dragLastX = pointerX(e);
    fireBullet();
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const x = pointerX(e);
    const dx = x - dragLastX;
    dragLastX = x;
    ship.x = Math.min(Math.max(0, ship.x + dx), cssWidth - SHIP_W);
  }
  function onPointerUp() {
    dragging = false;
  }

  function onVisibilityChange() {
    paused = document.hidden;
    if (!paused) {
      lastTime = performance.now();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  document.addEventListener('visibilitychange', onVisibilityChange);

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }

  // ---- main loop ----
  let rafId = null;
  let lastTime = performance.now();

  function update(dt) {
    // ship movement
    let dir = 0;
    if (keys.left) dir -= 1;
    if (keys.right) dir += 1;
    ship.x += dir * SHIP_SPEED * dt;
    ship.x = Math.min(Math.max(0, ship.x), cssWidth - SHIP_W);

    if (bulletCooldown > 0) bulletCooldown -= dt;

    // bullets
    bullets.forEach((b) => {
      b.y -= BULLET_SPEED * dt;
    });
    bullets = bullets.filter((b) => b.y > -20);

    // invaders falling
    if (waveActive) {
      invaders.forEach((inv) => {
        if (!inv.alive) return;
        inv.y += inv.vy * dt;
      });

      // collision: bullets vs invaders
      for (const inv of invaders) {
        if (!inv.alive) continue;
        for (const b of bullets) {
          if (
            b.x >= inv.x &&
            b.x <= inv.x + inv.w &&
            b.y >= inv.y &&
            b.y <= inv.y + inv.h
          ) {
            inv.alive = false;
            b.hit = true;
            const cx = inv.x + inv.w / 2;
            const cy = inv.y + inv.h / 2;
            if (inv.correct) {
              hits++;
              updateHUD();
              spawnExplosion(cx, cy, '#37d67a');
              showFlair('Correct!', 'invaders-flair-correct');
              waveActive = false;
              results.push({ q: currentCard().q, ok: !hadMiss });
              hadMiss = false;
              window.setTimeout(() => {
                if (!gameEnded) nextQuestionOrEnd();
              }, 450);
            } else {
              misses++;
              hadMiss = true;
              updateHUD();
              spawnExplosion(cx, cy, '#ff5470');
              showFlash();
            }
          }
        }
      }
      bullets = bullets.filter((b) => !b.hit);

      // check invaders reaching bottom
      for (const inv of invaders) {
        if (!inv.alive) continue;
        if (inv.y + inv.h >= ship.y) {
          if (inv.correct) {
            inv.alive = false;
            waveActive = false;
            results.push({ q: currentCard().q, ok: false });
            endGame(false);
            break;
          } else {
            inv.alive = false; // despawn wrong invader
          }
        }
      }

      invaders = invaders.filter((inv) => inv.alive);
    }

    // particles
    particles.forEach((p) => {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt; // gravity-ish
    });
    particles = particles.filter((p) => p.age < p.life);
  }

  function draw() {
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // background subtle grid
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let x = 0; x < cssWidth; x += 40) {
      ctx.fillRect(x, 0, 1, cssHeight);
    }
    ctx.restore();

    // invaders
    invaders.forEach((inv) => {
      if (!inv.alive) return;
      drawInvader(inv);
    });

    // bullets
    ctx.fillStyle = '#e8ebff';
    bullets.forEach((b) => {
      ctx.fillRect(b.x - 2, b.y - 10, 4, 10);
    });

    // ship
    drawShip();

    // particles
    particles.forEach((p) => {
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawInvader(inv) {
    const r = 10;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, inv.x, inv.y, inv.w, inv.h, r);
    ctx.fillStyle = '#252c4a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6c8cff';
    ctx.stroke();

    ctx.fillStyle = '#e8ebff';
    ctx.font = '600 14px ' + getComputedFont();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(inv.text, inv.w - 16);
    const lineHeight = 16;
    const startY = inv.y + inv.h / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, inv.x + inv.w / 2, startY + i * lineHeight);
    });
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawShip() {
    ctx.save();
    ctx.fillStyle = '#9b6cff';
    ctx.beginPath();
    ctx.moveTo(ship.x + SHIP_W / 2, ship.y);
    ctx.lineTo(ship.x + SHIP_W, ship.y + SHIP_H);
    ctx.lineTo(ship.x, ship.y + SHIP_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);
    if (paused || gameEnded) {
      lastTime = now;
      return;
    }
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    dt = Math.min(dt, 0.05); // clamp to avoid huge jumps after pause/tab-switch
    update(dt);
    draw();
  }

  // ---- init ----
  resizeCanvas();
  spawnWave();
  updateHUD();
  rafId = requestAnimationFrame(frame);

  // ---- cleanup ----
  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    if (rafId != null) cancelAnimationFrame(rafId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', resizeCanvas);
    }
  }

  return cleanup;
}
