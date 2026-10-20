'use strict';

const root = document.getElementById('app');
const state = { config: null, data: null, selected: null };

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
  for (const child of children.flat()) {
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
  setTimeout(() => el.remove(), 3000);
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

// --- Accueil : code famille, choix du profil, création ---

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
    h('p', { class: 'lead' }, 'Touche ton prénom pour retrouver ta liste.'),
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
    h('h2', {}, first ? 'Crée ton profil' : 'Bienvenue !'),
    h('p', { class: 'lead' }, first ? 'Tu es le premier ! Les autres pourront te rejoindre ensuite.' : 'Dis-nous qui tu es, c’est tout.'),
    h('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/join', { method: 'POST', json: { name: name.value, avatar: chosen, pin: pin.value } });
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

// --- Application ---

async function showApp() {
  try {
    state.data = await api('/api/state');
  } catch (err) {
    if (err.status === 401) return showWelcome();
    throw err;
  }
  const ids = state.data.users.map((u) => u.id);
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (!ids.includes(state.selected)) state.selected = ids.includes(fromHash) ? fromHash : state.data.me.id;
  renderApp();
}

function renderApp() {
  const { me, users } = state.data;
  const ordered = [users.find((u) => u.id === me.id), ...users.filter((u) => u.id !== me.id)];
  const current = users.find((u) => u.id === state.selected);
  const mine = current.id === me.id;
  const taken = current.gifts.filter((g) => g.claimedBy).length;

  const people = h('nav', { class: 'people', 'aria-label': 'Listes de la famille' },
    ordered.map((u) =>
      h('button', {
        class: 'person' + (u.id === current.id ? ' on' : ''),
        'aria-current': u.id === current.id ? 'true' : null,
        onclick: () => {
          state.selected = u.id;
          history.replaceState(null, '', '#' + u.id);
          renderApp();
          window.scrollTo({ top: 0 });
        },
      },
      avatar(u, 56),
      u.gifts.length ? h('span', { class: 'n' }, String(u.gifts.length)) : null,
      h('span', { class: 'label' }, u.id === me.id ? 'Moi' : u.name)))
  );

  const subtitle = mine
    ? 'Les autres voient ta liste, mais pas qui réserve quoi.'
    : `${current.gifts.length} idée${current.gifts.length > 1 ? 's' : ''}${current.gifts.length ? ` · ${taken} déjà réservée${taken > 1 ? 's' : ''}` : ''}`;

  const head = h('div', { class: 'list-head' }, avatar(current, 64),
    h('div', {}, h('h2', {}, mine ? 'Ma liste de Noël' : `La liste de ${current.name}`), h('p', {}, subtitle)));

  const content = current.gifts.length
    ? h('div', { class: 'grid' }, sorted(current.gifts).map((g) => giftCard(g, mine)))
    : h('div', { class: 'empty' },
        h('div', { class: 'big', 'aria-hidden': 'true' }, '🎁'),
        h('p', {}, mine ? 'Ta liste est vide. Qu’est-ce qui te ferait plaisir ?' : `${current.name} n’a pas encore ajouté d’idées.`),
        mine ? h('button', { class: 'btn', onclick: () => openGiftDialog() }, 'Ajouter ma première idée') : null);

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'in' },
        h('div', { class: 'logo' }, h('span', { 'aria-hidden': 'true' }, '🎄'), 'Noël en famille'),
        h('span', { class: 'count' }, countdownText()),
        h('button', { class: 'me', onclick: openProfile, 'aria-label': 'Mon profil' }, avatar(me, 34), me.name))),
    h('main', { class: 'page' }, people, head, content),
    mine && current.gifts.length ? h('button', { class: 'btn fab', onclick: () => openGiftDialog() }, '＋ Ajouter une idée') : null
  );
}

const sorted = (gifts) => [...gifts].sort((a, b) => Number(b.love) - Number(a.love) || a.createdAt - b.createdAt);

