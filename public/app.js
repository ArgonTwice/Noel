'use strict';

const root = document.getElementById('app');
const state = { config: null, data: null, snapshot: '', sort: 'love', cat: null, price: 'all', revealed: false, viewKey: '' };
let shell = null;

const PAPERS = [['airmail', 'Par avion'], ['holly', 'Houx'], ['gold', 'Doré'], ['snow', 'Neige']];
const PRICE_BANDS = {
  all: ['Tous les prix', () => true],
  low: ['Moins de 20 €', (p) => p < 20],
  mid: ['20 – 50 €', (p) => p >= 20 && p <= 50],
  high: ['Plus de 50 €', (p) => p > 50],
};

function snowEnabled() {
  try {
    return localStorage.getItem('noel-snow') !== 'off';
  } catch {
    return true;
  }
}

function setSnow(on) {
  try {
    localStorage.setItem('noel-snow', on ? 'on' : 'off');
  } catch {}
  applySnow();
}

function applySnow() {
  document.querySelector('.snowfall')?.remove();
  if (snowEnabled()) document.body.append(h('div', { class: 'snowfall', 'aria-hidden': 'true' }));
}

const paperClass = (u) => `theme-${u.paper || 'airmail'}`;

const SUGGESTED_CATEGORIES = ['Jeux & loisirs', 'Livres', 'Vêtements', 'Maison', 'High-tech', 'Beauté', 'Gourmandise', 'Sport'];
const SORTS = { love: 'Coups de cœur d’abord', recent: 'Les plus récents', 'price-asc': 'Prix croissant', 'price-desc': 'Prix décroissant' };

// --- Aides ---

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style') el.setAttribute('style', value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(child));
  }
  return el;
}

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: {} };
  if (options.json) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.json);
  }
  if (options.raw) init.body = options.raw;
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'Une erreur est survenue');
    err.status = res.status;
    throw err;
  }
  return body;
}

function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

