const CHAINS = { tezos: 'Tezos', ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin', physical: 'Physical work' };
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

const PAGE_TITLES = { museum: 'The Museum', further: 'Further works', text: '', watchlist: 'Watch List', artist: '' };
const state = { page: null };
let data, works, museum, arrivals, order, further, spot;

// ── media ────────────────────────────────────────────

// sizes: how wide the image is shown, so the browser can pick the 720px thumb
// or the full 1600px file. A blurred 20px stand-in sits underneath until it loads.
function mediaEl(w, { eager = false, first = false, sizes = '(max-width: 720px) 50vw, 25vw' } = {}) {
  const cls = w.pixelated ? ' class="pixelated"' : '';
  const lqip = w.media.lqip ? `<img class="lqip" src="${esc(w.media.lqip)}" alt="" aria-hidden="true">` : '';
  if (w.motion?.src) {
    return `${lqip}<video${cls} src="${esc(w.motion.src)}" poster="${esc(w.media.thumb || w.media.src)}" muted loop playsinline preload="none" data-autoplay aria-label="${esc(w.title)}"></video>`;
  }
  const size = w.media.w && w.media.h ? ` width="${w.media.w}" height="${w.media.h}"` : '';
  const srcset = w.media.thumb ? ` srcset="${esc(w.media.thumb)} 720w, ${esc(w.media.src)} ${w.media.w || 1600}w" sizes="${sizes}"` : '';
  return `${lqip}<img${cls} src="${esc(w.media.src)}"${srcset} alt="${esc(w.title)}"${size} loading="${eager ? 'eager' : 'lazy'}"${first ? ' fetchpriority="high"' : ''} decoding="async">`;
}

// moving works play only while on screen, and not at all for people who have
// asked their device for less motion (they see the still)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting && !reduceMotion) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
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
// One wall: the works placed in curation.json → museum, in that order (new
// arrivals wait for edit mode; the Further works have their own page), with
// optional room titles between groups. Works are tiled edge to edge in rows; each keeps its proportions, and its size (small,
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
      ${mediaEl(w, { eager: i < 6, first: i < 2, sizes: tileSizes(size) })}
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
  if (w.museum?.room) a.dataset.room = w.museum.room; else delete a.dataset.room;
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
    if (run && run.size === el.dataset.size && run.size !== 'xl' && !('newRow' in el.dataset) && !el.dataset.room) run.items.push(el);
    else runs.push({ size: el.dataset.size, room: el.dataset.room || '', items: [el] }); // an xl work always hangs alone
  }

  const rows = [];
  for (const { size, room, items } of runs) {
    const first = rows.length;
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
    if (room) rows[first].room = room; // a room's title hangs above its first row
  }

  // the first row fits on the first screen, below the title
  const firstRoom = innerHeight - (wall.el.getBoundingClientRect().top + scrollY) - 20;

  wall.el.replaceChildren(...rows.flatMap(({ size, target, items, room }, i) => {
    const div = document.createElement('div');
    div.className = 'row';
    div.append(...items);
    const sum = items.reduce((a, el) => a + Number(el.dataset.ar), 0);
    const gaps = gap * (items.length - 1);
    let cap = Math.min(tallest, size === 'xl' || W < 720 ? tallest : target * 1.35); // on a phone every row fills the width
    if (i === 0 && W >= 720 && firstRoom > 200) cap = Math.min(cap, firstRoom);
    if ((W - gaps) / sum > cap) div.style.maxWidth = `${Math.round(cap * sum + gaps)}px`; // too few works to fill it: hang centred
    if (!room) return [div];
    const h = Object.assign(document.createElement('h2'), { className: 'room', textContent: room });
    return [h, div];
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
    ['I own', mine.length && order.includes(mine[0]) ? `<a href="${artistLink(by(mine[0]))}">${plural(mine.length, 'work')}</a>` : mine.length ? plural(mine.length, 'work') : 'Nothing yet'],
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
// Artist of the Month is in the bar at the top, so only once on the screen.

function renderHeroLinks() {
  $('[data-hero-links]').innerHTML = [['#/philosophy', 'Philosophy']]
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

// ── artist pages ─────────────────────────────────────
// #/artist/<name>: everything by one artist on the wall, linked from a work's
// details and from Artist of the Month

let artistName = null;
let artistWorks = [];
const artistLink = (name) => `#/artist/${encodeURIComponent(name)}`;

function renderArtist(name) {
  artistName = name;
  artistWorks = order.filter((w) => sameName(by(w), name));
  PAGE_TITLES.artist = name;
  $('[data-artist-title]').textContent = name;
  $('[data-artist-count]').textContent = plural(artistWorks.length, 'work') + ' in the collection';
  $('[data-artist-grid]').innerHTML = artistWorks.map(card).join('');
  reveal($('[data-artist-grid]'));
}

// ── close-up ─────────────────────────────────────────
// Click or tap a work in its details to see it on its own, fitted to the
// screen. Pinch, scroll or double-tap to zoom (pixel art stays crisp), drag to
// look around. ×, Esc, the back button, or a tap while it's fitted close it.

let zoom = null;
const coarse = matchMedia('(pointer: coarse)').matches;

// the how-to line shows on the first close-up only (remembered in this browser)
function seenHint() {
  try {
    if (localStorage.getItem('museum.hint')) return true;
    localStorage.setItem('museum.hint', '1');
  } catch {}
  return false;
}

function openZoom(w) {
  closeZoom(true);
  const nw = w.media.w || 1600, nh = w.media.h || 1600;
  const el = document.createElement('div');
  el.className = 'zoom';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `${w.title}, close up`);
  el.innerHTML = `${w.motion?.src
    ? `<video${w.pixelated ? ' class="pixelated"' : ''} src="${esc(w.motion.src)}" poster="${esc(w.media.src)}" muted loop playsinline${reduceMotion ? '' : ' autoplay'}></video>`
    : `<img${w.pixelated ? ' class="pixelated"' : ''} src="${esc(w.media.src)}" alt="${esc(w.title)}" draggable="false">`}
    <button type="button" class="zoom-close" aria-label="Close">×</button>
    ${seenHint() ? '' : `<p class="zoom-hint">${coarse ? 'Pinch or double-tap to zoom · tap to close' : 'Scroll or double-click to zoom · click to close'}</p>`}`;
  const m = el.firstElementChild;
  m.style.width = `${nw}px`;
  m.style.height = `${nh}px`;
  document.body.append(el);
  const z = zoom = { el, m, nw, nh, s: 1, x: 0, y: 0, pointers: new Map(), pixel: !!w.pixelated };
  const edge = innerWidth < 720 ? 0 : 32; // a phone: the work fills the screen edge to edge
  const fit = () => Math.min((innerWidth - edge) / nw, (innerHeight - edge) / nh);
  z.refit = () => { z.fit = fit(); z.max = Math.max(z.fit * 6, z.pixel ? 24 : 2); zoomTo(z.fit, innerWidth / 2, innerHeight / 2); };
  z.refit();
  history.pushState({ zoom: true }, ''); // the back button (or a swipe back) closes it
  el.focus?.();

  let tap = null, lastTap = 0, pinch = null, single = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoom-close')) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch {}
    z.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (z.pointers.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    if (z.pointers.size === 2) {
      const [a, b] = [...z.pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: z.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (tap) tap.moved = true;
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = z.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.moved = true;
    if (z.pointers.size >= 2 && pinch) {
      const [a, b] = [...z.pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      z.x += mx - pinch.mx; z.y += my - pinch.my; // follow the fingers
      pinch.mx = mx; pinch.my = my;
      zoomTo(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, mx, my);
    } else if (z.pointers.size === 1) {
      z.x += dx; z.y += dy;
      place();
    }
  });
  const up = (e) => {
    if (!z.pointers.delete(e.pointerId)) return;
    if (z.pointers.size < 2) pinch = null;
    if (z.pointers.size || !tap) return;
    const t = tap; tap = null;
    if (t.moved || performance.now() - t.t > 350) return;
    const now = performance.now();
    if (now - lastTap < 320) { // double tap: in, or back to fitted
      clearTimeout(single); lastTap = 0;
      zoomTo(z.s > z.fit * 1.05 ? z.fit : z.fit * (z.pixel ? 3 : 2.5), t.x, t.y, true);
      return;
    }
    lastTap = now;
    single = setTimeout(() => { if (zoom === z && z.s <= z.fit * 1.05) closeZoom(); }, 320);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => {
    e.preventDefault(); // trackpad pinch arrives as a wheel with ctrlKey
    zoomTo(z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX, e.clientY);
  }, { passive: false });
  el.querySelector('.zoom-close').addEventListener('click', () => closeZoom());
}

// keep the work on screen: centred while it's smaller than the screen
function place(smooth = false) {
  const z = zoom, w = z.nw * z.s, h = z.nh * z.s;
  z.x = w <= innerWidth ? (innerWidth - w) / 2 : Math.min(0, Math.max(innerWidth - w, z.x));
  z.y = h <= innerHeight ? (innerHeight - h) / 2 : Math.min(0, Math.max(innerHeight - h, z.y));
  z.m.classList.toggle('easing', smooth);
  z.m.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  z.el.classList.toggle('zoomed', z.s > z.fit * 1.05);
}

function zoomTo(s, cx, cy, smooth = false) {
  const z = zoom;
  s = Math.min(z.max, Math.max(z.fit, s));
  z.x = cx - (cx - z.x) * (s / z.s);
  z.y = cy - (cy - z.y) * (s / z.s);
  z.s = s;
  place(smooth);
}

// fromHistory: the back button already left the close-up's history entry
function closeZoom(fromHistory = false) {
  if (!zoom) return;
  zoom.el.remove();
  zoom = null;
  if (!fromHistory && history.state?.zoom) history.back();
}
addEventListener('popstate', () => closeZoom(true));
addEventListener('resize', () => zoom?.refit());

// ── detail sheet ─────────────────────────────────────
// ← → walk through every work in page order

const sheet = $('[data-sheet]');
let current = null;
let lastFocus = null;
let opened = null; // the work the details were opened on

// the works the arrows step through: the main wall, the Further works, or one artist's
const sequence = () => (current?.further ? further : state.page === 'artist' ? artistWorks : order);

function openSheet(w) {
  flush();
  if (!sheet.hidden && current?.id === w.id) return;
  if (sheet.hidden) { lastFocus = document.activeElement; opened = w; }
  current = w;
  const seq = sequence();
  const pos = seq.indexOf(w);
  $('[data-sheet-count]').textContent = `${pad(pos + 1, 2)} / ${pad(seq.length, 2)}`;
  $('[data-prev]').hidden = $('[data-next]').hidden = $('[data-play]').hidden = seq.length < 2;

  // on a phone the frame takes the work's own shape (see style.css)
  // The picture the wall already has shows at once, the full-size file is laid
  // over it as soon as it arrives (and the stand-in then goes, in case the work
  // has transparent parts).
  const px = w.pixelated ? ' pixelated' : '';
  const shown = tiles.get(w.id)?.querySelector(':scope > img.ready') || $(`.card[data-id="${CSS.escape(w.id)}"] .plate > img.ready`);
  const stand = shown?.currentSrc || w.media.lqip;
  const media = $('[data-sheet-media]');
  media.style.setProperty('--ar', w.media.w && w.media.h ? (w.media.w / w.media.h).toFixed(4) : 1);
  media.innerHTML = `<div class="sheet-art">${stand ? `<img class="stand${px}${shown ? '' : ' blur'}" src="${esc(stand)}" alt="" aria-hidden="true">` : ''}${w.motion?.src
    ? `<video class="art${px}" src="${esc(w.motion.src)}" poster="${esc(w.media.src)}" muted loop playsinline${reduceMotion ? '' : ' autoplay'}></video>`
    : `<img class="art${px}" src="${esc(w.media.src)}" alt="${esc(w.title)}">`}</div>`;
  const art = media.querySelector('img.art');
  // (only once it's decoded: dropping it on load alone could show a blank frame)
  if (art) art.decode().catch(() => {}).then(() => art.isConnected && art.previousElementSibling?.remove());
  // the works either side load in the background, so the arrows are instant
  warm(seq[(pos + 1) % seq.length]);
  warm(seq[(pos - 1 + seq.length) % seq.length]);

  const facts = w.chain === 'physical' ? [
    w.year && ['Year', esc(w.year)],
    w.medium && ['Medium', esc(w.medium)],
    w.dimensions && ['Size', esc(w.dimensions)],
    w.acquired && ['Acquired', day(w.acquired)],
  ].filter(Boolean) : [
    w.collection && ['Collection', esc(w.collection)],
    ['Edition', edition(w)],
    ['Acquired', day(w.acquired)],
    w.minted && ['Minted', day(w.minted)],
    // contract and token in one line: for collectors, so kept quiet
    (w.contract || w.tokenId) && ['On-chain', [
      w.contract && `<button type="button" data-copy="${esc(w.contract)}" title="Copy the contract address">${esc(short(w.contract))}</button>`,
      w.tokenId && `<button type="button" data-copy="${esc(w.tokenId)}" title="Copy the token ID">#${esc(short(String(w.tokenId)))}</button>`,
    ].filter(Boolean).join(' · ')],
  ].filter(Boolean);

  const desc = (w.description || '').trim();
  const links = [...(w.links || [])];
  if (w.interactive) links.unshift(['Open live work', w.interactive.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/')]);

  $('[data-sheet-info]').innerHTML = `
    <span class="sheet-chain">${CHAINS[w.chain]}</span>
    <h2 class="sheet-title" id="sheet-title">${esc(w.title)}</h2>
    <p class="sheet-artist">${w.artist || w.collection ? `<a href="${artistLink(by(w))}" title="Everything by ${esc(by(w))} in the collection">${esc(by(w))}</a>` : esc(by(w))}</p>
    ${w.museum?.note ? `<p class="desc desc-ink">${esc(w.museum.note)}</p>` : ''}
    <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${desc ? `<p class="desc${desc.length > 420 ? ' clamped' : ''}">${esc(desc)}</p>${desc.length > 420 ? '<button type="button" class="desc-more" data-more>Read more</button>' : ''}` : ''}
    <div class="links">${links.map(([label, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}${w.arrival ? '' : '<button type="button" data-share>Share</button>'}</div>`;

  sheet.hidden = false;
  sheet.scrollTop = 0; // on a phone the details scroll: start each work at its top
  document.body.classList.add('locked');
  document.title = `${w.title} — ${data.profile.name}`;
  $('[data-close]').focus({ preventScroll: true });
}

// the work's own page (scripts/og.py), so a shared link shows that work's card
const shareLink = (w) => `https://museum.levinlevin.xyz/w/${w.media.src.split('/').pop().replace(/\.\w+$/, '')}`;

async function share(w) {
  const url = shareLink(w);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: `${w.title} — ${by(w)}`, url }); return; } catch {} }
  navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast(url));
}

// Closing lands on the work you were looking at, even after stepping through
// twenty more: the wall scrolls to it and marks it for a moment.
function closeSheet({ morph = false } = {}) {
  flush();
  if (sheet.hidden) return;
  const w = current;
  const close = () => {
    closeZoom(true);
    endShow();
    sheet.hidden = true;
    sheet.classList.remove('still');
    $('[data-sheet-media]').innerHTML = '';
    document.body.classList.remove('locked');
    document.title = `${data.profile.name} — ${PAGE_TITLES[state.page]}`;
    current = null;
    const t = onPage(w);
    if (!t) { lastFocus?.focus?.({ preventScroll: true }); return null; }
    const r = t.getBoundingClientRect();
    if (r.bottom < 60 || r.top > innerHeight) t.scrollIntoView({ block: 'center' });
    t.focus({ preventScroll: true });
    if (w !== opened) { t.classList.remove('seen'); void t.offsetWidth; t.classList.add('seen'); setTimeout(() => t.classList.remove('seen'), 1700); }
    return t.querySelector(':scope > img:not(.lqip), :scope > video');
  };
  if (morph) transition($('.sheet-art'), close); else close();
}

function leaveSheet() {
  history.pushState(null, '', current?.further ? '#/further' : state.page === 'artist' ? artistLink(artistName) : '#/');
  closeSheet({ morph: true });
}

// the work's tile on the page now showing (the wall or Further works), if any
function onPage(w) {
  const t = w && tiles.get(w.id);
  return t?.isConnected && t.offsetParent ? t : null;
}

// ── moving between the wall and a work ───────────────
// The work grows out of its place on the wall into the details, and shrinks
// back into it on closing (a view transition, where the browser has them; not
// for anyone who has asked their device to reduce motion).
const canMorph = !!document.startViewTransition && !reduceMotion;
let pending = null;

// The browser makes the change a frame later; anything else that opens, closes
// or steps first makes it straight away (flush), so a quick second click can
// never act on a half-made change.
function flush() {
  const p = pending;
  pending = null;
  p?.();
}

function transition(from, change) {
  if (!canMorph) return change();
  flush();
  if (from) from.style.viewTransitionName = 'work';
  let to = null;
  pending = () => {
    if (from) from.style.viewTransitionName = '';
    to = change();
    if (to && from) to.style.viewTransitionName = 'work';
  };
  // the browser pictures the new state once its images are decoded (a quarter
  // of a second at most), so the work never morphs into an empty frame
  const t = document.startViewTransition(() => { flush(); return decoded(to); });
  t.ready.catch(() => {}); // skipped by a quicker click: the change is made all the same
  t.finished.finally(() => { if (to) to.style.viewTransitionName = ''; });
}

function decoded(el) {
  const ims = el ? (el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')]) : [];
  return Promise.race([Promise.all(ims.map((im) => im.decode().catch(() => {}))), sleep(250)]);
}

// open from the wall: grow out of the tile when it's on screen
function openFromWall(w) {
  const t = sheet.hidden && onPage(w);
  const m = t?.querySelector(':scope > img:not(.lqip), :scope > video');
  const r = t?.getBoundingClientRect();
  if (!m || r.bottom < 0 || r.top > innerHeight) return openSheet(w);
  transition(m, () => {
    sheet.classList.add('still'); // the work's growth is the opening: no fade-in on top
    openSheet(w);
    return $('.sheet-art');
  });
}

// load a work's full-size picture ahead of time (the browser keeps it)
const warmed = new Set();
function warm(w) {
  if (!w || warmed.has(w.media.src)) return;
  warmed.add(w.media.src);
  const im = new Image();
  im.decoding = 'async';
  im.src = w.media.src;
}

// with a mouse, a work starts loading when the pointer rests on it a moment,
// so it's usually there before the click
let hover = 0;
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const a = e.target.closest?.('a[href^="#/work/"]');
  clearTimeout(hover);
  if (!a) return;
  const id = decodeURIComponent(a.getAttribute('href').slice(7));
  hover = setTimeout(() => warm(works.find((w) => w.id === id)), 120);
});

function step(d) {
  flush();
  const seq = sequence();
  const next = seq[(seq.indexOf(current) + d + seq.length) % seq.length];
  history.replaceState(null, '', link(next));
  openSheet(next);
}

// Old links (#/vault, #/walk) and unknown artists land on the Museum.
function route() {
  flush();
  const h = location.hash;
  const m = h.match(/^#\/work\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const w = works.find((x) => x.id === id);
    if (w) {
      if (!(state.page === 'artist' && artistWorks.includes(w))) showPage(w.further ? 'further' : 'museum');
      return openFromWall(w);
    }
  }
  closeSheet({ morph: true });
  const a = h.match(/^#\/artist\/(.+)$/);
  if (a && order.some((w) => sameName(by(w), decodeURIComponent(a[1])))) {
    const name = by(order.find((w) => sameName(by(w), decodeURIComponent(a[1]))));
    if (state.page === 'artist' && artistName !== name) state.page = null; // a different artist: back to the top
    renderArtist(name);
    showPage('artist');
    return;
  }
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
  else if (t.hasAttribute('data-share') && current) share(current);
  else if (t.hasAttribute('data-close')) leaveSheet();
  else if (t.hasAttribute('data-prev')) step(-1);
  else if (t.hasAttribute('data-next')) step(1);
  else if (t.hasAttribute('data-play') && current) startShow();
  else if (t.hasAttribute('data-forget')) { forgetKey(); lockWatchlist(); toast('Locked'); }
  else if (t.hasAttribute('data-top')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (t.hasAttribute('data-about-link')) { e.preventDefault(); $('#about').scrollIntoView({ behavior: 'smooth' }); }
});

$('[data-sheet-media]').addEventListener('click', (e) => { if (current && !swiped && e.target.closest('.sheet-art')) openZoom(current); });

// on a touch screen, swipe the work left or right for the next or previous one,
// or pull it down to close (as in Photos); the work follows the finger down
let swipe = null, swiped = false;
$('[data-sheet-media]').addEventListener('touchstart', (e) => {
  swiped = false;
  swipe = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, top: sheet.scrollTop <= 0 } : null;
}, { passive: true });
$('[data-sheet-media]').addEventListener('touchmove', (e) => {
  if (!swipe?.top || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - swipe.x, dy = e.touches[0].clientY - swipe.y;
  const art = $('.sheet-art');
  if (!art) return;
  if (dy > 10 && dy > 1.5 * Math.abs(dx)) {
    swipe.pull = true;
    art.style.transform = `translateY(${dy * 0.6}px) scale(${Math.max(0.85, 1 - dy / 1600)})`;
  } else if (swipe.pull) art.style.transform = '';
}, { passive: true });
$('[data-sheet-media]').addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  const s = swipe;
  swipe = null;
  if (s.pull) {
    swiped = true; setTimeout(() => (swiped = false), 400);
    if (dy > 90 && dy > 1.5 * Math.abs(dx)) return leaveSheet();
    const art = $('.sheet-art');
    art?.classList.add('settle');
    if (art) art.style.transform = '';
    setTimeout(() => art?.classList.remove('settle'), 300);
    return;
  }
  if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) { swiped = true; step(dx < 0 ? 1 : -1); setTimeout(() => (swiped = false), 400); }
}, { passive: true });