function giftCard(g, mine) {
  const me = state.data.me;
  const claimed = g.claimedBy;
  const actions = h('div', { class: 'actions' });

  if (g.url) actions.append(h('a', { class: 'btn ghost small', href: g.url, target: '_blank', rel: 'noopener noreferrer' }, 'Voir le lien ↗'));

  if (mine) {
    actions.append(
      h('button', { class: 'btn ghost small', onclick: () => openGiftDialog(g) }, 'Modifier'),
      h('button', { class: 'btn ghost small danger', onclick: () => removeGift(g) }, 'Supprimer')
    );
  } else if (!claimed) {
    actions.append(h('button', { class: 'btn green small', onclick: () => claim(g) }, '🎁 Je m’en occupe'));
  } else if (claimed.id === me.id) {
    actions.append(h('button', { class: 'btn ghost small', onclick: () => claim(g) }, 'Annuler ma réservation'));
  }

  return h('article', { class: 'gift' + (claimed ? ' taken' : '') },
    h('div', { class: 'pic' },
      g.image ? h('img', { src: g.image, alt: '', loading: 'lazy' }) : h('span', { 'aria-hidden': 'true' }, '🎁'),
      g.love ? h('span', { class: 'chip' }, '❤️ Coup de cœur') : null,
      claimed ? h('span', { class: 'chip taken' }, claimed.id === me.id ? '✓ Tu l’offres' : `✓ ${claimed.name}`) : null),
    h('div', { class: 'body' },
      h('h3', {}, g.title),
      g.price ? h('p', { class: 'price' }, /[^\d.,\s]/.test(g.price) ? g.price : g.price + ' €') : null,
      g.note ? h('p', { class: 'note' }, g.note) : null,
      actions));
}

async function claim(g) {
  try {
    await api(`/api/gifts/${g.id}/claim`, { method: 'POST' });
    if (!g.claimedBy) toast('Réservé ! Personne d’autre ne le prendra 🤫');
  } catch (err) {
    toast(err.message);
  }
  showApp();
}

async function removeGift(g) {
  if (!confirm(`Supprimer « ${g.title} » de ta liste ?`)) return;
  await api(`/api/gifts/${g.id}`, { method: 'DELETE' });
  showApp();
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
  const pin = h('input', { type: 'password', maxLength: 40, placeholder: 'Nouveau code (4 caractères minimum)', autocomplete: 'new-password' });
  const error = h('p', { class: 'error', role: 'alert' });

  const dialog = openDialog(
    h('form', {
      method: 'dialog',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/profile', { method: 'PUT', json: { avatar: chosen, pin: pin.value } });
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
    h('label', { class: 'field', for: 'p-pin' }, me.hasPin ? 'Changer mon code' : 'Protéger mon profil avec un code (facultatif)'),
    Object.assign(pin, { id: 'p-pin' }),
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
          state.selected = null;
          showWelcome();
        },
      }, 'Me déconnecter'),
      h('button', { class: 'btn', type: 'submit' }, 'Enregistrer')))
  );
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

function openGiftDialog(gift) {
  const editing = Boolean(gift);
  let image = gift?.image || '';

  const url = h('input', { type: 'text', id: 'g-url', inputMode: 'url', placeholder: 'Colle le lien d’un site (facultatif)', value: gift?.url || '' });
  const title = h('input', { type: 'text', id: 'g-title', maxLength: 120, required: true, placeholder: 'Ex. Casque audio', value: gift?.title || '' });
  const price = h('input', { type: 'text', id: 'g-price', maxLength: 20, placeholder: 'Ex. 25', inputMode: 'decimal', value: gift?.price || '' });
  const note = h('textarea', { id: 'g-note', maxLength: 400, placeholder: 'Taille, couleur, marque…' }, gift?.note || '');
  const love = h('input', { type: 'checkbox', checked: Boolean(gift?.love) });
  const status = h('p', { class: 'status', role: 'status' });
  const error = h('p', { class: 'error', role: 'alert' });
  const thumb = h('div', { class: 'thumb' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const save = h('button', { class: 'btn', type: 'submit' }, editing ? 'Enregistrer' : 'Ajouter');
  const remove = h('button', { type: 'button', class: 'btn ghost small', onclick: () => { image = ''; drawThumb(); } }, 'Retirer la photo');

  function drawThumb() {
    thumb.replaceChildren(image ? h('img', { src: image, alt: '' }) : '📷');
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
            json: { title: title.value, url: url.value, price: price.value, note: note.value, love: love.checked, image },
          });
          dialog.close();
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
    h('label', { class: 'field', for: 'g-note' }, 'Précisions'), note,
    h('label', { class: 'field' }, 'Photo'),
    h('div', { class: 'photo' }, thumb,
      h('div', { class: 'col' }, h('button', { type: 'button', class: 'btn ghost small', onclick: () => file.click() }, 'Choisir une photo'), remove), file),
    h('label', { class: 'check' }, love, '❤️ C’est mon coup de cœur'),
    error,
    h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Annuler'), save))
  );

  drawThumb();
  (editing ? title : url).focus();
}

// --- Démarrage ---

setInterval(() => {
  if (state.data && !document.hidden && !document.querySelector('dialog[open]')) showApp().catch(() => {});
}, 30000);

showApp().catch(() => showWelcome());
