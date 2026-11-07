const CHAINS = { tezos: 'Tezos', ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin' };
const CHAIN_ORDER = ['tezos', 'ethereum', 'solana', 'bitcoin'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n, l = 2) => String(n).padStart(l, '0');
const short = (a) => (a && a.length > 16 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
const day = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const edition = (w) => (w.editions === 1 ? '1 of 1' : w.editions ? `Edition of ${w.editions}` : '—');
const by = (w) => w.artist || w.collection || 'Unknown';
const link = (w) => `#/work/${encodeURIComponent(w.id)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

const PAGE_TITLES = { museum: 'The Museum', further: 'Further works', text: '', watchlist: 'Watch List' };
const state = { page: null };
let data, works, museum, rest, order, further, spot;

// ── media ────────────────────────────────────────────

// sizes: how wide the image is shown, so the browser can pick the 720px thumb
// or the full 1600px file. A blurred 20px stand-in sits underneath until it loads.
function mediaEl(w, { eager = false, sizes = '(max-width: 720px) 50vw, 25vw' } = {}) {
  const cls = w.pixelated ? ' class="pixelated"' : '';
  const lqip = w.media.lqip ? `<img class="lqip" src="${esc(w.media.lqip)}" alt="" aria-hidden="true">` : '';
  if (w.motion?.src) {
    return `${lqip}<video${cls} src="${esc(w.motion.src)}" poster="${esc(w.media.thumb || w.media.src)}" muted loop playsinline preload="none" data-autoplay aria-label="${esc(w.title)}"></video>`;
  }
  const size = w.media.w && w.media.h ? ` width="${w.media.w}" height="${w.media.h}"` : '';
  const srcset = w.media.thumb ? ` srcset="${esc(w.media.thumb)} 720w, ${esc(w.media.src)} ${w.media.w || 1600}w" sizes="${sizes}"` : '';
  return `${lqip}<img${cls} src="${esc(w.media.src)}"${srcset} alt="${esc(w.title)}"${size} loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
  }
}, { rootMargin: '160px' });

function reveal(root = document) {
  for (const el of $$('.plate img:not(.ready):not(.lqip), .frame img:not(.ready):not(.lqip), .work > img:not(.ready):not(.lqip), .plate video:not(.ready), .frame video:not(.ready), .work > video:not(.ready)', root)) {
    const done = () => el.classList.add('ready');
    if (el.tagName === 'IMG') { el.complete && el.naturalWidth ? done() : (el.onload = done, el.onerror = done); }
    else done();
  }
  for (const v of $$('video[data-autoplay]', root)) io.observe(v);
}

function card(w) {
  return `<a class="card" href="${link(w)}" data-id="${esc(w.id)}">
    <div class="plate">${mediaEl(w)}</div>
    <div class="cap">
      <div class="cap-title">${esc(w.title)}</div>
      <div class="cap-meta">${esc(by(w))}</div>
    </div>
  </a>`;
}

// ── the museum ───────────────────────────────────────
// One wall, every work except the Further works: first those placed in
// curation.json → museum, in that order, then the rest, newest first. Works are
// tiled edge to edge in rows; each keeps its proportions, and its size (small,
// medium, large, xl) sets how tall its row hangs. Title and artist show on
// hover; a click opens the details.
const SIZES = { small: 0.75, medium: 1, large: 1.8, xl: 2.6 };
const walls = [];

// one tile per work, kept for the life of the page: when edit mode re-hangs the
// wall the same tiles are only moved, so no image or video loads twice
const tiles = new Map();
const tileSizes = (size) => (size === 'medium' || size === 'small' ? '(max-width: 720px) 50vw, 26vw' : '(max-width: 720px) 100vw, 60vw');

function tile(w, i) {
  const size = SIZES[w.museum?.size] ? w.museum.size : 'medium';
  let a = tiles.get(w.id);
  if (!a) {
    const ar = w.media.w && w.media.h ? (w.media.w / w.media.h).toFixed(4) : 1;
    const holder = document.createElement('div');
    holder.innerHTML = `<a class="work" href="${link(w)}" data-ar="${ar}" aria-label="${esc(w.title)} by ${esc(by(w))}">
      ${mediaEl(w, { eager: i < 6, sizes: tileSizes(size) })}
      <span class="cap"><span class="cap-title">${esc(w.title)}</span><span class="cap-meta">${esc(by(w))}</span></span>
    </a>`;
    a = holder.firstElementChild;
    // set via the CSSOM: the Content-Security-Policy forbids inline style attributes
    a.style.setProperty('--ar', ar);
    tiles.set(w.id, a);
  } else if (a.dataset.size !== size) {
    a.querySelector('img[srcset]')?.setAttribute('sizes', tileSizes(size));
  }
  a.dataset.size = size;
  a.toggleAttribute('data-new-row', !!w.museum?.newRow);
  return a;
}

