#!/usr/bin/env bash
# Nightly Skycave Postgres backup.
#
#   dump -> gzip -> keep the newest 14 locally -> copy off-site to Cloudflare R2.
#
# The local dumps guard against a bad migration or an accidental delete (restore
# in seconds). The R2 copy guards against losing the droplet itself. The R2 step
# is skipped cleanly until /root/.skycave-r2.env exists, so the local backup
# works the moment this is installed and off-site turns on later with no edit.
#
# Deployed to /root/skycave-backup.sh on the droplet; run nightly by cron
# (0 8 * * *). This copy is version control - edit here, then redeploy.
set -euo pipefail

BACKUP_DIR=/root/backups
KEEP=14
LOG=/var/log/skycave-backup.log
mkdir -p "$BACKUP_DIR"

ts=$(date -u +%Y%m%d-%H%M%SZ)
file="$BACKUP_DIR/skycave-$ts.sql.gz"

# --no-owner keeps the restore portable across roles.
if docker exec backend-db-1 pg_dump -U skycave --no-owner skycave | gzip > "$file"; then
  echo "$(date -u +%FT%TZ) dump ok $(basename "$file") ($(du -h "$file" | cut -f1))" >> "$LOG"
else
  echo "$(date -u +%FT%TZ) DUMP FAILED" >> "$LOG"
  rm -f "$file"
  exit 1
fi

# Rotate: keep the newest $KEEP local dumps, drop the rest.
ls -1t "$BACKUP_DIR"/skycave-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

# Off-site to Cloudflare R2, if configured.
if [ -f /root/.skycave-r2.env ] && command -v rclone >/dev/null; then
  # shellcheck disable=SC1091
  . /root/.skycave-r2.env
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  if rclone copy "$file" "R2:${R2_BUCKET}/" >> "$LOG" 2>&1; then
    echo "$(date -u +%FT%TZ) r2 upload ok $(basename "$file")" >> "$LOG"
  else
    echo "$(date -u +%FT%TZ) R2 UPLOAD FAILED $(basename "$file")" >> "$LOG"
  fi
else
  echo "$(date -u +%FT%TZ) r2 not configured, local only" >> "$LOG"
fi