function burst(from) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !from.getBoundingClientRect) return;
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (let i = 0; i < 14; i++) {
    const p = h('span', { class: 'confetti', 'aria-hidden': 'true', style: `left:${x}px;top:${y}px` }, ['🎁', '✨', '🎄', '⭐', '❄️', '🎀'][i % 6]);
    document.body.append(p);
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist - 30}px)) scale(1.2) rotate(${Math.random() * 120 - 60}deg)`, opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(.2,.7,.3,1)' }
    ).onfinish = () => p.remove();
  }
}

function avatar(user, size = 56) {
  let hash = 0;
  for (const c of user.id) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  return h('span', { class: 'avatar', 'aria-hidden': 'true', style: `--size:${size}px;--bg:hsl(${hash} 60% 88%)` }, user.avatar);
}

function daysToChristmas() {
  const now = new Date();
  let noel = new Date(now.getFullYear(), 11, 25);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today > noel) noel = new Date(now.getFullYear() + 1, 11, 25);
  return Math.round((noel - today) / 86400000);
}

function countdownText() {
  const d = daysToChristmas();
  if (d === 0) return '🎉 Joyeux Noël !';
  if (d === 1) return 'Plus qu’un dodo avant Noël';
  return `Plus que ${d} jours avant Noël`;
}

const priceNum = (p) => parseFloat(String(p || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
const money = (n) => `${(Math.round(n * 100) / 100).toLocaleString('fr-FR')} €`;
const priceText = (p) => (!p ? '' : /[^\d.,\s]/.test(p) ? p : `${p} €`);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// --- Écrans de connexion : code famille, choix du profil, création ---

function welcome(...content) {
  root.replaceChildren(
    h('div', { class: 'welcome' },
      h('div', { class: 'snow', 'aria-hidden': 'true' }),
      h('div', { class: 'brand' },
        h('div', { class: 'tree', 'aria-hidden': 'true' }, '🎄'),
        h('h1', {}, 'Noël en famille'),
        h('span', { class: 'countdown' }, countdownText())),
      h('div', { class: 'card' }, content))
  );
}

async function showWelcome() {
  state.data = null;
  state.snapshot = '';
  shell = null;
  state.config = await api('/api/config');
  if (state.config.locked) return screenGate();
  if (!state.config.users.length) return screenJoin(true);
  screenWho();
}

function screenGate() {
  const input = h('input', { type: 'password', class: 'big-input', placeholder: 'Code famille', autocomplete: 'off', required: true });
  const error = h('p', { class: 'error', role: 'alert' });
  welcome(
    h('h2', {}, 'Bienvenue 👋'),
    h('p', { class: 'lead' }, 'Entre le code que la famille t’a donné. On ne te le demandera qu’une fois sur cet appareil.'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/unlock', { method: 'POST', json: { code: input.value } });
          showWelcome();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    }, input, error, h('button', { class: 'btn full', type: 'submit' }, 'Entrer'))
  );
  input.focus();
}

function screenWho() {
  const { users } = state.config;
  welcome(
    h('h2', {}, 'Qui es-tu ?'),
    h('p', { class: 'lead' }, 'Touche ton prénom pour retrouver ta lettre.'),
    h('div', { class: 'tiles' },
      users.map((u) =>
        h('button', { class: 'tile', onclick: () => (u.hasPin ? screenPin(u) : signIn(u)) },
          u.hasPin ? h('span', { class: 'lock', 'aria-label': 'protégé par un code' }, '🔒') : null,
          avatar(u, 56), h('span', { class: 'name' }, u.name))),
      h('button', { class: 'tile new', onclick: () => screenJoin(false) },
        h('span', { class: 'plus', 'aria-hidden': 'true' }, '＋'), h('span', {}, 'Nouveau')))
  );
}

async function signIn(user, pin) {
  await api('/api/login', { method: 'POST', json: { id: user.id, pin } });
  location.hash = '#/';
  await showApp();
}

function screenPin(user) {
  const input = h('input', { type: 'password', class: 'big-input', placeholder: 'Ton code', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'error', role: 'alert' });
  welcome(
    h('div', { class: 'pin-who' }, avatar(user, 72), h('strong', {}, `Salut ${user.name} !`)),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await signIn(user, input.value);
        } catch (err) {
          error.textContent = err.message;
          input.select();
        }
      },
    }, input, error, h('button', { class: 'btn full', type: 'submit' }, 'Entrer')),
    h('p', { class: 'center' }, h('button', { class: 'link', onclick: screenWho }, '← Ce n’est pas moi'))
  );
  input.focus();
}

function avatarPicker(initial, onPick) {
  let current = initial;
  const wrap = h('div', { class: 'avatars', role: 'group', 'aria-label': 'Choisis ton avatar' });
  const draw = () =>
    wrap.replaceChildren(
      ...state.config.avatars.map((a) =>
        h('button', { type: 'button', 'aria-pressed': String(a === current), 'aria-label': a, onclick: () => { current = a; onPick(a); draw(); } }, a))
    );
  draw();
  return wrap;
}

function screenJoin(first) {
  let chosen = state.config.avatars[Math.floor(Math.random() * state.config.avatars.length)];
  const name = h('input', { type: 'text', class: 'big-input', maxLength: 30, placeholder: 'Ton prénom', autocomplete: 'given-name', required: true });
  const pin = h('input', { type: 'password', maxLength: 40, placeholder: '4 caractères minimum', autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert' });

  welcome(
    h('h2', {}, first ? 'Écris ta première lettre' : 'Bienvenue !'),
    h('p', { class: 'lead' }, first ? 'Tu es le premier ! Les autres pourront te rejoindre ensuite.' : 'Dis-nous qui tu es, c’est tout.'),
    h('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/join', { method: 'POST', json: { name: name.value, avatar: chosen, pin: pin.value } });
          location.hash = '#/';
          await showApp();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    },
      name,
      h('label', { class: 'field' }, 'Ton avatar'),
      avatarPicker(chosen, (a) => (chosen = a)),
      h('details', { class: 'opt' },
        h('summary', {}, 'Protéger mon profil avec un code (facultatif)'),
        h('p', {}, 'Sans code, n’importe qui de la famille peut se connecter en touchant ton prénom. Avec un code, il faudra le saisir.'),
        pin),
      error,
      h('button', { class: 'btn full', type: 'submit' }, 'C’est parti 🎁')),
    first ? null : h('p', { class: 'center' }, h('button', { class: 'link', onclick: screenWho }, '← Retour'))
  );
  name.focus();
}

// --- Données et routage ---

async function showApp() {
  let next;
  try {
    next = await api('/api/state');
  } catch (err) {
    if (err.status === 401) return showWelcome();
    throw err;
  }
  const snapshot = JSON.stringify(next);
  const changed = snapshot !== state.snapshot;
  state.data = next;
  state.snapshot = snapshot;
  if (!shell) mountShell();
  if (changed) {
    updateShell();
    renderView();
  }
}

function route() {
  const hash = location.hash;
  let m;
  if ((m = hash.match(/^#\/u\/([a-f0-9]+)$/))) return { name: 'letter', id: m[1] };
  if (hash === '#/offrir') return { name: 'offrir' };
  if ((m = hash.match(/^#\/q\/(.*)$/))) return { name: 'search', q: decodeURIComponent(m[1]) };
  return { name: 'home' };
}

const allGifts = () => state.data.users.flatMap((u) => u.gifts.map((g) => ({ ...g, owner: u })));
const myClaims = () => allGifts().filter((g) => g.claimedBy?.id === state.data.me.id);

window.addEventListener('hashchange', () => {
  if (!state.data || !shell) return;
  const r = route();
  if (r.name !== 'search' && shell.search.value) shell.search.value = '';
  if (r.name === 'search' && shell.search.value !== r.q) shell.search.value = r.q;
  updateShell();
  renderView();
  window.scrollTo(0, 0);
});

// --- Structure du site ---

function mountShell() {
  const search = h('input', {
    type: 'search',
    placeholder: 'Chercher une idée, une personne…',
    'aria-label': 'Rechercher',
    oninput: () => {
      const q = search.value.trim();
      if (q) history.replaceState(null, '', '#/q/' + encodeURIComponent(q));
      else if (route().name === 'search') history.replaceState(null, '', '#/');
      updateShell();
      renderView();
    },
  });
  const link = (key, icon, label) => h('a', { href: '#', 'data-key': key }, h('span', { class: 'i', 'aria-hidden': 'true' }, icon), label);
  const links = [link('home', '✉️', 'Les lettres'), link('mine', '✏️', 'Ma lettre'), link('offrir', '🎁', 'À offrir')];
  const tabLinks = [link('home', '✉️', 'Les lettres'), link('mine', '✏️', 'Ma lettre'), link('offrir', '🎁', 'À offrir')];
  const meBtn = h('button', { class: 'me', onclick: openProfile, 'aria-label': 'Mon profil' });
  const main = h('main', { class: 'container' });
  const fab = h('button', { class: 'btn fab', onclick: () => openGiftDialog() }, '＋ Une idée');

  shell = { search, links, tabLinks, meBtn, main, fab };
  root.replaceChildren(
    h('header', { class: 'site-header' },
      h('div', { class: 'hd' },
        h('a', { class: 'logo', href: '#/' }, h('span', { class: 'e', 'aria-hidden': 'true' }, '✉️'), 'Noël en famille'),
        h('nav', { class: 'nav', 'aria-label': 'Navigation' }, links),
        h('div', { class: 'search' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '🔍'), search),
        meBtn)),
    main,
    fab,
    h('nav', { class: 'tabbar', 'aria-label': 'Navigation' }, tabLinks)
  );
}

function updateShell() {
  const { me } = state.data;
  const r = route();
  const active = r.name === 'home' ? 'home' : r.name === 'offrir' ? 'offrir' : r.name === 'letter' && r.id === me.id ? 'mine' : '';
  const hrefs = { home: '#/', mine: `#/u/${me.id}`, offrir: '#/offrir' };
  const count = myClaims().length;
  for (const a of [...shell.links, ...shell.tabLinks]) {
    const key = a.dataset.key;
    a.href = hrefs[key];
    if (key === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    a.querySelector('.badge')?.remove();
    if (key === 'offrir' && count) a.append(h('span', { class: 'badge' }, String(count)));
  }
  shell.meBtn.replaceChildren(avatar(me, 34), me.name);
  shell.fab.hidden = !(r.name === 'letter' && r.id === me.id);
}

