#!/usr/bin/env bash
#
# Skycave backend deploy — interactive one-shot setup for a DigitalOcean droplet.
#
#   ./deploy.sh
#
# It will:
#   1. check prerequisites (docker, docker compose, openssl)
#   2. ask for your domain
#   3. generate the ES256 OAuth key + shared secrets (or let you paste your own)
#   4. write backend/.env and oauth-sidecar/.env
#   5. build + start the stack (api + oauth-sidecar + postgres + redis)
#   6. optionally install the nginx site + Let's Encrypt TLS
#
# Safe to re-run: it backs up existing .env files and never regenerates the
# OAuth key if one already exists.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
SIDECAR="$ROOT/oauth-sidecar"
KEY="$BACKEND/secrets/oauth-private-key.pem"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# docker compose v2 (`docker compose`) with a v1 (`docker-compose`) fallback.
compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@";
  else docker-compose "$@"; fi
}

# ── ask VAR "prompt" "default" ─────────────────────────────────────────────
ask() {
  local __var="$1" msg="$2" def="${3:-}" input
  if [ -n "$def" ]; then read -rp "  $msg [$def]: " input; else read -rp "  $msg: " input; fi
  printf -v "$__var" '%s' "${input:-$def}"
}

# ── secret VAR "prompt" [hex|b64] ── paste a value, or Enter to auto-generate ─
secret() {
  local __var="$1" msg="$2" kind="${3:-hex}" input def
  if [ "$kind" = "b64" ]; then def="$(openssl rand -base64 24)"; else def="$(openssl rand -hex 32)"; fi
  read -rp "  $msg [Enter = auto-generate]: " input
  printf -v "$__var" '%s' "${input:-$def}"
}

# ---------------------------------------------------------------------------
bold "Skycave backend deploy"
echo

# 1. Prerequisites
command -v docker  >/dev/null 2>&1 || die "docker not found. Install it: curl -fsSL https://get.docker.com | sh"
command -v openssl >/dev/null 2>&1 || die "openssl not found."
compose version >/dev/null 2>&1 || die "docker compose not found (need Docker Compose v2 or docker-compose)."
[ -f "$BACKEND/docker-compose.yml" ] || die "run this from the repo root (backend/docker-compose.yml missing)."
info "docker + compose + openssl present."
echo

# 2. Domain
bold "Domain"
ask DOMAIN "Apex domain (frontend)" "skycave.space"
ask API_HOST "API host (backend)" "api.$DOMAIN"
FRONTEND_URL="https://$DOMAIN"
API_URL="https://$API_HOST"
COOKIE_DOMAIN=".$DOMAIN"
echo
info "frontend : $FRONTEND_URL"
info "api      : $API_URL"
info "cookie   : $COOKIE_DOMAIN"
echo

# 3. Existing env handling
WRITE_ENV=yes
if [ -f "$BACKEND/.env" ] || [ -f "$SIDECAR/.env" ]; then
  warn "Existing .env file(s) found."
  ask REGEN "Regenerate env + secrets? Existing files are backed up. (y/N)" "N"
  case "$REGEN" in [yY]*) WRITE_ENV=yes ;; *) WRITE_ENV=no ;; esac
fi

if [ "$WRITE_ENV" = yes ]; then
  echo
  bold "Secrets  (press Enter to auto-generate strong values)"
  secret JWT_SECRET            "JWT_SECRET"
  secret OAUTH_INTERNAL_SECRET "OAUTH_INTERNAL_SECRET (shared api<->sidecar)"
  secret SESSION_SECRET        "SESSION_SECRET (cookie signing)"
  secret ADMIN_PASSWORD        "ADMIN_PASSWORD (/admin login)" b64
  echo

  ts="$(date +%Y%m%d-%H%M%S)"
  [ -f "$BACKEND/.env" ] && cp "$BACKEND/.env" "$BACKEND/.env.bak.$ts" && warn "backed up backend/.env -> .env.bak.$ts"
  [ -f "$SIDECAR/.env" ] && cp "$SIDECAR/.env" "$SIDECAR/.env.bak.$ts" && warn "backed up oauth-sidecar/.env -> .env.bak.$ts"

  # backend/.env  (DATABASE_URL / REDIS_URL / OAUTH_SIDECAR_URL come from compose)
  cat > "$BACKEND/.env" <<EOF
ENV=production
PUBLIC_API_URL=$API_URL
FRONTEND_URL=$FRONTEND_URL
CORS_ORIGINS=$FRONTEND_URL

JWT_SECRET=$JWT_SECRET
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080

ADMIN_PASSWORD=$ADMIN_PASSWORD
OAUTH_INTERNAL_SECRET=$OAUTH_INTERNAL_SECRET
EOF
  chmod 600 "$BACKEND/.env"

  # oauth-sidecar/.env  (OAUTH_PRIVATE_KEY_FILE + PORT come from compose)
  cat > "$SIDECAR/.env" <<EOF
PUBLIC_OAUTH_BASE=$API_URL/oauth
FRONTEND_URL=$FRONTEND_URL
SESSION_SECRET=$SESSION_SECRET
OAUTH_INTERNAL_SECRET=$OAUTH_INTERNAL_SECRET
COOKIE_DOMAIN=$COOKIE_DOMAIN
COOKIE_SECURE=true
EOF
  chmod 600 "$SIDECAR/.env"
  info "wrote backend/.env + oauth-sidecar/.env (chmod 600)"
else
  info "keeping existing .env files."
fi
echo