// ── slideshow ────────────────────────────────────────
// Play, in a work's details: the works go full screen one after another, with
// no words, a new one every ten seconds. Any tap, click or key stops it (← →
// skip), and you're back in the details of the work that was showing. The
// screen is kept awake while it plays, so it can hang on a TV or a spare screen.

let show = null;
const SHOW_EVERY = 10000;

function startShow() {
  closeZoom(true);
  const seq = sequence();
  const el = document.createElement('div');
  el.className = 'show';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Slideshow: tap or press any key to stop');
  el.tabIndex = -1;
  document.body.append(el);
  show = { el, seq, i: seq.indexOf(current), timer: 0, lock: null, idle: 0 };
  el.requestFullscreen?.().catch(() => {});
  navigator.wakeLock?.request('screen').then((l) => (show ? (show.lock = l) : l.release())).catch(() => {});
  history.pushState({ show: true }, ''); // the back button stops it
  el.focus({ preventScroll: true });
  el.addEventListener('click', () => stopShow());
  el.addEventListener('mousemove', () => { // the pointer shows while it moves
    el.classList.add('pointer');
    clearTimeout(show?.idle);
    if (show) show.idle = setTimeout(() => el.classList.remove('pointer'), 1500);
  });
  frame(0);
}

// show the work d steps on; the new one fades in over the last once it has loaded
function frame(d) {
  const s = show;
  clearTimeout(s.timer);
  s.i = (s.i + d + s.seq.length) % s.seq.length;
  const w = s.seq[s.i];
  const moving = w.motion?.src && !reduceMotion;
  const m = document.createElement(moving ? 'video' : 'img');
  m.className = `show-frame${w.pixelated ? ' pixelated' : ''}`;
  if (moving) Object.assign(m, { src: w.motion.src, poster: w.media.src, muted: true, loop: true, playsInline: true, autoplay: true });
  else Object.assign(m, { src: w.media.src, alt: w.title });
  const ready = moving
    ? new Promise((r) => { m.addEventListener('loadeddata', r, { once: true }); m.addEventListener('error', r, { once: true }); setTimeout(r, 6000); })
    : m.decode().catch(() => {});
  ready.then(() => {
    if (show !== s || s.seq[s.i] !== w) return; // stopped, or skipped on meanwhile
    s.el.append(m);
    requestAnimationFrame(() => m.classList.add('on'));
    setTimeout(() => { for (const old of [...s.el.children]) if (old.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) old.remove(); }, 1400);
    warm(s.seq[(s.i + 1) % s.seq.length]);
    s.timer = setTimeout(() => frame(1), SHOW_EVERY);
  });
}