function renderView() {
  const r = route();
  const viewKey = r.name + (r.id || '');
  if (viewKey !== state.viewKey) {
    state.viewKey = viewKey;
    state.cat = null;
    state.price = 'all';
  }
  const view = { home: viewHome, letter: viewLetter, offrir: viewOffrir, search: viewSearch }[r.name](r);
  shell.main.replaceChildren(...[].concat(view).flat(Infinity).filter(Boolean));
}

// --- Accueil : boîte aux lettres ---

function viewHome() {
  const { me, users } = state.data;
  const ordered = [users.find((u) => u.id === me.id), ...users.filter((u) => u.id !== me.id)];
  const available = availableGifts();

  return [
    h('section', { class: 'hero' },
      h('div', { class: 'snow', 'aria-hidden': 'true' }),
      h('div', {},
        h('h1', {}, `Coucou ${me.name} !`),
        h('p', {}, 'Chacun écrit sa lettre au Père Noël : des idées, des liens, des photos. Ouvre celles des autres et réserve en cachette de quoi leur faire plaisir.'),
        h('span', { class: 'days' }, countdownText())),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn', href: `#/u/${me.id}` }, '✏️ Écrire ma lettre'),
        available.length ? h('button', { class: 'btn glass', onclick: openSurprise }, '🎲 Surprends-moi') : null)),

    santaCard(),

    h('div', { class: 'section-title' }, h('h2', {}, 'La boîte aux lettres'), h('small', {}, plural(users.length, 'lettre', 'lettres'))),
    h('div', { class: 'mailbox' }, ordered.map((u) => envelope(u, u.id === me.id))),

    available.length ? [
      h('div', { class: 'section-title' }, h('h2', {}, 'Encore disponibles'), h('span', { class: 'script' }, 'ils attendent leur Père Noël')),
      h('div', { class: 'recent' },
        available.slice(0, 12).map((g) =>
          h('a', { class: 'mini', href: `#/u/${g.owner.id}` },
            h('div', { class: 'pic' }, g.image ? h('img', { src: g.image, alt: '', loading: 'lazy' }) : '🎁'),
            h('div', { class: 'b' },
              h('div', { class: 'p' }, priceText(g.price) || ' '),
              h('div', { class: 't' }, g.title),
              h('div', { class: 'w' }, `pour ${g.owner.name}`))))),
    ] : null,
  ];
}

// Cadeaux des autres que personne n'a encore réservés, du plus récent au plus ancien
const availableGifts = () =>
  allGifts().filter((g) => g.owner.id !== state.data.me.id && !g.claimedBy).sort((a, b) => b.createdAt - a.createdAt);

// --- Père Noël secret ---

