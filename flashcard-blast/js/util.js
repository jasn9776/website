// Shared pure helpers: dom, shuffle, hashing, string normalization/matching, timer, particles.
// No imports — leaf module.

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null) continue;
    if (key === "class" || key === "className") {
      node.className = value;
    } else if (key === "dataset") {
      for (const [dk, dv] of Object.entries(value)) node.dataset[dk] = dv;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (value === true) {
      node.setAttribute(key, "");
    } else if (value === false) {
      // skip
    } else {
      node.setAttribute(key, value);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const child of kids) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalize(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents/combining marks
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function fuzzyMatch(guess, answer) {
  if (!guess || !String(guess).trim()) {
    return { ok: false, ratio: 0 };
  }
  const ng = normalize(guess);
  const na = normalize(answer);
  if (ng === na) {
    return { ok: true, ratio: 1 };
  }
  const maxLen = Math.max(ng.length, na.length);
  const ratio = maxLen === 0 ? 1 : 1 - levenshtein(ng, na) / maxLen;
  return { ok: ratio >= 0.85, ratio };
}

export function stripHtml(html) {
  const node = document.createElement("div");
  node.innerHTML = html == null ? "" : String(html);
  const text = node.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

export function createTimer() {
  let startedAt = null;
  let elapsedMs = 0;
  let running = false;

  return {
    start() {
      if (running) return;
      startedAt = Date.now();
      running = true;
    },
    stop() {
      if (running) {
        elapsedMs += Date.now() - startedAt;
        running = false;
      }
      return elapsedMs;
    },
    elapsed() {
      if (running) {
        return elapsedMs + (Date.now() - startedAt);
      }
      return elapsedMs;
    },
  };
}

const DEFAULT_PARTICLE_COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--correct)",
  "var(--warn)",
];

export function particleBurst(x, y, opts = {}) {
  const colors = opts.colors && opts.colors.length
    ? opts.colors
    : opts.color
      ? [opts.color]
      : DEFAULT_PARTICLE_COLORS;
  const count = opts.count || 20;
  const frag = document.createDocumentFragment();
  const particles = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 70;
    const px = Math.cos(angle) * dist;
    const py = Math.sin(angle) * dist;
    const size = 4 + Math.random() * 6;
    const color = colors[i % colors.length];

    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.background = color;
    p.style.setProperty("--px", `${px}px`);
    p.style.setProperty("--py", `${py}px`);

    frag.appendChild(p);
    particles.push(p);
  }

  document.body.appendChild(frag);

  window.setTimeout(() => {
    for (const p of particles) {
      p.remove();
    }
  }, 1000);
}