function hangWall(el, list) {
  let wall = walls.find((x) => x.el === el);
  if (!wall) {
    wall = { el };
    walls.push(wall);
    new ResizeObserver(() => requestAnimationFrame(() => layoutWall(wall))).observe(el);
  }
  wall.items = list.map(tile);
  wall.width = 0;
  layoutWall(wall);
  reveal(el);
}

// edit mode (scripts/editor.mjs) calls this after moving or resizing works
export function rehang(main, off) {
  order = main;
  further = off;
  hangWall($('[data-wall]'), order);
  hangWall($('[data-wall-further]'), further);
  $('[data-further-link]').hidden = !further.length;
}

function renderMuseum() {
  hangWall($('[data-wall]'), order);
  $('[data-further-link]').hidden = !further.length;

  hangWall($('[data-wall-further]'), further);
}

// Rows are built per run of works with the same size (a work marked newRow in
// curation.json starts a new run). A run is split into as many rows as fill the
// width at that size's height, with the works shared out so each row is about
// equally full; flex-grow = aspect ratio then makes every work in a row exactly
// the same height, with no gaps.
function layoutWall(wall) {
  const W = wall.el.clientWidth;
  if (!W || W === wall.width) return; // hidden, or nothing changed
  wall.width = W;
  const gap = parseFloat(getComputedStyle(wall.el).rowGap) || 0;
  const H = W < 720 ? W / 2.4 : Math.min(320, W / 4.8);
  const tallest = innerHeight * 0.86;

  const runs = [];
  for (const el of wall.items) {
    const run = runs.at(-1);
    if (run && run.size === el.dataset.size && run.size !== 'xl' && !('newRow' in el.dataset)) run.items.push(el);
    else runs.push({ size: el.dataset.size, items: [el] }); // an xl work always hangs alone
  }

  const rows = [];
  for (const { size, items } of runs) {
    const target = H * SIZES[size];
    const ars = items.map((el) => Number(el.dataset.ar));
    const total = ars.reduce((a, b) => a + b, 0);
    const k = Math.max(1, Math.min(items.length, Math.round((total * target + gap * (items.length - 1)) / W)));
    let acc = 0, row = [], cut = 1;
    items.forEach((el, j) => {
      row.push(el);
      acc += ars[j];
      // close the row where the running total comes closest to its share
      const goal = (total * cut) / k;
      if (cut < k && j + 1 < items.length && Math.abs(acc - goal) <= Math.abs(acc + ars[j + 1] - goal)) { rows.push({ size, target, items: row }); row = []; cut++; }
    });
    if (row.length) rows.push({ size, target, items: row });
  }

  // the first row fits on the first screen, below the title
  const firstRoom = innerHeight - (wall.el.getBoundingClientRect().top + scrollY) - 20;

  wall.el.replaceChildren(...rows.map(({ size, target, items }, i) => {
    const div = document.createElement('div');
    div.className = 'row';
    div.append(...items);
    const sum = items.reduce((a, el) => a + Number(el.dataset.ar), 0);
    const gaps = gap * (items.length - 1);
    let cap = Math.min(tallest, size === 'xl' || W < 720 ? tallest : target * 1.35); // on a phone every row fills the width
    if (i === 0 && W >= 720 && firstRoom > 200) cap = Math.min(cap, firstRoom);
    if ((W - gaps) / sum > cap) div.style.maxWidth = `${Math.round(cap * sum + gaps)}px`; // too few works to fill it: hang centred
    return div;
  }));
}

// ── artist of the week ───────────────────────────────
// from Mother Flame's "Artist of the Month" list, newest first (data/spotlight.json)

const weekLink = (p) => `#/artist-of-the-month/${p.no}`;
const sameName = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const collected = (p) => works.filter((w) => sameName(by(w), p.name) || sameName(by(w), p.handle));
const weekLine = (p) => [`No. ${pad(p.no)}`, p.date && day(p.date)].filter(Boolean).join(' · ');