function santaCard() {
  const { draw, users } = state.data;
  const enough = users.length >= 3;
  const box = (...content) => h('section', { class: 'santa' }, h('div', { class: 'santa-ico', 'aria-hidden': 'true' }, '🎅'), h('div', { class: 'santa-body' }, content));

  if (!draw) {
    return box(
      h('h2', {}, 'Le Père Noël secret'),
      h('p', {}, enough
        ? 'Un tirage au sort pour que chacun offre un cadeau à une personne de la famille. Seul toi verras qui tu as tiré.'
        : 'Il faut au moins 3 personnes dans la famille pour lancer un tirage au sort.'),
      enough ? h('button', { class: 'btn small', onclick: () => openDrawDialog(false) }, '🎲 Lancer le tirage') : null);
  }

  const foot = h('p', { class: 'santa-foot' }, `Tirage lancé par ${draw.by}. `,
    h('button', { class: 'link', onclick: () => openDrawDialog(true) }, 'Refaire le tirage'));
  const t = draw.target;

  if (!t) {
    return box(h('h2', {}, 'Le Père Noël secret'), h('p', {}, 'Le tirage a eu lieu avant ton arrivée : tu n’en fais pas partie cette année.'), foot);
  }
  if (!state.revealed) {
    return box(
      h('h2', {}, 'Ton Père Noël secret est prêt'),
      h('p', {}, 'Le tirage est fait. Assure-toi que personne ne regarde ton écran, puis ouvre l’enveloppe.'),
      h('button', { class: 'seal', onclick: () => { state.revealed = true; renderView(); } }, '🤫 Découvrir qui j’ai tiré'),
      foot);
  }
  return box(
    h('h2', {}, 'Tu offres un cadeau à…'),
    h('div', { class: 'reveal' },
      avatar(t, 64),
      h('div', {},
        h('div', { class: 'reveal-name' }, t.name),
        draw.budget ? h('p', { class: 'santa-budget' }, `Budget conseillé : ${draw.budget}`) : null)),
    h('div', { class: 'santa-actions' },
      h('a', { class: 'btn small', href: `#/u/${t.id}` }, `Ouvrir la lettre de ${t.name}`),
      h('button', { class: 'btn ghost small', onclick: () => { state.revealed = false; renderView(); } }, 'Cacher')),
    h('p', { class: 'santa-foot' }, 'Chut, c’est un secret ! 🤫'),
    foot);
}

function openDrawDialog(redo) {
  const budget = h('input', { type: 'text', id: 'd-budget', maxLength: 20, placeholder: 'Ex. 20 € (facultatif)' });
  const error = h('p', { class: 'error', role: 'alert' });
  const dialog = openDialog(
    h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/draw', { method: 'POST', json: { budget: budget.value, redo } });
          state.revealed = false;
          dialog.close();
          toast('Tirage fait ! Va découvrir qui tu as tiré 🎅');
          showApp();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    },
    h('h2', {}, redo ? 'Refaire le tirage ?' : 'Lancer le tirage au sort'),
    h('p', { class: 'page-sub', style: 'margin-top:6px' }, redo
      ? 'Attention : le tirage actuel est annulé et tout le monde devra redécouvrir sa personne.'
      : `Chacun des ${state.data.users.length} membres de la famille se verra attribuer une personne, en privé. Personne d’autre, pas même toi, ne verra les autres couples.`),
    h('label', { class: 'field', for: 'd-budget' }, 'Budget conseillé'), budget,
    error,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Annuler'),
      h('button', { class: 'btn', type: 'submit' }, redo ? 'Refaire le tirage' : '🎲 Tirer au sort')))
  );
  budget.focus();
}

// --- Surprends-moi ---

function openSurprise() {
  const pool = availableGifts();
  if (!pool.length) return toast('Tout est déjà réservé, bravo la famille ! 🎉');
  let current = null;
  const content = h('div', { class: 'content surprise' });
  const dialog = openDialog(content);

  function draw() {
    let next;
    do next = pool[Math.floor(Math.random() * pool.length)];
    while (pool.length > 1 && next === current);
    current = next;
    const g = current;
    content.replaceChildren(
      h('h2', {}, '🎲 Et si tu offrais…'),
      h('div', { class: 'surprise-card' },
        h('div', { class: 'thumb' }, h('div', { class: 'in' }, g.image ? h('img', { src: g.image, alt: '' }) : '🎁')),
        h('div', { class: 'info' },
          h('div', { class: 'title' }, g.title),
          h('div', { class: 'meta' }, g.price ? h('span', { class: 'price' }, priceText(g.price)) : null, h('a', { class: 'who-tag', href: `#/u/${g.owner.id}` }, `pour ${g.owner.name}`)),
          g.note ? h('div', { class: 'note' }, g.note) : null)),
      h('div', { class: 'modal-actions', style: 'justify-content:space-between;flex-wrap:wrap' },
        h('button', { class: 'btn ghost small', onclick: draw }, '🎲 Un autre !'),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('a', { class: 'btn ghost small', href: `#/u/${g.owner.id}`, onclick: () => dialog.close() }, 'Voir sa lettre'),
          h('button', { class: 'btn green small', onclick: (e) => { dialog.close(); claim(g, e.currentTarget); } }, '🎁 Je m’en occupe'))));
  }
  draw();
}

function envelope(u, mine) {
  const gifts = u.gifts;
  const taken = gifts.filter((g) => g.claimedBy).length;
  const thumbs = [...gifts].sort((a, b) => Number(b.love) - Number(a.love)).slice(0, 4);
  return h('a', { class: `envelope ${paperClass(u)}`, href: `#/u/${u.id}` },
    h('div', { class: 'stamp', 'aria-hidden': 'true' }, avatar(u, 48), h('small', {}, 'NOËL')),
    h('div', { class: 'to' }, mine ? 'Ma lettre au Père Noël' : 'Lettre au Père Noël'),
    h('div', { class: 'who' }, mine ? 'Moi' : u.name),
    h('div', { class: 'addr' }, gifts.length
      ? (mine ? `${plural(gifts.length, 'idée', 'idées')} · ${money(gifts.reduce((s, g) => s + priceNum(g.price), 0))}` : `${plural(gifts.length, 'idée', 'idées')} · ${taken} déjà réservée${taken > 1 ? 's' : ''}`)
      : (mine ? 'Pas encore d’idées : à toi de jouer !' : 'La lettre est encore vide')),
    h('div', { class: 'env-foot' },
      h('div', { class: 'mini-thumbs', 'aria-hidden': 'true' },
        thumbs.length ? thumbs.map((g) => h('span', { class: 't' }, g.image ? h('img', { src: g.image, alt: '', loading: 'lazy' }) : '🎁')) : h('span', { class: 't' }, '✉️')),
      h('span', { class: 'count' }, 'Ouvrir la lettre ›')));
}

