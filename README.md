# 🎄 Noël en famille

Un petit site pour que chacun note ses envies de cadeaux de Noël, et que les autres les découvrent.

- **Pas de mot de passe** : à la première visite, on crée son profil (prénom + avatar). Sur le même appareil, on est reconnu automatiquement. Sur un autre appareil, on touche son prénom dans la liste.
- **Code facultatif** : chacun peut protéger son profil avec un petit code (4 caractères minimum), ou non.
- **Code famille** (facultatif, recommandé si le site est sur Internet) : demandé une seule fois par appareil, avant de voir les profils.
- On ajoute une idée avec un nom, un lien, un prix, une note, une photo et un ❤️ coup de cœur.
  En collant le lien d'un site marchand, le nom et l'image sont récupérés automatiquement.
- Chacun voit les listes des autres et peut cliquer sur **« Je m'en occupe »** pour réserver un cadeau.
  La personne concernée ne voit jamais qui a réservé quoi, la surprise reste entière.

Aucune dépendance : Node 20+ suffit (testé avec Node 22). Les données sont dans `data/` (un fichier JSON et les photos).

> Sans code, n'importe qui de la famille peut ouvrir le profil d'un autre. C'est voulu pour rester simple : mets un code sur ton profil si ça te gêne.

## Lancer en local

```sh
npm start            # http://localhost:3000
```

| Variable        | Rôle                                                              | Défaut   |
|-----------------|-------------------------------------------------------------------|----------|
| `PORT`          | Port d'écoute                                                     | `3000`   |
| `DATA_DIR`      | Dossier des données                                               | `./data` |
| `FAMILY_CODE`   | Code famille demandé une fois par appareil                        | vide     |
| `COOKIE_SECURE` | `1` si le site est servi en HTTPS                                 | `0`      |

## Sur le NAS (Docker)

```sh
git clone https://github.com/ArgonTwice/Noel.git
cd Noel
# modifie FAMILY_CODE dans docker-compose.yml
docker compose up -d --build
```

Le site est alors disponible sur `http://IP-DU-NAS:3000`. Les données restent dans le dossier `data/` à côté du `docker-compose.yml` : pense à le sauvegarder.

### Le partager avec la famille

- **Même maison / même Wi-Fi** : l'adresse `http://IP-DU-NAS:3000` suffit.
- **À distance** : passe par un reverse proxy HTTPS (Cloudflare Tunnel, Tailscale Funnel, ou le DDNS et la redirection de port de ta box), puis mets `COOKIE_SECURE=1`. Garde un `FAMILY_CODE` : sans lui, quiconque connaît l'adresse peut créer un profil.
- Sur téléphone, « Ajouter à l'écran d'accueil » donne une icône comme une application.

## Code oublié

```sh
npm run reset-pin -- "Prénom" nouveau-code     # définir un code
npm run reset-pin -- "Prénom" -                # retirer le code
```

Dans Docker : `docker exec noel node scripts/reset-pin.js "Prénom" nouveau-code`

## Structure

```
server.js        serveur HTTP et API
auth.js          hachage des codes
public/          interface (HTML, CSS, JS sans framework)
scripts/         outil de réinitialisation des codes
```
