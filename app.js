const CHAINS = { tezos: 'Tezos', ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin' };
const CHAIN_ORDER = ['tezos', 'ethereum', 'solana', 'bitcoin'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n, l = 2) => String(n).padStart(l, '0');
const short = (a) => (a && a.length > 16 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
const month = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const day = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const edition = (w) => (w.editions === 1 ? '1 of 1' : w.editions ? `Edition of ${w.editions}` : '—');
const by = (w) => w.artist || w.collection || 'Unknown';
const link = (w) => `#/work/${encodeURIComponent(w.id)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

const PAGE_TITLES = { museum: 'The Museum', vault: 'The Vault', watchlist: 'Watch List', walk: 'Walk through the Museum', week: 'Artist of the Week' };
const state = { page: null, chain: 'all', artist: null, view: 'grid', sort: 'recent' };
const SORTS = [['recent', 'Recent'], ['artist', 'Artist'], ['title', 'Title'], ['chain', 'Chain']];
const artistLink = (name) => `#/artist/${encodeURIComponent(name)}`;
const cmp = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
let data, works, museum, spot;

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
  for (const el of $$('.plate img:not(.ready):not(.lqip), .frame img:not(.ready):not(.lqip), .plate video:not(.ready), .frame video:not(.ready)', root)) {
    const done = () => el.classList.add('ready');
    if (el.tagName === 'IMG') { el.complete && el.naturalWidth ? done() : (el.onload = done, el.onerror = done); }
    else done();
  }
  for (const v of $$('video[data-autoplay]', root)) io.observe(v);
}

function card(w, { badge = false } = {}) {
  return `<a class="card" href="${link(w)}" data-id="${esc(w.id)}">
    <div class="plate">${badge ? `<span class="badge">${CHAINS[w.chain]}</span>` : ''}${w.museum ? '<span class="on-view">On view</span>' : ''}${mediaEl(w)}</div>
    <div class="cap">
      <div class="cap-title">${esc(w.title)}</div>
      <div class="cap-meta">${esc(by(w))}, ${CHAINS[w.chain]}</div>
    </div>
  </a>`;
}

// ── the museum ───────────────────────────────────────

function renderMuseum() {
  const n = museum.length;
  $('[data-on-view]').textContent = `${plural(n, 'work')} on view`;
  $('[data-vault-count]').textContent = `The Vault, ${works.length} works ↗`;

  $('[data-hang]').innerHTML = museum.map((w, i) => {
    const ar = w.media.w && w.media.h ? (w.media.w / w.media.h).toFixed(4) : 1;
    const m = w.museum;
    return `<article class="piece ${esc(m.size)} ${esc(m.align)}">
      <a class="frame" href="${link(w)}" data-ar="${ar}" aria-label="${esc(w.title)} by ${esc(by(w))}">${mediaEl(w, { eager: i < 2, sizes: m.size === 'small' ? '(max-width: 720px) 72vw, 30vw' : m.size === 'large' ? '(max-width: 720px) 100vw, 68vw' : '(max-width: 720px) 100vw, 46vw' })}</a>
      <div class="label">
        <span class="no">${pad(i + 1)} / ${pad(n)}</span>
        <span class="t">${esc(w.title)}</span>
        <span class="a">${esc(by(w))}</span>
        <span>${CHAINS[w.chain]}${w.editions ? `, ${edition(w).toLowerCase()}` : ''}</span>
        ${w.collection ? `<span>${esc(w.collection)}</span>` : ''}
        ${m.note ? `<span class="note">${esc(m.note)}</span>` : ''}
      </div>
    </article>`;
  }).join('');

  // set via the CSSOM: the Content-Security-Policy forbids inline style attributes
  $$('[data-ar]').forEach((el) => el.style.setProperty('--ar', el.dataset.ar));

  const rest = works.filter((w) => !w.museum);
  $('[data-enter-sub]').textContent = `Every work in the collection, ${works.length} in all, including the ${rest.length} not on the walls.`;
  $('[data-enter-strip]').innerHTML = rest.slice(0, 10).map((w) =>
    `<img src="${esc(w.media.thumb || w.media.src)}" alt="" loading="lazy" decoding="async"${w.pixelated ? ' class="pixelated"' : ''}>`).join('');

  // a small rotating specimen above the headline
  const box = $('.hero-specimen');
  const pool = (museum.length ? museum : works).slice(0, 10);
  box.innerHTML = pool.map((w) => `<img src="${esc(w.media.thumb || w.media.src)}" alt=""${w.pixelated ? ' class="pixelated"' : ''} decoding="async">`).join('');
  const imgs = $$('img', box);
  let i = 0;
  imgs[0]?.classList.add('on');
  if (imgs.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => { imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); }, 2600);
  }
}