// --- La lettre d'une personne ---

function sortGifts(list, how) {
  const byDate = (a, b) => a.createdAt - b.createdAt;
  const sorters = {
    love: (a, b) => Number(b.love) - Number(a.love) || byDate(a, b),
    recent: (a, b) => b.createdAt - a.createdAt,
    'price-asc': (a, b) => priceNum(a.price) - priceNum(b.price),
    'price-desc': (a, b) => priceNum(b.price) - priceNum(a.price),
  };
  return [...list].sort(sorters[how]);
}

function viewLetter({ id }) {
  const { me, users } = state.data;
  const owner = users.find((u) => u.id === id);
  if (!owner) return viewHome();
  const mine = owner.id === me.id;
  const gifts = owner.gifts;
  const cats = [...new Set(gifts.map((g) => g.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  if (state.cat && !cats.includes(state.cat)) state.cat = null;
  const band = PRICE_BANDS[state.price][1];
  const shown = gifts.filter((g) => (!state.cat || g.category === state.cat) && (state.price === 'all' || (g.price && band(priceNum(g.price)))));
  const priced = gifts.filter((g) => g.price).length >= 3;
  const santaTarget = state.revealed && state.data.draw?.target?.id === owner.id;
  const taken = gifts.filter((g) => g.claimedBy).length;
  const total = gifts.reduce((s, g) => s + priceNum(g.price), 0);

  const letter = h('div', { class: 'letter-text' + (owner.letter ? '' : ' placeholder') },
    owner.letter || (mine ? 'Cette année, j’ai été très sage… (touche « Écrire mon mot » pour compléter)' : `${owner.name} n’a pas encore écrit de petit mot.`));

  const sort = h('select', {
    'aria-label': 'Trier',
    onchange: () => { state.sort = sort.value; renderView(); },
  }, Object.entries(SORTS).map(([value, label]) => h('option', { value, selected: value === state.sort }, label)));

  let list;
  if (!gifts.length) {
    list = h('div', { class: 'empty' }, h('div', { class: 'big', 'aria-hidden': 'true' }, '🎁'),
      h('p', {}, mine ? 'Ta lettre est vide. Qu’est-ce qui te ferait plaisir ?' : 'Rien pour le moment…'));
  } else if (!shown.length) {
    list = h('div', { class: 'empty' }, h('p', {}, 'Aucune idée dans cette sélection.'));
  } else if (state.cat || !cats.length) {
    list = h('div', {}, sortGifts(shown, state.sort).map((g) => giftRow(g, { owner, mine })));
  } else {
    const groups = [...cats.map((c) => [c, shown.filter((g) => g.category === c)]), ['Autres idées', shown.filter((g) => !g.category)]].filter(([, l]) => l.length);
    list = h('div', {}, groups.map(([title, items]) => [h('h3', { class: 'cat-title' }, title), sortGifts(items, state.sort).map((g) => giftRow(g, { owner, mine }))]));
  }

  return [
    h('a', { class: 'back', href: '#/' }, '‹ Toutes les lettres'),
    santaTarget ? h('div', { class: 'santa-banner' }, `🎅 Tu as tiré ${owner.name} : c’est à cette personne que tu offres un cadeau. Chut !`) : null,
    h('article', { class: `paper ${paperClass(owner)}` },
      h('div', { class: 'letter-top' },
        h('div', { style: 'min-width:0;flex:1' }, h('div', { class: 'dear' }, mine ? 'Cher Père Noël,' : `Lettre de ${owner.name}`)),
        h('div', { class: 'stamp', style: 'position:static', 'aria-hidden': 'true' }, avatar(owner, 48), h('small', {}, 'NOËL'))),
      letter,
      h('div', { class: 'edit-note' },
        mine ? h('button', { class: 'btn ghost small', onclick: openLetterDialog }, owner.letter ? '✏️ Modifier mon mot' : '✏️ Écrire mon mot') : null,
        h('button', { class: 'btn ghost small', onclick: () => shareLetter(owner) }, '📤 Partager')),
      mine ? quickAdd() : null,
      gifts.length ? h('div', { class: 'toolbar' },
        h('div', { class: 'summary' }, plural(gifts.length, 'idée', 'idées'), ' ',
          h('span', {}, mine ? `· ${money(total)} au total` : `· ${taken} déjà réservée${taken > 1 ? 's' : ''}${total ? ` · ${money(total)} au total` : ''}`)),
        sort) : null,
      cats.length > 0 ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Catégories' },
        [h('button', { class: 'chip-btn', 'aria-pressed': String(!state.cat), onclick: () => { state.cat = null; renderView(); } }, 'Tout'),
          ...cats.map((c) => h('button', { class: 'chip-btn', 'aria-pressed': String(state.cat === c), onclick: () => { state.cat = c; renderView(); } }, c))]) : null,
      priced ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Prix' },
        Object.entries(PRICE_BANDS).map(([key, [label]]) =>
          h('button', { class: 'chip-btn price-chip', 'aria-pressed': String(state.price === key), onclick: () => { state.price = key; renderView(); } }, label))) : null,
      list,
      h('div', { class: 'sign' }, h('div', { class: 'l' }, 'Merci beaucoup, et joyeux Noël !'), h('div', { class: 's' }, mine ? 'Moi' : owner.name))),
  ];
}

function quickAdd() {
  const input = h('input', { type: 'text', placeholder: 'Colle un lien ou écris une idée de cadeau…', 'aria-label': 'Nouvelle idée', autocomplete: 'off' });
  return h('form', {
    class: 'quick',
    onsubmit: (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return openGiftDialog();
      const isLink = /^https?:\/\//i.test(text) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);
      openGiftDialog(null, isLink ? { url: text } : { title: text });
      input.value = '';
    },
  }, input, h('button', { class: 'btn small', type: 'submit' }, '＋ Ajouter'));
}

function giftRow(g, { owner, mine, showOwner }) {
  const me = state.data.me;
  const claimed = g.claimedBy;
  const site = host(g.url);

  let tick;
  if (mine) tick = h('span', { class: 'tick static', 'aria-hidden': 'true' });
  else if (!claimed) tick = h('button', { class: 'tick', title: 'Je m’en occupe', 'aria-label': 'Je m’en occupe', onclick: (e) => claim(g, e.currentTarget) });
  else if (claimed.id === me.id) tick = h('button', { class: 'tick on', title: 'Annuler ma réservation', 'aria-label': 'Annuler ma réservation', onclick: (e) => claim(g, e.currentTarget) }, '✓');
  else tick = h('span', { class: 'tick on static', title: `Réservé par ${claimed.name}`, 'aria-hidden': 'true' }, '✓');

  const acts = h('div', { class: 'acts' });
  if (mine) {
    acts.append(
      h('button', { class: 'btn ghost small', onclick: () => openGiftDialog(g) }, '✏️ Modifier'),
      h('button', { class: 'btn ghost small danger', onclick: () => removeGift(g) }, 'Supprimer'));
  } else if (!claimed) {
    acts.append(h('button', { class: 'btn green small', onclick: (e) => claim(g, e.currentTarget) }, '🎁 Je m’en occupe'));
  } else if (claimed.id === me.id) {
    acts.append(
      h('button', { class: 'btn small ' + (g.bought ? 'green' : 'ghost'), 'aria-pressed': String(g.bought), onclick: (e) => toggleBought(g, e.currentTarget) }, g.bought ? '✅ Acheté' : '☐ Marquer acheté'),
      h('button', { class: 'btn ghost small', onclick: (e) => claim(g, e.currentTarget) }, 'Annuler'));
  }
  if (g.url) acts.append(h('a', { class: 'btn ghost small', href: g.url, target: '_blank', rel: 'noopener noreferrer' }, `Voir le produit ↗`));

  const thumb = h('div', { class: 'thumb' }, h('div', { class: 'in' }, g.image ? h('img', { src: g.image, alt: '', loading: 'lazy' }) : '🎁'));

  return h('div', { class: 'row' + (claimed && !mine ? ' taken' : '') },
    tick,
    thumb,
    h('div', { class: 'info' },
      h('div', { class: 'title' }, g.love ? h('span', { class: 'love', title: 'Coup de cœur' }, '❤️') : null, g.title),
      h('div', { class: 'meta' },
        g.price ? h('span', { class: 'price' }, priceText(g.price)) : null,
        site ? h('span', { class: 'store' }, `🔗 ${site}`) : null,
        showOwner ? h('a', { class: 'who-tag', href: `#/u/${owner.id}` }, `pour ${owner.name}`) : null),
      g.note ? h('div', { class: 'note' }, g.note) : null,
      !mine && claimed ? h('span', { class: 'taken-by' }, claimed.id === me.id ? (g.bought ? '✅ Acheté !' : '✓ Tu l’offres') : `🎁 Réservé par ${claimed.name}`) : null),
    acts);
}

async function claim(g, el) {
  const taking = !g.claimedBy;
  try {
    await api(`/api/gifts/${g.id}/claim`, { method: 'POST' });
    if (taking) {
      burst(el);
      toast('Réservé ! Personne d’autre ne le prendra 🤫');
    }
  } catch (err) {
    toast(err.message);
  }
  showApp();
}

async function toggleBought(g, el) {
  try {
    await api(`/api/gifts/${g.id}/bought`, { method: 'POST' });
    if (!g.bought) {
      burst(el);
      toast('Bravo, un de moins sur la liste ! 🎉');
    }
  } catch (err) {
    toast(err.message);
  }
  showApp();
}

async function shareLetter(owner) {
  const url = `${location.origin}${location.pathname}#/u/${owner.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Noël en famille', text: `La lettre de ${owner.name}`, url });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Lien copié 📋');
  } catch {
    toast(url);
  }
}

async function removeGift(g) {
  if (!confirm(`Supprimer « ${g.title} » de ta lettre ?`)) return;
  await api(`/api/gifts/${g.id}`, { method: 'DELETE' });
  showApp();
}

// --- À offrir ---

function viewOffrir() {
  const claims = myClaims();
  const total = claims.reduce((s, g) => s + priceNum(g.price), 0);
  const bought = claims.filter((g) => g.bought).length;
  const byOwner = state.data.users.map((u) => [u, claims.filter((g) => g.owner.id === u.id)]).filter(([, l]) => l.length);

  const head = h('div', {}, h('h1', { class: 'page-title' }, 'Mes cadeaux à offrir'),
    h('p', { class: 'page-sub' }, 'Ce que tu as réservé. Personne d’autre ne le prendra, et celui qui le reçoit ne verra rien.'));

  if (!claims.length) {
    return [head, h('div', { class: 'panel' }, h('div', { class: 'empty' },
      h('div', { class: 'big', 'aria-hidden': 'true' }, '🎁'),
      h('p', {}, 'Rien de réservé pour l’instant.'),
      h('a', { class: 'btn', href: '#/' }, 'Parcourir les lettres')))];
  }

  return [
    head,
    h('div', { class: 'budget' },
      h('div', { class: 'budget-top' }, h('span', {}, `${plural(claims.length, 'cadeau', 'cadeaux')} à offrir`), h('strong', {}, money(total))),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(claims.length), 'aria-valuenow': String(bought) },
        h('span', { style: `width:${Math.round((bought / claims.length) * 100)}%` })),
      h('div', { class: 'budget-sub' }, bought === claims.length ? '🎉 Tout est acheté, bravo !' : `${bought} acheté${bought > 1 ? 's' : ''} sur ${claims.length}`)),
    byOwner.map(([u, list]) =>
      h('section', { class: 'panel' },
        h('div', { class: 'group-head' }, avatar(u, 40), h('a', { href: `#/u/${u.id}` }, u.name),
          h('span', { class: 'sum' }, `${plural(list.length, 'cadeau', 'cadeaux')} · ${money(list.reduce((s, g) => s + priceNum(g.price), 0))}`)),
        sortGifts(list, 'recent').map((g) => giftRow(g, { owner: u, mine: false })))),
  ];
}