# 4. ES256 OAuth key — generate only if absent (regenerating invalidates the client)
bold "OAuth signing key"
if [ -f "$KEY" ]; then
  info "key already exists ($KEY) — keeping it."
else
  mkdir -p "$BACKEND/secrets"
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve \
    | openssl pkcs8 -topk8 -nocrypt -outform pem > "$KEY"
  chmod 600 "$KEY"
  info "generated ES256 key -> $KEY"
fi
echo

# 5. Swap — recommended on 1 GB droplets (the image build OOMs without it)
bold "Swap"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
have_swap="$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}')"; have_swap="${have_swap:-0}"
total_ram="$(free -m 2>/dev/null | awk '/^Mem:/ {print $2}')"; total_ram="${total_ram:-0}"
info "RAM: ${total_ram} MB   swap: ${have_swap} MB"
def_swap=N
[ "$have_swap" -lt 512 ] && [ "$total_ram" -lt 1600 ] && def_swap=Y && \
  warn "Low memory with little/no swap — the build will likely OOM. Adding swap is recommended."
ask DOSWAP "Add a swap file? (y/N)" "$def_swap"
case "$DOSWAP" in [yY]*)
  ask SWAPSIZE "Swap size" "2G"
  if swapon --show=NAME --noheadings 2>/dev/null | grep -qx /swapfile || [ -e /swapfile ]; then
    warn "/swapfile already exists — enabling it, not recreating."
    $SUDO swapon /swapfile 2>/dev/null || true
  else
    if ! $SUDO fallocate -l "$SWAPSIZE" /swapfile 2>/dev/null; then
      num="${SWAPSIZE%[gG]}"; $SUDO dd if=/dev/zero of=/swapfile bs=1M count="$(( num * 1024 ))" status=none
    fi
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile >/dev/null
    $SUDO swapon /swapfile
    info "swap enabled."
  fi
  # Persist across reboots + prefer RAM (no duplicate lines on re-run).
  grep -q '^/swapfile ' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  if ! grep -q '^vm.swappiness' /etc/sysctl.conf 2>/dev/null; then
    $SUDO sysctl -w vm.swappiness=10 >/dev/null
    echo 'vm.swappiness=10' | $SUDO tee -a /etc/sysctl.conf >/dev/null
  fi
  free -h 2>/dev/null | awk '/^Swap:/ {print "  swap now: total " $2 ", used " $3}'
;; *) info "Skipped swap." ;; esac
echo

# 6. Build + start
ask UP "Build and start the stack now? (Y/n)" "Y"
case "$UP" in [nN]*) ;; *)
  bold "Bringing up the stack (this compiles images — a few minutes on first run)"
  ( cd "$BACKEND" && compose up -d --build )
  echo
  info "waiting for health..."
  for i in $(seq 1 30); do
    if curl -fsS localhost:8000/health >/dev/null 2>&1 && curl -fsS localhost:8001/healthz >/dev/null 2>&1; then
      info "api + sidecar healthy."; break
    fi
    sleep 2
    [ "$i" = 30 ] && warn "services not healthy yet — check: (cd backend && $(compose version >/dev/null 2>&1 && echo 'docker compose' || echo docker-compose) logs -f)"
  done
;; esac
echo

# 7. Optional nginx + TLS
bold "nginx + TLS (optional — needs root; skip if you handle nginx separately)"
ask DONGINX "Install the nginx site for $API_HOST and get a cert now? (y/N)" "N"
case "$DONGINX" in [yY]*)
  command -v nginx  >/dev/null 2>&1 || die "nginx not installed (apt-get install -y nginx certbot python3-certbot-nginx)"
  tmp="$(mktemp)"
  # Point the repo's nginx.conf at this domain.
  sed "s/api\.skycave\.space/$API_HOST/g" "$BACKEND/nginx.conf" > "$tmp"
  $SUDO cp "$tmp" "/etc/nginx/sites-available/$API_HOST"
  $SUDO ln -sf "/etc/nginx/sites-available/$API_HOST" "/etc/nginx/sites-enabled/$API_HOST"
  rm -f "$tmp"
  $SUDO nginx -t && $SUDO systemctl reload nginx
  info "nginx site installed. Requesting certificate..."
  $SUDO certbot --nginx -d "$API_HOST"
;; *)
  info "Skipped. To do it manually later:"
  info "  sed 's/api.skycave.space/$API_HOST/g' backend/nginx.conf | sudo tee /etc/nginx/sites-available/$API_HOST"
  info "  sudo ln -sf /etc/nginx/sites-available/$API_HOST /etc/nginx/sites-enabled/"
  info "  sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d $API_HOST"
;; esac

echo
bold "Done."
if [ "$WRITE_ENV" = yes ]; then
  echo
  warn "SAVE THIS — the admin password is only shown now:"
  printf '    ADMIN_PASSWORD = %s\n' "$ADMIN_PASSWORD"
fi
echo
info "Verify once DNS + TLS are up:"
info "  curl -s $API_URL/health"
info "  curl -s $API_URL/oauth/client-metadata.json"
info "  curl -s -o /dev/null -w '%{http_code}\\n' $API_URL/oauth/session   # expect 404"
echo
info "DNS needed:  A  $API_HOST  ->  <this droplet's IP>"
info "Frontend (Vercel) env:"
info "  NEXT_PUBLIC_API_URL=$API_URL"
info "  NEXT_PUBLIC_WS_URL=${API_URL/https:/wss:}"
info "  NEXT_PUBLIC_SITE_URL=$FRONTEND_URL"
