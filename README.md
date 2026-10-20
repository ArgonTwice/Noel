# 🎄 Noël en famille

Un petit site pour que chacun note ses envies de cadeaux de Noël, et que les autres les découvrent.

- Chacun a son espace (prénom + code secret).
- On ajoute un cadeau avec un nom, un lien, un prix, une note et une photo.
  Si tu colles le lien d'un site marchand, le nom et l'image sont récupérés automatiquement.
- Chacun voit les listes des autres et peut cliquer sur **« Je m'en occupe »** pour réserver un cadeau.
  La personne concernée ne voit jamais qui a réservé quoi, la surprise reste entière.

Aucune dépendance : Node 20+ suffit (testé avec Node 22). Les données sont stockées dans `data/` (un fichier JSON et les photos).

## Lancer en local

```sh
npm start            # http://localhost:3000
```

Variables d'environnement :

| Variable        | Rôle                                                              | Défaut   |
|-----------------|-------------------------------------------------------------------|----------|
| `PORT`          | Port d'écoute                                                     | `3000`   |
| `DATA_DIR`      | Dossier des données                                               | `./data` |
| `FAMILY_CODE`   | Code demandé à l'inscription (évite que n'importe qui s'inscrive) | vide     |
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
- **À distance** : passe par un reverse proxy HTTPS (Cloudflare Tunnel, Tailscale Funnel, ou le DDNS et la redirection de port de ta box), puis mets `COOKIE_SECURE=1`. Garde un `FAMILY_CODE` : sans lui, quiconque connaît l'adresse peut créer un compte.

## Code secret oublié

```sh
npm run reset-pin -- "Prénom" nouveau-code
```

Dans Docker : `docker exec noel node scripts/reset-pin.js "Prénom" nouveau-code`

## Structure

```
server.js        serveur HTTP et API
auth.js          hachage des codes secrets
public/          interface (HTML, CSS, JS sans framework)
scripts/         outil de réinitialisation des codes
```