// --- Recherche ---

function viewSearch({ q }) {
  const needle = q.toLowerCase();
  const hits = allGifts().filter((g) =>
    [g.title, g.note, g.category, g.owner.name, host(g.url)].some((v) => v && v.toLowerCase().includes(needle)));
  return [
    h('h1', { class: 'page-title' }, `« ${q} »`),
    h('p', { class: 'page-sub' }, hits.length ? plural(hits.length, 'idée trouvée', 'idées trouvées') : 'Rien trouvé pour cette recherche.'),
    hits.length ? h('div', { class: 'panel' }, hits.map((g) => giftRow(g, { owner: g.owner, mine: g.owner.id === state.data.me.id, showOwner: true }))) : null,
  ];
}

// --- Fenêtres ---

function openDialog(...content) {
  const dialog = h('dialog', { onclose: () => dialog.remove() }, ...content);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function openProfile() {
  const me = state.data.me;
  let chosen = me.avatar;
  let paper = me.paper;
  const snow = h('input', { type: 'checkbox', checked: snowEnabled() });
  const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Papier à lettres' });
  const drawSwatches = () =>
    swatches.replaceChildren(...PAPERS.map(([id, label]) =>
      h('button', { type: 'button', class: `swatch theme-${id}`, 'aria-pressed': String(id === paper), onclick: () => { paper = id; drawSwatches(); } },
        h('span', { class: 'chip-frame' }), label)));
  drawSwatches();
  const pin = h('input', { type: 'password', id: 'p-pin', maxLength: 40, placeholder: 'Nouveau code (4 caractères minimum)', autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert' });

  const dialog = openDialog(
    h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/profile', { method: 'PUT', json: { avatar: chosen, paper, pin: pin.value } });
          setSnow(snow.checked);
          dialog.close();
          showApp();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    },
    h('h2', {}, `Salut ${me.name} !`),
    h('label', { class: 'field' }, 'Mon avatar'),
    avatarPicker(chosen, (a) => (chosen = a)),
    h('label', { class: 'field' }, 'Mon papier à lettres'),
    swatches,
    h('label', { class: 'check' }, snow, '❄️ Neige qui tombe'),
    h('label', { class: 'field', for: 'p-pin' }, me.hasPin ? 'Changer mon code' : 'Protéger mon profil avec un code (facultatif)'),
    pin,
    me.hasPin ? h('button', {
      type: 'button',
      class: 'link',
      onclick: async () => {
        await api('/api/profile', { method: 'PUT', json: { pin: null } });
        dialog.close();
        toast('Code retiré');
        showApp();
      },
    }, 'Retirer mon code') : null,
    error,
    h('div', { class: 'modal-actions' },
      h('button', {
        type: 'button',
        class: 'btn ghost',
        onclick: async () => {
          await api('/api/logout', { method: 'POST' });
          dialog.close();
          showWelcome();
        },
      }, 'Me déconnecter'),
      h('button', { class: 'btn', type: 'submit' }, 'Enregistrer')))
  );
}

function openLetterDialog() {
  const me = state.data.me;
  const text = h('textarea', {
    id: 'l-text',
    maxLength: 600,
    rows: 6,
    placeholder: 'Cette année j’ai été très sage… Ce qui me ferait vraiment plaisir, c’est…',
  }, me.letter || '');
  const error = h('p', { class: 'error', role: 'alert' });
  const dialog = openDialog(
    h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/profile', { method: 'PUT', json: { letter: text.value } });
          dialog.close();
          showApp();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    },
    h('h2', {}, 'Mon petit mot au Père Noël'),
    h('label', { class: 'field', for: 'l-text' }, 'Ce que tout le monde lira en haut de ta lettre'),
    text,
    error,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Annuler'),
      h('button', { class: 'btn', type: 'submit' }, 'Enregistrer')))
  );
  text.focus();
}