// ── the vault ────────────────────────────────────────

function filtered() {
  const list = works.filter((w) => (state.chain === 'all' || w.chain === state.chain) && (!state.artist || by(w) === state.artist));
  const recent = (a, b) => works.indexOf(a) - works.indexOf(b); // works arrive newest first
  const order = {
    recent,
    artist: (a, b) => cmp(by(a), by(b)) || recent(a, b),
    title: (a, b) => cmp(a.title, b.title),
    chain: (a, b) => CHAIN_ORDER.indexOf(a.chain) - CHAIN_ORDER.indexOf(b.chain) || recent(a, b),
  }[state.sort];
  return list.sort(order);
}

function renderVaultHead() {
  const artists = new Set(works.map(by)).size;
  $('[data-count-artists]').textContent = artists;
  if (state.artist) {
    const mine = works.filter((w) => by(w) === state.artist);
    const chains = [...new Set(mine.map((w) => CHAINS[w.chain]))].join(' and ');
    $('.vault-title').textContent = state.artist;
    $('[data-vault-sub]').innerHTML = `${esc(plural(mine.length, 'work'))} in the collection, on ${esc(chains)}. <a class="quiet" href="#/vault">All of the Vault ↗</a>`;
    document.title = `${state.artist} — ${data.profile.name}`;
  } else {
    const chains = new Set(works.map((w) => w.chain)).size;
    $('.vault-title').textContent = 'The Vault';
    $('[data-vault-sub]').textContent = `Everything in the collection: ${plural(works.length, 'work')} by ${plural(artists, 'artist')} across ${plural(chains, 'chain')}. Works marked On view hang in the Museum.`;
  }
}

function renderFilters() {
  const counts = Object.fromEntries(CHAIN_ORDER.map((c) => [c, works.filter((w) => w.chain === c).length]));
  const pool = state.artist ? works.filter((w) => by(w) === state.artist) : works;
  const n = (c) => pool.filter((w) => c === 'all' || w.chain === c).length;
  const btn = (key, label) => `<button type="button" data-chain="${key}" aria-pressed="${state.chain === key}">${label}<sup>${n(key)}</sup></button>`;
  $('[data-filters]').innerHTML = btn('all', 'All') + CHAIN_ORDER.filter((c) => n(c)).map((c) => btn(c, CHAINS[c])).join('');
  $('[data-filters]').hidden = CHAIN_ORDER.filter((c) => n(c)).length < 2;
  $('[data-sorts]').innerHTML = SORTS.filter(([k]) => !(k === 'artist' && state.artist))
    .map(([k, label]) => `<button type="button" data-sort="${k}" aria-pressed="${state.sort === k}">${label}</button>`).join('');
}

function renderWorks() {
  const list = filtered();
  const grid = $('[data-grid]');
  const index = $('[data-index]');
  grid.hidden = state.view !== 'grid';
  index.hidden = state.view !== 'index';
  $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));

  if (state.view === 'grid') {
    // sorted by artist: a heading above each artist's works, linking to their page
    let last = null;
    grid.innerHTML = list.map((w) => {
      const head = state.sort === 'artist' && !state.artist && by(w) !== last
        ? `<a class="group" href="${artistLink(by(w))}"><span>${esc(by(w))}</span><span class="quiet">${works.filter((x) => by(x) === by(w) && (state.chain === 'all' || x.chain === state.chain)).length}</span></a>` : '';
      last = by(w);
      return head + card(w, { badge: state.chain === 'all' });
    }).join('');
    reveal(grid);
  } else {
    index.innerHTML = `<div class="row head"><span>No.</span><span>Title</span><span>Artist</span><span>Chain</span><span>Edition</span><span>Acquired</span></div>`
      + list.map((w) => `<a class="row" href="${link(w)}" data-id="${esc(w.id)}">
          <span class="num">${pad(works.indexOf(w) + 1, 3)}</span>
          <span>${esc(w.title)}</span>
          <span class="muted">${esc(by(w))}</span>
          <span class="muted">${CHAINS[w.chain]}</span>
          <span class="muted">${w.editions === 1 ? '1/1' : w.editions ? `/${w.editions}` : '—'}</span>
          <span class="muted">${month(w.acquired)}</span>
        </a>`).join('');
  }
}

