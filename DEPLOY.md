# Skycave — Deployment Runbook

Target architecture:

- **Frontend** → Vercel (Next.js), served at **`https://skycave.space`**
- **Backend** → DigitalOcean droplet via Docker Compose: FastAPI (`api`) +
  Node OAuth sidecar (`oauth-sidecar`) + Postgres (`db`) + Redis (`redis`),
  behind host **nginx** at **`https://api.skycave.space`**
- Only nginx is publicly exposed; api/sidecar/db/redis bind to `127.0.0.1`.

`skycave.space` and `api.skycave.space` share the same registrable domain, so the
OAuth session cookie (`Domain=.skycave.space`, `SameSite=Lax`) is sent on the
frontend → api credentialed request. **The frontend must be on `skycave.space`
(not `*.vercel.app`) for Bluesky login to work.**

---

## 0. Prerequisites

- A DigitalOcean droplet (Ubuntu 22.04+, 2GB+ RAM), with Docker + Docker Compose
  and nginx + certbot installed.
- Access to the `skycave.space` DNS (registrar or DigitalOcean DNS).
- A Vercel account with this repo connected.

```bash
# On a fresh droplet:
curl -fsSL https://get.docker.com | sh
apt-get install -y nginx certbot python3-certbot-nginx
```

---

## 1. DNS

| Record | Host | Value |
|--------|------|-------|
| A | `api.skycave.space` | `<droplet IP>` |
| (Vercel) | `skycave.space` | per Vercel's domain instructions (apex A or `cname.vercel-dns.com`) |

Do the `api` record now; do the Vercel `skycave.space` record in step 5.

---

## 1.5 Swap — REQUIRED on a 1 GB droplet

Without swap, `docker compose build` (compiling cryptography/asyncpg + the
sidecar's npm install) will exceed 1 GB and get OOM-killed. Add 2 GB once:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10        # prefer RAM; use swap mainly for spikes
echo 'vm.swappiness=10' >> /etc/sysctl.conf
free -h                            # confirm Swap: 2.0Gi
```

> On 1 GB, expect slower builds. If a build still struggles, build images one at
> a time: `docker compose build api && docker compose build oauth-sidecar`.
> Resizing to 2 GB later in DigitalOcean is one click and non-destructive.

---

## 2. Droplet: clone + secrets

```bash
git clone <your-repo> skycave && cd skycave

# --- ES256 OAuth key (mounted into the sidecar) ---
mkdir -p backend/secrets
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve \
  | openssl pkcs8 -topk8 -nocrypt -outform pem > backend/secrets/oauth-private-key.pem
chmod 600 backend/secrets/oauth-private-key.pem

# --- Generate shared secrets (save these) ---
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "OAUTH_INTERNAL_SECRET=$(openssl rand -hex 32)"   # must match in both .env files
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "ADMIN_PASSWORD=$(openssl rand -base64 24)"
```

### `backend/.env`
```ini
ENV=production
PUBLIC_API_URL=https://api.skycave.space
FRONTEND_URL=https://skycave.space
# Credentialed cookie call requires the explicit origin (NOT "*")
CORS_ORIGINS=https://skycave.space

JWT_SECRET=<paste>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080

ADMIN_PASSWORD=<paste>
OAUTH_INTERNAL_SECRET=<paste — same value as sidecar>
# DATABASE_URL / REDIS_URL / OAUTH_SIDECAR_URL are set by docker-compose.
```

### `oauth-sidecar/.env`
```ini
PUBLIC_OAUTH_BASE=https://api.skycave.space/oauth
FRONTEND_URL=https://skycave.space
SESSION_SECRET=<paste>
OAUTH_INTERNAL_SECRET=<paste — same value as backend>
COOKIE_DOMAIN=.skycave.space
COOKIE_SECURE=true
# OAUTH_PRIVATE_KEY_FILE + PORT are set by docker-compose.
```

---

## 3. Droplet: bring up the stack

```bash
cd backend
docker compose up -d --build
docker compose ps          # api, oauth-sidecar, db, redis all healthy
curl -s localhost:8000/health        # {"status":"ok"}
curl -s localhost:8001/healthz       # {"status":"ok"}
```

---

## 4. Droplet: nginx + TLS

```bash
# Install the site config (the repo's backend/nginx.conf)
cp backend/nginx.conf /etc/nginx/sites-available/api.skycave.space
ln -sf /etc/nginx/sites-available/api.skycave.space /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# TLS (certbot injects the 443 server + http->https redirect)
certbot --nginx -d api.skycave.space
```

Verify:
```bash
curl -s https://api.skycave.space/health                      # ok
curl -s https://api.skycave.space/oauth/client-metadata.json  # the OAuth client doc
curl -s -o /dev/null -w "%{http_code}\n" https://api.skycave.space/oauth/session  # 404 (never public)
```

---

## 5. Frontend: Vercel

1. Import the repo in Vercel; set **Root Directory = `frontend`**.
2. Environment variables (Production):
   ```
   NEXT_PUBLIC_API_URL=https://api.skycave.space
   NEXT_PUBLIC_WS_URL=wss://api.skycave.space
   ```
3. Deploy.
4. Add the custom domain **`skycave.space`** in Vercel → follow its DNS prompt
   (add the apex A / `cname.vercel-dns.com` record). **Required for OAuth** — the
   frontend must be on `skycave.space`, not the `*.vercel.app` URL.

> Flag assets + globe texture are committed under `frontend/public/`, so no
> build-time asset fetch is needed. (If ever starting clean: `npm run fetch:assets`.)

---

## 6. Verify end-to-end

- [ ] `https://skycave.space` loads the hub with 6 games.
- [ ] Create a room → invite link is `https://skycave.space/room/...`.
- [ ] Guest vs guest game plays through to the score card.
- [ ] **Bluesky login:** "Continue with Bluesky" → redirects to your PDS →
      back to `skycave.space/oauth` → logged in (avatar/handle top-right).
      A `User` row appears; play a game and confirm stats update in `/admin`.
- [ ] `https://api.skycave.space/admin` → log in with `ADMIN_PASSWORD`.
- [ ] WebSocket reconnect: background the mobile tab mid-game, return → resumes.

---

## Operations

- **Logs:** `docker compose logs -f api oauth-sidecar`
- **Update:** `git pull && docker compose up -d --build`
- **Rotate admin password:** edit `backend/.env` → `docker compose up -d api`
- **Backups:** Postgres data is in the `pgdata` volume — schedule
  `docker compose exec db pg_dump -U skycave skycave > backup.sql`.
- **Scaling note:** the WS connection registry + round timers are in-process
  (single `api` worker). Horizontal scaling needs Redis pub/sub for broadcasts
  and a Redis lock in `room_manager` (documented in `DEVIATIONS.md`).

## Secrets checklist (never commit)

`backend/.env`, `oauth-sidecar/.env`, `backend/secrets/oauth-private-key.pem` —
all gitignored. `OAUTH_INTERNAL_SECRET` must be identical in both `.env` files.
