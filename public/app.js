'use strict';

const app = document.getElementById('app');
const state = { config: null, data: null, selected: null, tab: 'login' };

// --- Aides ---

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
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

// --- Connexion ---

async function showLogin(message) {
  state.data = null;
  state.config = await api('/api/config');
  if (!state.config.names.length) state.tab = 'register';
  renderLogin(message);
}

function renderLogin(message) {
  const registering = state.tab === 'register';
  const error = h('p', { class: 'error', role: 'alert' }, message || '');
  let chosen = '';

  const pin = h('input', { type: 'password', id: 'pin', autocomplete: registering ? 'new-password' : 'current-password', required: true });
  const nameInput = h('input', { type: 'text', id: 'name', maxLength: 30, autocomplete: 'given-name', required: true });
  const codeInput = h('input', { type: 'password', id: 'fam', autocomplete: 'off' });

  const names = h(
    'div',
    { class: 'names' },
    state.config.names.map((n) =>
      h('button', {
        type: 'button',
        onclick: (e) => {
          chosen = n;
          names.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
          pin.focus();
        },
      }, n)
    )
  );

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        const name = registering ? nameInput.value.trim() : chosen;
        if (!name) {
          error.textContent = registering ? 'Indique ton prénom' : 'Touche ton prénom dans la liste';
          return;
        }
        try {
          await api(registering ? '/api/register' : '/api/login', {
            method: 'POST',
            json: { name, pin: pin.value, familyCode: codeInput.value },
          });
          await showApp();
        } catch (err) {
          error.textContent = err.message;
        }
      },
    },
    registering
      ? [h('label', { for: 'name' }, 'Ton prénom'), nameInput]
      : [h('label', {}, 'Qui es-tu ?'), names],
    h('label', { for: 'pin' }, registering ? 'Choisis un code secret (4 caractères minimum)' : 'Ton code secret'),
    pin,
    registering && state.config.needsCode ? [h('label', { for: 'fam' }, 'Code famille (demande-le à la famille)'), codeInput] : null,
    error,
    h('button', { class: 'btn full', type: 'submit' }, registering ? 'Créer mon espace' : 'Entrer')
  );

  const tab = (id, label) =>
    h('button', {
      type: 'button',
      class: state.tab === id ? 'on' : '',
      onclick: () => {
        state.tab = id;
        renderLogin();
      },
    }, label);

  app.replaceChildren(
    h(
      'div',
      { class: 'login' },
      h('div', { class: 'tree', 'aria-hidden': 'true' }, '🎄'),
      h('h1', {}, 'Noël en famille'),
      h('p', { class: 'sub' }, 'Note tes envies, découvre celles des autres.'),
      h('div', { class: 'panel' }, state.config.names.length ? h('div', { class: 'tabs' }, tab('login', 'Je me connecte'), tab('register', 'Je m’inscris')) : null, form)
    )
  );
}

// --- Application ---

async function showApp() {
  try {
    state.data = await api('/api/state');
  } catch (err) {
    if (err.status === 401) return showLogin();
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

  const people = h(
    'nav',
    { class: 'people', 'aria-label': 'Listes de la famille' },
    ordered.map((u) =>
      h('button', {
        class: 'person' + (u.id === current.id ? ' on' : ''),
        onclick: () => {
          state.selected = u.id;
          history.replaceState(null, '', '#' + u.id);
          renderApp();
        },
      }, u.id === me.id ? 'Ma liste' : u.name, h('small', {}, String(u.gifts.length)))
    )
  );

  const head = h(
    'div',
    { class: 'section-head' },
    h('div', {}, h('h2', {}, mine ? 'Ma liste de Noël' : `Liste de ${current.name}`),
      mine ? h('p', { class: 'hint' }, 'Les autres voient ta liste, mais pas qui réserve quoi : la surprise reste entière.') : null),
    mine ? h('button', { class: 'btn', onclick: () => openGiftDialog() }, '＋ Ajouter un cadeau') : null
  );

  let content;
  if (!current.gifts.length) {
    content = h('div', { class: 'empty' }, h('div', { class: 'big', 'aria-hidden': 'true' }, '🎁'),
      h('p', {}, mine ? 'Ta liste est vide. Ajoute ta première envie !' : `${current.name} n’a encore rien ajouté.`));
  } else {
    content = h('div', { class: 'grid' }, current.gifts.map((g) => giftCard(g, mine)));
  }

  app.replaceChildren(
    h('header', { class: 'top' },
      h('h1', {}, '🎄 Noël en famille'),
      h('div', { class: 'who' }, `Salut ${me.name}`,
        h('button', { class: 'btn ghost small', onclick: logout }, 'Quitter'))),
    people, head, content
  );
}

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

  return h(
    'article',
    { class: 'gift' + (claimed ? ' taken' : '') },
    h('div', { class: 'pic' }, g.image ? h('img', { src: g.image, alt: '', loading: 'lazy' }) : h('span', { 'aria-hidden': 'true' }, '🎁')),
    h('div', { class: 'body' },
      claimed ? h('span', { class: 'badge' }, claimed.id === me.id ? '✓ Tu l’offres' : `✓ Pris par ${claimed.name}`) : null,
      h('h3', {}, g.title),
      g.price ? h('p', { class: 'price' }, /[^\d.,\s]/.test(g.price) ? g.price : g.price + ' €') : null,
      g.note ? h('p', { class: 'note' }, g.note) : null,
      actions)
  );
}