// take the slideshow down (closing the details does this too)
function endShow() {
  if (!show) return null;
  const s = show;
  show = null;
  clearTimeout(s.timer);
  clearTimeout(s.idle);
  s.lock?.release().catch(() => {});
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  s.el.remove();
  return s.seq[s.i];
}

// stop, and land in the details of the work that was showing
function stopShow(fromHistory = false) {
  const w = endShow();
  if (!w) return;
  const land = () => { if (w !== current && !sheet.hidden) { history.replaceState(null, '', link(w)); openSheet(w); } };
  if (!fromHistory && history.state?.show) { addEventListener('popstate', land, { once: true }); history.back(); }
  else land();
}

addEventListener('popstate', () => stopShow(true));
document.addEventListener('fullscreenchange', () => { if (show && !document.fullscreenElement) stopShow(); });
document.addEventListener('visibilitychange', () => { // the wake lock lapses when the page is hidden
  if (show && document.visibilityState === 'visible') navigator.wakeLock?.request('screen').then((l) => (show ? (show.lock = l) : l.release())).catch(() => {});
});

document.addEventListener('keydown', (e) => {
  if (show) {
    e.preventDefault();
    if (e.key === 'ArrowRight') frame(1);
    else if (e.key === 'ArrowLeft') frame(-1);
    else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) stopShow();
    return;
  }
  if (zoom) {
    if (e.key === 'Escape') closeZoom();
    else if (e.key === '+' || e.key === '=') zoomTo(zoom.s * 1.5, innerWidth / 2, innerHeight / 2, true);
    else if (e.key === '-') zoomTo(zoom.s / 1.5, innerWidth / 2, innerHeight / 2, true);
    else if (e.key === '0') zoomTo(zoom.fit, innerWidth / 2, innerHeight / 2, true);
    return;
  }
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
// new arrivals wait off the wall until they're placed in edit mode
arrivals = works.filter((w) => !w.museum && !w.further);
order = museum;

spot = await fetch('data/spotlight.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null);
spot = { weeks: spot?.weeks || [], posts: spot?.posts || [], texts: spot?.texts || [] };

renderAbout();
renderPosts();
renderMuseum();
renderWeek(null);
renderHeroLinks();
reveal();
route();

export { works, order, further, arrivals };

// a cache in the browser (sw.js): repeat visits load from it, and works seen
// once still show without a connection. Only on the live site, not in edit mode.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// edit mode: only when the page is served by scripts/editor.mjs on this Mac
if (new URLSearchParams(location.search).has('edit') && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  import('/editor/edit.js').catch(() => {});
}
