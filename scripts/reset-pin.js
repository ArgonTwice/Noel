// Usage : npm run reset-pin -- "Prénom" nouveau-code
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPin } from '../auth.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(process.env.DATA_DIR || path.join(root, 'data'), 'data.json');
const [name, pin] = process.argv.slice(2);

if (!name || !pin || pin.length < 4) {
  console.error('Usage : npm run reset-pin -- "Prénom" nouveau-code (4 caractères minimum)');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const user = db.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
if (!user) {
  console.error(`Aucun utilisateur "${name}". Utilisateurs : ${db.users.map((u) => u.name).join(', ')}`);
  process.exit(1);
}

Object.assign(user, hashPin(pin));
fs.writeFileSync(file, JSON.stringify(db, null, 2));
console.log(`Code de ${user.name} mis à jour. Redémarre le serveur pour être sûr.`);