function renderArtists() {
  const tally = new Map();
  for (const w of works) tally.set(by(w), (tally.get(by(w)) || 0) + 1);
  const rows = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
  $('[data-artists]').innerHTML = rows.map(([name, n]) =>
    `<li><a href="${artistLink(name)}"><span>${esc(name)}</span><span>${n}</span></a></li>`).join('');
}

// ── artist of the week ───────────────────────────────
// from Mother Flame's "Artist of the Week" list, newest first (data/spotlight.json)

const weekLink = (p) => `#/artist-of-the-week/${p.no}`;
const sameName = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const collected = (p) => works.filter((w) => sameName(by(w), p.name) || sameName(by(w), p.handle));
const weekLine = (p) => [`No. ${pad(p.no)}`, p.date && day(p.date)].filter(Boolean).join(' · ');

// the pick's own image, or else a work of theirs from the Vault
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

function renderWeekTeaser() {
  const p = spot.weeks[0];
  $('[data-week-teaser]').hidden = !p;
  $$('[data-week-nav]').forEach((a) => (a.hidden = !p));
  if (!p) return;
  $('[data-week-teaser]').innerHTML = `<a class="teaser" href="#/artist-of-the-week">
    <span class="teaser-text">
      <span class="teaser-eyebrow">Artist of the Week · ${esc(weekLine(p))}</span>
      <span class="teaser-name">${esc(p.name)} <span class="arrow">→</span></span>
      ${p.tagline ? `<span class="teaser-tag">${esc(p.tagline)}</span>` : ''}
      ${p.note ? `<span class="teaser-note">${esc(p.note)}</span>` : ''}
    </span>
    <span class="plate teaser-plate">${pickImg(p, { sizes: '(max-width: 720px) 100vw, 36vw' })}</span>
  </a>`;
  reveal($('[data-week-teaser]'));
}

function renderWeek(no) {
  const p = spot.weeks.find((x) => x.no === no) || spot.weeks[0];
  $('[data-week-sub]').innerHTML = `One artist a week, picked from the work people send me. Send yours on X: <a class="quiet" href="https://x.com/${esc(data.profile.x)}" target="_blank" rel="noopener">@${esc(data.profile.x)} ↗</a>`;
  if (!p) {
    $('[data-pick]').innerHTML = '<p class="quiet">The first pick is on its way.</p>';
    $('[data-week-past-block]').hidden = true;
    return;
  }
  const mine = collected(p);
  const im = pickImage(p);
  const ar = im?.w && im?.h ? (im.w / im.h).toFixed(4) : 1;
  const open = p.workId ? `href="${link({ id: p.workId })}"` : p.work ? `href="${esc(p.work)}" target="_blank" rel="noopener noreferrer"` : '';
  const facts = [
    p.x && ['On X', `<a href="${esc(p.x)}" target="_blank" rel="noopener noreferrer">@${esc(p.handle)} ↗</a>`],
    ['In the Vault', mine.length ? `<a href="${artistLink(by(mine[0]))}">${plural(mine.length, 'work')} ↗</a>` : 'Not yet'],
    p.date && ['Picked', day(p.date)],
  ].filter(Boolean);
  $('[data-pick]').innerHTML = `
    ${im ? `<a class="frame pick-frame" ${open || `href="${weekLink(p)}"`} data-ar="${ar}">${pickImg(p, { eager: true, sizes: '(max-width: 860px) 100vw, 55vw' })}</a>` : '<div></div>'}
    <div class="pick-info">
      <span class="sheet-chain">${esc(weekLine(p))}</span>
      <h2 class="pick-name">${esc(p.name)}</h2>
      ${p.tagline ? `<p class="pick-tag">${esc(p.tagline)}</p>` : ''}
      ${p.note ? `<p class="pick-note">${esc(p.note)}</p>` : ''}
      <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${p.watch?.length ? `<div class="to-watch"><span class="quiet">${p.watch.length === 3 ? 'Three' : p.watch.length === 2 ? 'Two' : 'One'} to watch</span><ol>${p.watch.map((w) =>
        `<li>${w.href ? `<a href="${esc(w.href)}" target="_blank" rel="noopener noreferrer">${esc(w.name)} ↗</a>` : esc(w.name)}</li>`).join('')}</ol></div>` : ''}
      <div class="links">${(p.links || []).map(([label, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div>
    </div>`;
  $$('[data-ar]', $('[data-pick]')).forEach((el) => el.style.setProperty('--ar', el.dataset.ar));

  const past = spot.weeks.filter((x) => x !== p);
  $('[data-week-past-block]').hidden = !past.length;
  $('[data-week-past-block] h2').textContent = p === spot.weeks[0] ? 'Previously' : 'Every pick';
  $('[data-week-count]').textContent = spot.weeks.length;
  $('[data-week-past]').innerHTML = past.map((x) => `<a class="card" href="${weekLink(x)}">
    <div class="plate">${pickImg(x)}</div>
    <div class="cap">
      <div class="cap-title">${esc(x.name)}</div>
      <div class="cap-meta">${esc(weekLine(x))}</div>
    </div>
  </a>`).join('');
  reveal($('[data-page="week"]'));
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
  $('[data-updated]').textContent = `Updated ${day(data.updated)}`;
  $('[data-wallets]').innerHTML = CHAIN_ORDER.filter((c) => data.wallets[c]).map((c) =>
    `<dt>${CHAINS[c]}</dt><dd><code title="${esc(data.wallets[c])}">${esc(short(data.wallets[c]))}</code><button type="button" data-copy="${esc(data.wallets[c])}">Copy</button></dd>`).join('');
}