function resizeImage(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image illisible'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}

function openGiftDialog(gift, prefill = {}) {
  const editing = Boolean(gift);
  const start = gift || prefill;
  let image = gift?.image || '';
  const mineCats = [...new Set(state.data.users.find((u) => u.id === state.data.me.id).gifts.map((g) => g.category).filter(Boolean))];
  const suggestions = [...new Set([...mineCats, ...SUGGESTED_CATEGORIES])].slice(0, 8);

  const url = h('input', { type: 'text', id: 'g-url', inputMode: 'url', placeholder: 'Colle le lien d’un site (facultatif)', value: start.url || '' });
  const title = h('input', { type: 'text', id: 'g-title', maxLength: 120, required: true, placeholder: 'Ex. Casque audio', value: start.title || '' });
  const price = h('input', { type: 'text', id: 'g-price', maxLength: 20, placeholder: 'Ex. 25', inputMode: 'decimal', value: gift?.price || '' });
  const category = h('input', { type: 'text', id: 'g-cat', maxLength: 30, placeholder: 'Ex. Livres (facultatif)', autocomplete: 'off', value: gift?.category || '' });
  const note = h('textarea', { id: 'g-note', maxLength: 400, placeholder: 'Taille, couleur, marque…' }, gift?.note || '');
  const love = h('input', { type: 'checkbox', checked: Boolean(gift?.love) });
  const status = h('p', { class: 'status', role: 'status' });
  const error = h('p', { class: 'error', role: 'alert' });
  const thumb = h('div', { class: 'thumb' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const save = h('button', { class: 'btn', type: 'submit' }, editing ? 'Enregistrer' : 'Ajouter à ma lettre');
  const remove = h('button', { type: 'button', class: 'btn ghost small', onclick: () => { image = ''; drawThumb(); } }, 'Retirer la photo');

  function drawThumb() {
    thumb.replaceChildren(h('div', { class: 'in' }, image ? h('img', { src: image, alt: '' }) : '📷'));
    remove.hidden = !image;
  }

  async function fetchPreview() {
    const link = url.value.trim();
    if (!link) return;
    status.textContent = 'Je regarde ce lien…';
    try {
      const p = await api('/api/preview', { method: 'POST', json: { url: link } });
      if (p.title && !title.value.trim()) title.value = p.title;
      if (p.image && !image) image = p.image;
      drawThumb();
      status.textContent = p.title || p.image ? '✨ C’est rempli, vérifie et ajuste si besoin.' : 'Rien trouvé sur ce lien, remplis à la main.';
    } catch {
      status.textContent = 'Impossible de lire ce lien, remplis à la main.';
    }
  }
  url.addEventListener('change', () => { if (!title.value.trim() || !image) fetchPreview(); });

  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    status.textContent = 'Envoi de la photo…';
    try {
      image = (await api('/api/upload', { method: 'POST', raw: await resizeImage(file.files[0]) })).image;
      drawThumb();
      status.textContent = '';
    } catch (err) {
      status.textContent = err.message;
    }
  });

  const dialog = openDialog(
    h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        save.disabled = true;
        try {
          await api(editing ? `/api/gifts/${gift.id}` : '/api/gifts', {
            method: editing ? 'PUT' : 'POST',
            json: { title: title.value, url: url.value, price: price.value, note: note.value, category: category.value, love: love.checked, image },
          });
          dialog.close();
          if (!editing) toast('Ajouté à ta lettre ✨');
          showApp();
        } catch (err) {
          error.textContent = err.message;
          save.disabled = false;
        }
      },
    },
    h('h2', {}, editing ? 'Modifier cette idée' : 'Une nouvelle idée'),
    h('label', { class: 'field', for: 'g-url' }, 'Un lien ? On remplit le reste pour toi'),
    url, status,
    h('label', { class: 'field', for: 'g-title' }, 'Nom du cadeau'), title,
    h('label', { class: 'field', for: 'g-price' }, 'Prix approximatif (€)'), price,
    h('label', { class: 'field', for: 'g-cat' }, 'Rayon'), category,
    h('div', { class: 'chips pick' }, suggestions.map((c) => h('button', { type: 'button', class: 'chip-btn', onclick: () => { category.value = c; } }, c))),
    h('label', { class: 'field', for: 'g-note' }, 'Précisions'), note,
    h('label', { class: 'field' }, 'Photo'),
    h('div', { class: 'photo' }, thumb,
      h('div', { class: 'col' }, h('button', { type: 'button', class: 'btn ghost small', onclick: () => file.click() }, 'Choisir une photo'), remove), file),
    h('label', { class: 'check' }, love, '❤️ C’est mon coup de cœur'),
    error,
    h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Annuler'), save))
  );

  drawThumb();
  if (prefill.url) fetchPreview();
  (editing || prefill.url ? title : url).focus();
}

// --- Démarrage ---

setInterval(() => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (state.data && !document.hidden && !typing && !document.querySelector('dialog[open]')) showApp().catch(() => {});
}, 30000);

applySnow();

if (window.NOEL_DEMO) {
  document.body.prepend(h('div', { class: 'demo-ribbon' }, 'Démo : tes données restent sur cet appareil. Le vrai site partagé tourne sur ton NAS.'));
}

showApp().catch(() => showWelcome());
