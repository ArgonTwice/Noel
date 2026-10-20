// Version démo : remplace le serveur par un faux serveur dans le navigateur (localStorage).
// Utilisé uniquement par le index.html à la racine (GitHub Pages), jamais par le vrai site.
(() => {
  window.NOEL_DEMO = true;

  const KEY = 'noel-demo-v1';
  const AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐧', '🦉', '🐙', '🦄', '🐢', '🐰', '🎅', '🤶', '⛄', '🦌', '🧝', '🐶', '🐱', '🐨'];
  const uid = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  const art = (emoji, c1, c2) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="132" font-size="100" text-anchor="middle">${emoji}</text></svg>`
    );

  function seed() {
    const users = [
      { id: uid(), name: 'Maman', avatar: '🤶' },
      { id: uid(), name: 'Papa', avatar: '🎅' },
      { id: uid(), name: 'Léa', avatar: '🦄', letter: 'Cette année j’ai été super sage (presque). Je rêve d’une licorne géante et de plein de livres !' },
      { id: uid(), name: 'Tom', avatar: '🐻', letter: 'Cher Père Noël, je veux tout ce qui fait du bruit.' },
    ];
    const [maman, papa, lea, tom] = users.map((u) => u.id);
    const now = Date.now();
    const g = (userId, i, f) => ({ id: uid(), userId, claimedBy: null, createdAt: now - i * 3600e3, url: '', price: '', note: '', category: '', love: false, image: '', ...f });
    const gifts = [
      g(lea, 1, { title: 'Peluche licorne géante', price: '29', category: 'Jeux & loisirs', love: true, note: 'Rose pâle, avec une corne dorée', url: 'https://www.amazon.fr/', image: art('🦄', '#fbd3e9', '#e6b3f5'), claimedBy: papa }),
      g(lea, 2, { title: 'Coffret Harry Potter illustré', price: '49,90', category: 'Livres', url: 'https://www.fnac.com/', image: art('📚', '#ffe3a3', '#f6b26b') }),
      g(lea, 3, { title: 'Palette de maquillage pailletée', price: '24', category: 'Beauté', note: 'Les tons roses', url: 'https://www.sephora.fr/', image: art('💄', '#ffd1dc', '#ff9eb5') }),
      g(tom, 4, { title: 'Casque audio sans fil', price: '89', category: 'High-tech', love: true, note: 'Noir, avec réduction de bruit', url: 'https://www.fnac.com/', image: art('🎧', '#cfd8ff', '#8fa3ff'), claimedBy: maman }),
      g(tom, 5, { title: 'Ballon de foot taille 5', price: '25', category: 'Sport', url: 'https://www.decathlon.fr/', image: art('⚽', '#d6f5d6', '#8ed48e') }),
      g(tom, 6, { title: 'LEGO Technic Bugatti', price: '59', category: 'Jeux & loisirs', love: true, url: 'https://www.lego.com/', image: art('🏎️', '#ffd6d6', '#ff8f8f') }),
      g(maman, 7, { title: 'Plaid en laine douce', price: '45', category: 'Maison', love: true, note: 'Beige ou gris clair', image: art('🧣', '#f3e3cf', '#d9b99b') }),
      g(maman, 8, { title: 'Bougie parfumée « Noël »', price: '18', category: 'Maison', image: art('🕯️', '#fff1c9', '#f7c873') }),
      g(papa, 9, { title: 'Coffret de chocolats noirs', price: '20', category: 'Gourmandise', love: true, image: art('🍫', '#e7d3c3', '#a47551') }),
      g(papa, 10, { title: 'Thermos inox 1 L', price: '30', category: 'Sport', url: 'https://www.decathlon.fr/', image: art('🫖', '#d9e8f5', '#9ec1e6') }),
    ];
    return { users, gifts, me: null };
  }

  let db;
  try {
    db = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  if (!db) db = seed();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
  };

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = (status, error) => json(status, { error });
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  const PAPERS = ['airmail', 'holly', 'gold', 'snow'];
  const pub = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || '🎅', hasPin: Boolean(u.pin), letter: u.letter || '', paper: PAPERS.includes(u.paper) ? u.paper : 'airmail' });

  function derange(ids) {
    let to;
    do {
      to = [...ids].sort(() => Math.random() - 0.5);
    } while (to.some((id, i) => id === ids[i]));
    return Object.fromEntries(ids.map((id, i) => [id, to[i]]));
  }
  const me = () => db.users.find((u) => u.id === db.me);

  function fields(b) {
    const title = clean(b.title, 120);
    if (!title) return null;
    let url = clean(b.url, 1000);
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return { title, url, price: clean(b.price, 20), note: clean(b.note, 400), category: clean(b.category, 30), love: Boolean(b.love), image: clean(b.image, 400000) };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    await new Promise((r) => setTimeout(r, 60));

    const method = init.method || 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : {};
    const path = url.split('?')[0];

    if (path === '/api/config') return json(200, { locked: false, avatars: AVATARS, users: db.users.map(pub) });

    if (path === '/api/join') {
      const name = clean(body.name, 30);
      if (!name) return fail(400, 'Indique ton prénom');
      if (db.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) return fail(409, 'Ce prénom existe déjà : touche-le dans la liste pour te connecter');
      const pin = clean(body.pin, 40);
      if (pin && pin.length < 4) return fail(400, 'Ton code doit faire au moins 4 caractères');
      const user = { id: uid(), name, avatar: AVATARS.includes(body.avatar) ? body.avatar : '🎅', pin };
      db.users.push(user);
      db.me = user.id;
      save();
      return json(200, { ok: true });
    }

    if (path === '/api/login') {
      const user = db.users.find((u) => u.id === body.id);
      if (!user) return fail(404, 'Profil introuvable');
      if (user.pin && user.pin !== clean(body.pin, 40)) return fail(401, 'Code incorrect');
      db.me = user.id;
      save();
      return json(200, { ok: true });
    }

    if (path === '/api/logout') {
      db.me = null;
      save();
      return json(200, { ok: true });
    }

    const user = me();
    if (!user) return fail(401, 'Non connecté');

    if (path === '/api/state') {
      const byId = Object.fromEntries(db.users.map((u) => [u.id, u]));
      return json(200, {
        me: pub(user),
        users: db.users.map((u) => ({
          ...pub(u),
          gifts: db.gifts.filter((x) => x.userId === u.id).map(({ claimedBy, userId, bought, ...x }) => ({
            ...x,
            claimedBy: u.id === user.id ? null : claimedBy ? { id: claimedBy, name: byId[claimedBy]?.name || '?' } : null,
            bought: u.id !== user.id && claimedBy === user.id && Boolean(bought),
          })),
        })),
        draw: db.draw && {
          at: db.draw.at,
          by: db.draw.by,
          budget: db.draw.budget || '',
          count: Object.keys(db.draw.pairs).length,
          target: db.users.filter((u) => u.id === db.draw.pairs[user.id]).map(pub)[0] || null,
        },
      });
    }

    if (path === '/api/draw') {
      if (db.draw && !body.redo) return fail(409, 'Le tirage a déjà eu lieu');
      if (db.users.length < 3) return fail(400, 'Il faut au moins 3 personnes pour un tirage');
      db.draw = { at: Date.now(), by: user.name, budget: clean(body.budget, 20), pairs: derange(db.users.map((u) => u.id)) };
      save();
      return json(200, { ok: true });
    }

    if (path === '/api/profile' && method === 'PUT') {
      if (body.avatar && AVATARS.includes(body.avatar)) user.avatar = body.avatar;
      if (typeof body.letter === 'string') user.letter = clean(body.letter, 600);
      if (PAPERS.includes(body.paper)) user.paper = body.paper;
      if (body.pin === null) user.pin = '';
      else if (typeof body.pin === 'string' && body.pin.trim()) {
        if (body.pin.trim().length < 4) return fail(400, 'Ton code doit faire au moins 4 caractères');
        user.pin = body.pin.trim();
      }
      save();
      return json(200, { ok: true });
    }

    if (path === '/api/preview') {
      // Pas de lecture de pages dans la démo : on devine un titre à partir de l'adresse
      const slug = decodeURIComponent((body.url || '').split('?')[0].split('/').filter(Boolean).pop() || '');
      const title = /\./.test(slug) && !/-/.test(slug) ? '' : slug.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '');
      return json(200, { title: title ? title.charAt(0).toUpperCase() + title.slice(1) : '', image: null });
    }

    if (path === '/api/upload') {
      const blob = init.body;
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return json(200, { image });
    }

    if (path === '/api/gifts' && method === 'POST') {
      const f = fields(body);
      if (!f) return fail(400, 'Donne un nom à ce cadeau');
      db.gifts.push({ id: uid(), userId: user.id, claimedBy: null, createdAt: Date.now(), ...f });
      save();
      return json(200, { ok: true });
    }

    const m = path.match(/^\/api\/gifts\/([a-f0-9]+)(\/claim|\/bought)?$/);
    const gift = m && db.gifts.find((x) => x.id === m[1]);
    if (!gift) return fail(404, 'Introuvable');

    if (m[2] === '/claim') {
      if (gift.userId === user.id) return fail(403, 'Tu ne peux pas réserver ton propre cadeau');
      if (gift.claimedBy && gift.claimedBy !== user.id) return fail(409, 'Déjà réservé par quelqu’un d’autre');
      gift.claimedBy = gift.claimedBy ? null : user.id;
      gift.bought = false;
      save();
      return json(200, { ok: true });
    }

    if (m[2] === '/bought') {
      if (gift.claimedBy !== user.id) return fail(403, 'Tu ne l’as pas réservé');
      gift.bought = !gift.bought;
      save();
      return json(200, { ok: true });
    }

    if (gift.userId !== user.id) return fail(403, 'Ce n’est pas ta liste');
    if (method === 'PUT') {
      const f = fields(body);
      if (!f) return fail(400, 'Donne un nom à ce cadeau');
      Object.assign(gift, f);
    } else if (method === 'DELETE') {
      db.gifts = db.gifts.filter((x) => x.id !== gift.id);
    }
    save();
    return json(200, { ok: true });
  };
})();