async function claim(g) {
  try {
    await api(`/api/gifts/${g.id}/claim`, { method: 'POST' });
  } catch (err) {
    alert(err.message);
  }
  showApp();
}

async function removeGift(g) {
  if (!confirm(`Supprimer « ${g.title} » de ta liste ?`)) return;
  await api(`/api/gifts/${g.id}`, { method: 'DELETE' });
  showApp();
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  state.selected = null;
  state.tab = 'login';
  showLogin();
}

// --- Ajout / modification d'un cadeau ---

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
  const title = h('input', { type: 'text', id: 'g-title', maxLength: 120, required: true, value: gift?.title || '' });
  const price = h('input', { type: 'text', id: 'g-price', maxLength: 20, placeholder: 'ex. 25', inputMode: 'decimal', value: gift?.price || '' });
  const note = h('textarea', { id: 'g-note', maxLength: 400, placeholder: 'Taille, couleur, marque…' }, gift?.note || '');
  const status = h('p', { class: 'status', role: 'status' });
  const error = h('p', { class: 'error', role: 'alert' });
  const thumb = h('div', { class: 'thumb' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const save = h('button', { class: 'btn', type: 'submit' }, editing ? 'Enregistrer' : 'Ajouter');

  const drawThumb = () => {
    thumb.replaceChildren(image ? h('img', { src: image, alt: '' }) : '📷');
    remove.hidden = !image;
  };
  const remove = h('button', { type: 'button', class: 'btn ghost small', onclick: () => { image = ''; drawThumb(); } }, 'Retirer la photo');

  async function fetchPreview() {
    const link = url.value.trim();
    if (!link) return;
    status.textContent = 'Je regarde ce lien…';
    try {
      const p = await api('/api/preview', { method: 'POST', json: { url: link } });
      if (p.title && !title.value.trim()) title.value = p.title;
      if (p.image && !image) image = p.image;
      drawThumb();
      status.textContent = p.title || p.image ? 'C’est rempli, vérifie et ajuste si besoin.' : 'Rien trouvé sur ce lien, remplis à la main.';
    } catch {
      status.textContent = 'Impossible de lire ce lien, remplis à la main.';
    }
  }
  url.addEventListener('change', () => { if (!editing || !title.value.trim()) fetchPreview(); });

  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    status.textContent = 'Envoi de la photo…';
    try {
      const blob = await resizeImage(file.files[0]);
      image = (await api('/api/upload', { method: 'POST', raw: blob })).image;
      drawThumb();
      status.textContent = '';
    } catch (err) {
      status.textContent = err.message;
    }
  });

  const dialog = h(
    'dialog',
    { onclose: () => dialog.remove() },
    h(
      'form',
      {
        method: 'dialog',
        onsubmit: async (e) => {
          e.preventDefault();
          error.textContent = '';
          save.disabled = true;
          try {
            await api(editing ? `/api/gifts/${gift.id}` : '/api/gifts', {
              method: editing ? 'PUT' : 'POST',
              json: { title: title.value, url: url.value, price: price.value, note: note.value, image },
            });
            dialog.close();
            showApp();
          } catch (err) {
            error.textContent = err.message;
            save.disabled = false;
          }
        },
      },
      h('h2', {}, editing ? 'Modifier le cadeau' : 'Nouveau cadeau'),
      h('label', { for: 'g-url' }, 'Lien'),
      url,
      status,
      h('label', { for: 'g-title' }, 'Nom du cadeau'),
      title,
      h('label', { for: 'g-price' }, 'Prix approximatif (€)'),
      price,
      h('label', { for: 'g-note' }, 'Précisions'),
      note,
      h('label', {}, 'Photo'),
      h('div', { class: 'photo' }, thumb,
        h('div', { class: 'col' }, h('button', { type: 'button', class: 'btn ghost small', onclick: () => file.click() }, 'Choisir une photo'), remove), file),
      error,
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Annuler'), save)
    )
  );

  drawThumb();
  document.body.append(dialog);
  dialog.showModal();
  (editing ? title : url).focus();
}

// --- Démarrage ---

setInterval(() => {
  if (state.data && !document.hidden && !document.querySelector('dialog[open]')) showApp().catch(() => {});
}, 30000);

showApp().catch(() => showLogin());
