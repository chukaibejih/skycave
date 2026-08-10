# Ops — Skycave droplet (162.243.38.7)

Infra that lives on the droplet, kept under version control here so it is not
lost if the droplet is. Edit here, then redeploy the file to the droplet.

The app runs via `backend/docker-compose.yml`: `api`, `oauth-sidecar`, `db`
(Postgres, named volume `backend_pgdata`), `redis` (ephemeral).

## Database backups

`skycave-backup.sh` → deployed at `/root/skycave-backup.sh`.

- Nightly `pg_dump | gzip` to `/root/backups`, keeps the newest 14.
- Copies each dump off-site to Cloudflare R2 when `/root/.skycave-r2.env` exists.
- Cron: `0 8 * * * /root/skycave-backup.sh` (08:00 UTC ≈ 1 AM Pacific).
- Log: `/var/log/skycave-backup.log`.

**Redeploy after editing:**
```bash
scp ops/skycave-backup.sh root@162.243.38.7:/root/skycave-backup.sh
ssh root@162.243.38.7 chmod +x /root/skycave-backup.sh
```

**Off-site (R2) — one-time setup on the droplet** (secrets never in the repo):
```bash
cat > /root/.skycave-r2.env <<'EOF'
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=skycave-backups
EOF
chmod 600 /root/.skycave-r2.env
```
Create the bucket + an Object-Read/Write API token in the Cloudflare R2 dashboard
first. `rclone` (installed on the droplet) does the upload via S3-compatible env
config; no `rclone.conf` needed.

**Restore a dump** (into a fresh/empty DB):
```bash
zcat /root/backups/skycave-<ts>.sql.gz | docker exec -i backend-db-1 psql -U skycave skycave
```

**Before any migration or risky deploy:** run `/root/skycave-backup.sh` once by
hand for an immediate snapshot.

Also recommended: enable DigitalOcean automated droplet backups in the dashboard
as a second, whole-disk safety net.

## Posting / tournament cron

`skycave-post-cron.sh` (on the droplet at `/root/`) posts to @skycave.space by
hitting guarded `/internal/*` endpoints. Active crontab:

```
*/5 * * * *  /root/skycave-post-cron.sh announce-drain
15  0 * * *  /root/skycave-post-cron.sh daily-roundup
0  15 * * 1  /root/skycave-post-cron.sh tournaments/rotate
*/5 * * * *  /root/skycave-post-cron.sh tournaments/tick
0   8 * * *  /root/skycave-backup.sh
```

`tournaments/tick` drives the pre-day heads-up and the on-the-clock nudges for a
live cup; `tournaments/rotate` creates the coming weekend's tournament.