// the pick's own image, or else a work of theirs from the collection
function pickImage(p) {
  if (p.image) return p.image;
  const w = collected(p)[0];
  return w && { src: w.media.src, thumb: w.media.thumb, w: w.media.w, h: w.media.h, pixelated: w.pixelated };
}

function pickImg(p, { sizes = '(max-width: 720px) 50vw, 25vw', eager = false } = {}) {
  const im = pickImage(p);
  if (!im) return '';
  const size = im.w && im.h ? ` width="${im.w}" height="${im.h}"` : '';
  const srcset = im.thumb ? ` srcset="${esc(im.thumb)} 720w, ${esc(im.src)} ${im.w || 1600}w" sizes="${sizes}"` : '';
  return `<img${im.pixelated ? ' class="pixelated"' : ''} src="${esc(im.src)}"${srcset} alt="Work by ${esc(p.name)}"${size} loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

function renderWeek(no) {
  const p = spot.weeks.find((x) => x.no === no) || spot.weeks[0];
  $('[data-week]').hidden = !p; // without a pick it shows only when its link is followed
  $('[data-week-sub]').innerHTML = `Send me your work on X: <a class="quiet" href="https://x.com/${esc(data.profile.x)}" target="_blank" rel="noopener">@${esc(data.profile.x)} ↗</a>`;
  if (!p) {
    $('[data-pick]').innerHTML = '<p class="quiet">The first pick is coming soon.</p>';
    $('[data-week-past-block]').hidden = true;
    return;
  }
  const mine = collected(p);
  const im = pickImage(p);
  const ar = im?.w && im?.h ? (im.w / im.h).toFixed(4) : 1;
  const open = p.workId ? `href="${link({ id: p.workId })}"` : p.work ? `href="${esc(p.work)}" target="_blank" rel="noopener noreferrer"` : '';
  const facts = [
    p.x && ['On X', `<a href="${esc(p.x)}" target="_blank" rel="noopener noreferrer">@${esc(p.handle)} ↗</a>`],
    ['I own', mine.length ? plural(mine.length, 'work') : 'Nothing yet'],
    p.date && ['Picked', day(p.date)],
  ].filter(Boolean);
  $('[data-pick]').innerHTML = `
    ${im ? `<a class="frame pick-frame" ${open || `href="${weekLink(p)}"`} data-ar="${ar}">${pickImg(p, { sizes: '(max-width: 860px) 100vw, 55vw' })}</a>` : '<div></div>'}
    <div class="pick-info">
      <span class="sheet-chain">${esc(weekLine(p))}</span>
      <h3 class="pick-name">${esc(p.name)}</h3>
      ${p.tagline ? `<p class="pick-tag">${esc(p.tagline)}</p>` : ''}
      ${p.note ? `<p class="pick-note">${esc(p.note)}</p>` : ''}
      <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${p.watch?.length ? `<div class="to-watch"><span class="quiet">Also worth a look</span><ol>${p.watch.map((w) =>
        `<li>${w.href ? `<a href="${esc(w.href)}" target="_blank" rel="noopener noreferrer">${esc(w.name)} ↗</a>` : esc(w.name)}</li>`).join('')}</ol></div>` : ''}
      <div class="links">${(p.links || []).map(([label, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div>
    </div>`;
  $$('[data-ar]', $('[data-pick]')).forEach((el) => el.style.setProperty('--ar', el.dataset.ar));

  const past = spot.weeks.filter((x) => x !== p);
  $('[data-week-past-block]').hidden = !past.length;
  $('[data-week-past-title]').textContent = p === spot.weeks[0] ? 'Earlier picks' : 'Other picks';
  $('[data-week-count]').textContent = spot.weeks.length;
  $('[data-week-past]').innerHTML = past.map((x) => `<a class="card" href="${weekLink(x)}">
    <div class="plate">${pickImg(x)}</div>
    <div class="cap">
      <div class="cap-title">${esc(x.name)}</div>
      <div class="cap-meta">${esc(weekLine(x))}</div>
    </div>
  </a>`).join('');
  reveal($('[data-week]'));
}

// ── the links under the title, and Levin's texts ─────
// Each appears only once there's something behind it.

function renderHeroLinks() {
  $('[data-hero-links]').innerHTML = [['#/philosophy', 'Philosophy'], ['#/artist-of-the-month', 'Artist of the Month']]
    .map(([href, label]) => `<a href="${href}">${label} <span class="arrow">→</span></a>`).join('');
}

function renderText(t) {
  PAGE_TITLES.text = t.title;
  $('[data-text-title]').textContent = t.title;
  $('[data-text-body]').innerHTML = t.blocks.length
    ? t.blocks.map((b) => (b.h ? `<h2>${esc(b.h)}</h2>` : `<p>${esc(b.p)}</p>`)).join('')
    : '<p class="quiet">Coming soon.</p>';
  document.title = `${data.profile.name} — ${t.title}`;
}

// ── posts from X ─────────────────────────────────────
// chosen in Mother Flame's "Museum Posts" list; the text is copied at build
// time, so no script or tracker from X runs here

function renderPosts() {
  const posts = spot.posts || [];
  $('[data-posts]').hidden = !posts.length;
  const text = (p) => p.parts.map(([t, href]) => href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : esc(t)).join('');
  $('[data-posts-list]').innerHTML = posts.map((p, i) => `<figure class="post${i ? '' : ' lead'}">
    <blockquote class="post-text">${text(p)}</blockquote>
    <figcaption class="post-meta"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${sameName(p.handle, data.profile.x) ? '' : `@${esc(p.handle)} · `}${esc(day(p.date))} ↗</a></figcaption>
  </figure>`).join('');
  $('[data-posts-list]').classList.toggle('single', posts.length === 1);
}

// ── shared ───────────────────────────────────────────

function renderAbout() {
  const p = data.profile;
  $$('[data-name]').forEach((el) => (el.textContent = p.name));
  $('[data-statement]').textContent = p.statement;
  $('[data-bio]').textContent = p.bio || '';
  $('[data-bio]').hidden = !p.bio;
  $$('[data-x]').forEach((a) => { a.href = `https://x.com/${p.x}`; if (a.textContent.startsWith('@')) a.textContent = `@${p.x} ↗`; });
  $('[data-wallets]').innerHTML = CHAIN_ORDER.filter((c) => data.wallets[c]).map((c) =>
    `<dt>${CHAINS[c]}</dt><dd><code title="${esc(data.wallets[c])}">${esc(short(data.wallets[c]))}</code><button type="button" data-copy="${esc(data.wallets[c])}">Copy</button></dd>`).join('');
}

function showPage(page) {
  if (state.page === page) return;
  state.page = page;
  for (const el of $$('[data-page]')) el.hidden = el.dataset.page !== page;
  walls.forEach(layoutWall); // a wall on a page that was hidden has no width until now
  document.title = `${data.profile.name} — ${PAGE_TITLES[page]}`;
  window.scrollTo({ top: 0 });
}

// ── the watch list (private) ─────────────────────────
// data/watchlist.json is AES-GCM ciphertext: nothing readable is ever published,
// so skipping the form gets you nowhere. The password never leaves the browser.
// "Remember" keeps only the derived key, stored non-extractable in IndexedDB:
// this device can use it, but nobody can read it back out as a password.

let watchOpened = false;
let failures = 0;
let envelope = null;
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const getEnvelope = async () => (envelope ||= await (await fetch('data/watchlist.json', { cache: 'no-cache' })).json());

async function deriveKey(pw) {
  const env = await getEnvelope();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(env.salt), iterations: env.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

async function decryptWith(key) {
  const env = await getEnvelope();
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data))));
}

function keyStore(mode, op) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('museum', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode);
      const req = op(tx.objectStore('keys'));
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
const saveKey = (k) => keyStore('readwrite', (s) => s.put(k, 'watchlist')).catch(() => {});
const loadKey = () => keyStore('readonly', (s) => s.get('watchlist')).catch(() => null);
const forgetKey = () => keyStore('readwrite', (s) => s.delete('watchlist')).catch(() => {});

function renderWatchlist(list) {
  const grid = $('[data-watch-grid]');
  grid.innerHTML = list.items.map((w) => {
    const href = w.url || w.links?.[0];
    const tag = href ? `a href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : 'div';
    const img = w.image ? `<img src="${esc(w.image.src)}" alt="${esc(w.title)}" width="${w.image.w}" height="${w.image.h}" decoding="async">` : '';
    const meta = [w.artist, w.detail, w.venue].filter(Boolean).join(', ');
    return `<${tag} class="card">
      <div class="plate">${w.chain ? `<span class="badge">${CHAINS[w.chain]}</span>` : ''}${img}</div>
      <div class="cap">
        <div class="cap-title">${esc(w.title)}${href ? ' ↗' : ''}</div>
        <div class="cap-meta">${esc(meta)}</div>
        ${w.note ? `<div class="cap-note">${esc(w.note)}</div>` : ''}
      </div>
    </${tag.split(' ')[0]}>`;
  }).join('');
  $('[data-watch-sub]').textContent = `Private. ${plural(list.items.length, 'work')} I'm watching, from Mother Flame.`;
  $('[data-watch-foot]').innerHTML = `Updated ${esc(day(list.updated))}. <button type="button" data-forget>Lock and forget this device</button>`;
  $('[data-lock]').hidden = true;
  grid.hidden = $('[data-watch-foot]').hidden = false;
  reveal(grid);
}

function lockWatchlist() {
  $('[data-watch-grid]').innerHTML = '';
  $('[data-watch-grid]').hidden = $('[data-watch-foot]').hidden = true;
  $('[data-watch-sub]').textContent = 'Private.';
  $('[data-lock]').hidden = false;
}

async function unlock(pw, remember) {
  const err = $('[data-lock-error]');
  const go = $('.lock-go');
  err.hidden = true;
  go.disabled = true;
  // each wrong guess makes the next one wait longer (1, 2, 4, 8 s)
  if (failures) await sleep(Math.min(1000 * 2 ** (failures - 1), 8000));
  try {
    const key = await deriveKey(pw);
    const list = await decryptWith(key);
    failures = 0;
    $('[data-lock-input]').value = '';
    renderWatchlist(list);
    remember ? saveKey(key) : forgetKey();
  } catch {
    failures++;
    err.hidden = false;
  } finally {
    go.disabled = false;
  }
}

async function openWatchlist() {
  if (watchOpened) return;
  watchOpened = true;
  try { localStorage.removeItem('museum.watchlist'); } catch {} // older versions kept the password itself
  const key = await loadKey();
  if (key) {
    try { return renderWatchlist(await decryptWith(key)); } catch { forgetKey(); }
  }
  $('[data-lock-input]').focus({ preventScroll: true });
}

$('[data-lock]').addEventListener('submit', (e) => {
  e.preventDefault();
  unlock($('[data-lock-input]').value, $('[data-lock-remember]').checked);
});

// ── detail sheet ─────────────────────────────────────
// ← → walk through every work in page order

const sheet = $('[data-sheet]');
let current = null;
let lastFocus = null;

// the works the arrows step through: the main wall, or the Further works
const sequence = () => (current?.further ? further : order);

function openSheet(w) {
  if (!sheet.hidden && current?.id === w.id) return;
  if (sheet.hidden) lastFocus = document.activeElement;
  current = w;
  const seq = sequence();
  const pos = seq.indexOf(w);
  $('[data-sheet-count]').textContent = `${pad(pos + 1, 2)} / ${pad(seq.length, 2)}`;
  $('[data-prev]').hidden = $('[data-next]').hidden = seq.length < 2;

  $('[data-sheet-media]').innerHTML = w.motion?.src
    ? `<video${w.pixelated ? ' class="pixelated"' : ''} src="${esc(w.motion.src)}" poster="${esc(w.media.src)}" muted loop playsinline autoplay></video>`
    : `<img${w.pixelated ? ' class="pixelated"' : ''} src="${esc(w.media.src)}" alt="${esc(w.title)}">`;

  const facts = [
    w.collection && ['Collection', esc(w.collection)],
    ['Edition', edition(w)],
    ['Acquired', day(w.acquired)],
    w.minted && ['Minted', day(w.minted)],
    w.contract && ['Contract', `<button type="button" data-copy="${esc(w.contract)}" title="Copy">${esc(short(w.contract))}</button>`],
    w.tokenId && ['Token', `<button type="button" data-copy="${esc(w.tokenId)}" title="Copy">${esc(short(String(w.tokenId)))}</button>`],
  ].filter(Boolean);

  const desc = (w.description || '').trim();
  const links = [...(w.links || [])];
  if (w.interactive) links.unshift(['Open live work', w.interactive.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/')]);

  $('[data-sheet-info]').innerHTML = `
    <span class="sheet-chain">${CHAINS[w.chain]}</span>
    <h2 class="sheet-title" id="sheet-title">${esc(w.title)}</h2>
    <p class="sheet-artist">${esc(by(w))}</p>
    ${w.museum?.note ? `<p class="desc desc-ink">${esc(w.museum.note)}</p>` : ''}
    <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${desc ? `<p class="desc${desc.length > 420 ? ' clamped' : ''}">${esc(desc)}</p>${desc.length > 420 ? '<button type="button" class="desc-more" data-more>Read more</button>' : ''}` : ''}
    <div class="links">${links.map(([label, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}</div>`;

  sheet.hidden = false;
  document.body.classList.add('locked');
  document.title = `${w.title} — ${data.profile.name}`;
  $('[data-close]').focus({ preventScroll: true });
}

function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  $('[data-sheet-media]').innerHTML = '';
  document.body.classList.remove('locked');
  document.title = `${data.profile.name} — ${PAGE_TITLES[state.page]}`;
  current = null;
  lastFocus?.focus?.({ preventScroll: true });
}

function leaveSheet() {
  history.pushState(null, '', current?.further ? '#/further' : '#/');
  closeSheet();
}

function step(d) {
  const seq = sequence();
  const next = seq[(seq.indexOf(current) + d + seq.length) % seq.length];
  history.replaceState(null, '', link(next));
  openSheet(next);
}

// Old links (#/vault, #/walk, #/artist/…) land on the Museum.
function route() {
  const h = location.hash;
  const m = h.match(/^#\/work\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const w = works.find((x) => x.id === id);
    if (w) {
      showPage(w.further ? 'further' : 'museum');
      return openSheet(w);
    }
  }
  closeSheet();
  if (h === '#/watchlist') { showPage('watchlist'); openWatchlist(); }
  else if (h === '#/further') showPage('further');
  else if (h === '#/philosophy') {
    const was = state.page === 'text';
    renderText(spot.texts.find((t) => t.slug === 'philosophy') || { title: 'Philosophy', blocks: [] });
    showPage('text');
    if (was) window.scrollTo({ top: 0 });
  }
  else if (/^#\/artist-of-the-(month|week)(\/\d+)?$/.test(h)) {
    showPage('museum');
    renderWeek(Number(h.split('/')[2]) || null);
    $('[data-week]').hidden = false; // with no pick yet it says so
    requestAnimationFrame(() => $('#week').scrollIntoView({ behavior: 'smooth' }));
  }
  else if (h.startsWith('#/') || h === '' || h === '#') showPage('museum');
  else if (!state.page) showPage('museum'); // plain anchors like #about keep the current page
}

// ── events ───────────────────────────────────────────

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 1900);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.copy) {
    e.preventDefault();
    navigator.clipboard?.writeText(t.dataset.copy).then(() => toast('Copied'), () => toast(t.dataset.copy));
  }
  else if (t.hasAttribute('data-more')) { $('.sheet .desc.clamped')?.classList.remove('clamped'); t.remove(); }
  else if (t.hasAttribute('data-close')) leaveSheet();
  else if (t.hasAttribute('data-prev')) step(-1);
  else if (t.hasAttribute('data-next')) step(1);
  else if (t.hasAttribute('data-forget')) { forgetKey(); lockWatchlist(); toast('Locked'); }
  else if (t.hasAttribute('data-top')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (t.hasAttribute('data-about-link')) { e.preventDefault(); $('#about').scrollIntoView({ behavior: 'smooth' }); }
});

document.addEventListener('keydown', (e) => {
  if (sheet.hidden) return;
  if (e.key === 'Escape') leaveSheet();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

window.addEventListener('hashchange', route);

// ── boot ─────────────────────────────────────────────

data = await (await fetch('data/collection.json', { cache: 'no-cache' })).json();
works = data.works;
further = works.filter((w) => w.further);
museum = works.filter((w) => w.museum && !w.further).sort((a, b) => a.museum.rank - b.museum.rank);
rest = works.filter((w) => !w.museum && !w.further); // newest first
order = [...museum, ...rest];

spot = await fetch('data/spotlight.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null);
spot = { weeks: spot?.weeks || [], posts: spot?.posts || [], texts: spot?.texts || [] };

renderAbout();
renderPosts();
renderMuseum();
renderWeek(null);
renderHeroLinks();
reveal();
route();

export { works, order, further };

// edit mode: only when the page is served by scripts/editor.mjs on this Mac
if (new URLSearchParams(location.search).has('edit') && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  import('/editor/edit.js').catch(() => {});
}