let walker = null; // the 3D module, loaded on first visit
async function startWalk() {
  const { enterWalk } = await import('./walk.js');
  walker = await enterWalk($('[data-walk]'), museum, {
    onOpen: (w) => { location.hash = link(w).slice(1); },
    onFocus: (i, w, n) => { $('[data-walk-now]').textContent = `${pad(i + 1)} / ${pad(n)}  ${w.title}, ${by(w)}`; },
  });
}

function showPage(page) {
  if (state.page === page) return;
  if (state.page === 'walk') import('./walk.js').then((m) => m.leaveWalk());
  document.body.classList.toggle('walking', page === 'walk');
  state.page = page;
  for (const el of $$('[data-page]')) el.hidden = el.dataset.page !== page;
  $$('[data-nav]').forEach((a) => (a.dataset.nav === page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
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

const sheet = $('[data-sheet]');
let current = null;
let lastFocus = null;

function sequence() {
  if ((state.page === 'museum' || state.page === 'walk') && current?.museum) return museum;
  const list = filtered();
  return list.includes(current) ? list : works;
}

function openSheet(w) {
  if (!sheet.hidden && current?.id === w.id) return;
  if (sheet.hidden) lastFocus = document.activeElement;
  current = w;
  const seq = sequence();
  const pos = seq.indexOf(w);
  $('[data-sheet-count]').textContent = seq.length > 1 ? `${pad(pos + 1, 3)} / ${pad(seq.length, 3)}${seq === museum ? ', The Museum' : ''}` : '';
  $('[data-prev]').hidden = $('[data-next]').hidden = seq.length < 2;

  $('[data-sheet-media]').innerHTML = w.motion?.src
    ? `<video${w.pixelated ? ' class="pixelated"' : ''} src="${esc(w.motion.src)}" poster="${esc(w.media.src)}" muted loop playsinline autoplay></video>`
    : `<img${w.pixelated ? ' class="pixelated"' : ''} src="${esc(w.media.src)}" alt="${esc(w.title)}">`;

  const facts = [
    w.collection && ['Collection', esc(w.collection)],
    ['Edition', edition(w)],
    ['Acquired', day(w.acquired)],
    w.minted && ['Minted', day(w.minted)],
    w.museum && ['Location', 'The Museum'],
    w.contract && ['Contract', `<button type="button" data-copy="${esc(w.contract)}" title="Copy">${esc(short(w.contract))}</button>`],
    w.tokenId && ['Token', `<button type="button" data-copy="${esc(w.tokenId)}" title="Copy">${esc(short(String(w.tokenId)))}</button>`],
  ].filter(Boolean);

  const desc = (w.description || '').trim();
  const links = [...(w.links || [])];
  if (w.interactive) links.unshift(['Open live work', w.interactive.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/')]);

  $('[data-sheet-info]').innerHTML = `
    <span class="sheet-chain">${CHAINS[w.chain]}</span>
    <h2 class="sheet-title" id="sheet-title">${esc(w.title)}</h2>
    <p class="sheet-artist"><a href="${artistLink(by(w))}">${esc(by(w))} ↗</a></p>
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
  const back = { vault: state.artist ? artistLink(state.artist) : '#/vault', walk: '#/walk', week: '#/artist-of-the-week' };
  history.pushState(null, '', back[state.page] || '#/');
  closeSheet();
}

function step(d) {
  const seq = sequence();
  const next = seq[(seq.indexOf(current) + d + seq.length) % seq.length];
  history.replaceState(null, '', link(next));
  openSheet(next);
}

function route() {
  const h = location.hash;
  const m = h.match(/^#\/work\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const w = works.find((x) => x.id === id);
    if (w) {
      if (!state.page) showPage(w.museum ? 'museum' : 'vault');
      return openSheet(w);
    }
  }
  closeSheet();
  const a = h.match(/^#\/artist\/(.+)$/);
  if (a || h === '#/vault') {
    const artist = a ? decodeURIComponent(a[1]) : null;
    const changed = artist !== state.artist;
    state.artist = artist;
    if (changed) { state.chain = 'all'; if (artist && state.sort === 'artist') state.sort = 'recent'; }
    const wasVault = state.page === 'vault';
    showPage('vault');
    if (changed || !wasVault) { renderVaultHead(); renderFilters(); renderWorks(); if (wasVault) window.scrollTo({ top: 0 }); }
  }
  else if (h === '#/watchlist') { showPage('watchlist'); openWatchlist(); }
  else if (/^#\/artist-of-the-week(\/\d+)?$/.test(h)) {
    const no = Number(h.split('/')[2]) || null;
    const was = state.page === 'week';
    showPage('week');
    renderWeek(no);
    if (was) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  else if (h === '#/walk') { showPage('walk'); startWalk(); }
  else if (h === '' || h === '#' || h === '#/') showPage('museum');
  else if (!state.page) showPage('museum'); // plain anchors like #about keep the current page
}

// ── index hover peek ─────────────────────────────────

const peek = $('[data-peek]');
let peekId = null;
document.addEventListener('pointermove', (e) => {
  const row = e.target.closest?.('.index .row[data-id]');
  if (!row) { peek.classList.remove('on'); peekId = null; return; }
  if (row.dataset.id !== peekId) {
    peekId = row.dataset.id;
    const w = works.find((x) => x.id === peekId);
    peek.innerHTML = `<img src="${esc(w.media.thumb || w.media.src)}" alt=""${w.pixelated ? ' class="pixelated"' : ''}>`;
  }
  peek.style.left = `${Math.min(e.clientX + 150, innerWidth - 120)}px`;
  peek.style.top = `${e.clientY}px`;
  peek.classList.add('on');
});

// ── events ───────────────────────────────────────────

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 1900);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.chain) { state.chain = t.dataset.chain; renderFilters(); renderWorks(); }
  else if (t.dataset.view) { state.view = t.dataset.view; renderWorks(); }
  else if (t.dataset.sort) { state.sort = t.dataset.sort; renderFilters(); renderWorks(); }
  else if (t.dataset.copy) {
    e.preventDefault();
    navigator.clipboard?.writeText(t.dataset.copy).then(() => toast('Copied'), () => toast(t.dataset.copy));
  }
  else if (t.hasAttribute('data-more')) { $('.sheet .desc.clamped')?.classList.remove('clamped'); t.remove(); }
  else if (t.hasAttribute('data-close')) leaveSheet();
  else if (t.hasAttribute('data-walk-prev')) walker?.prev();
  else if (t.hasAttribute('data-walk-next')) walker?.next();
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
museum = works.filter((w) => w.museum).sort((a, b) => a.museum.rank - b.museum.rank);

spot = await fetch('data/spotlight.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null);
spot = { weeks: spot?.weeks || [], posts: spot?.posts || [] };

renderAbout();
renderPosts();
renderMuseum();
renderWeekTeaser();
renderVaultHead();
renderFilters();
renderWorks();
renderArtists();
reveal();
route();
