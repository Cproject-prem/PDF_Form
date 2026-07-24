#!/usr/bin/env bash
# =============================================================================
#  FormForge — one-shot migration helper
# =============================================================================
#
#  USAGE:
#    On the SOURCE machine:
#       ./migrate.sh export /path/to/output-dir
#           → produces  formforge-migration-YYYYMMDD.tar.gz  in that dir
#             (contains: source tree, mongo dump, uploads)
#
#    On the TARGET machine (fresh box with Docker installed):
#       ./migrate.sh import  /path/to/formforge-migration-YYYYMMDD.tar.gz
#           → unpacks source, boots the stack, restores DB + uploads
#
#  Prerequisites (both hosts):
#       * Docker 24+ and the compose plugin
#       * The source host must be running the FormForge docker-compose stack
#
#  Safe to re-run.  Never overwrites your local `backend/.env` on import.
# =============================================================================

set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'; NC=$'\033[0m'
log()  { printf "%s\n" "$*"; }
info() { printf "${BOLD}==>${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}✔${NC}  %s\n" "$*"; }
die()  { printf "${RED}✖${NC}  %s\n" "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
#  Sanity
# -----------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker is not installed."
docker compose version >/dev/null 2>&1 || die "'docker compose' plugin missing."

SCRIPT_DIR="$( cd "$(dirname "${BASH_SOURCE[0]}")" && pwd )"
cd "${SCRIPT_DIR}"

MODE="${1:-}"
TARGET_ARG="${2:-}"

usage() {
  sed -n '3,20p' "$0"
  exit 1
}

[ -z "$MODE" ] && usage

# -----------------------------------------------------------------------------
#  EXPORT
# -----------------------------------------------------------------------------
if [ "$MODE" = "export" ]; then
    OUT_DIR="${TARGET_ARG:-/tmp}"
    mkdir -p "$OUT_DIR"

    STAMP="$(date +%Y%m%d_%H%M%S)"
    STAGE="$(mktemp -d)"
    trap "rm -rf $STAGE" EXIT

    info "Bundling source tree …"
    tar czf "$STAGE/src.tar.gz" \
        --exclude=frontend/node_modules \
        --exclude=frontend/build \
        --exclude=backend/__pycache__ \
        --exclude=backend/uploads \
        --exclude=.git --exclude=.emergent \
        Dockerfile.backend Dockerfile.frontend docker-compose.yml \
        DOCKER.md nginx backend frontend migrate.sh 2>/dev/null || true
    ok "Source packaged."

    info "Snapshotting MongoDB …"
    MONGO_ID="$(docker compose ps -q mongo || true)"
    [ -z "$MONGO_ID" ] && die "Mongo container is not running. Start it first: docker compose up -d mongo"
    docker exec "$MONGO_ID" mongodump --archive --gzip --db formforge \
        > "$STAGE/mongo.archive" 2>/dev/null
    ok "Mongo dump ($(stat -c%s "$STAGE/mongo.archive" 2>/dev/null || \
                     stat -f%z "$STAGE/mongo.archive") bytes)."

    info "Snapshotting uploads volumes …"
    docker run --rm \
        -v formforge_uploads:/data/local \
        -v formforge_pdf_templates:/data/pdf \
        -v formforge_completed:/data/completed \
        -v formforge_assets:/data/assets \
        -v formforge_backups:/data/backups \
        -v "$STAGE":/out \
        alpine tar czf /out/uploads.tar.gz -C /data . 2>/dev/null
    ok "Uploads packaged."

    FINAL="$OUT_DIR/formforge-migration-${STAMP}.tar.gz"
    info "Creating final bundle: $FINAL"
    ( cd "$STAGE" && tar czf "$FINAL" src.tar.gz mongo.archive uploads.tar.gz )
    ok "Done.  File: $FINAL"
    log
    log "${DIM}Copy this single file to the target machine, then run:${NC}"
    log "    ./migrate.sh import  \"$(basename "$FINAL")\""
    exit 0
fi

# -----------------------------------------------------------------------------
#  IMPORT
# -----------------------------------------------------------------------------
if [ "$MODE" = "import" ]; then
    BUNDLE="$TARGET_ARG"
    [ -z "$BUNDLE" ] && die "Missing bundle path. Usage: ./migrate.sh import bundle.tar.gz"
    [ -f "$BUNDLE" ] || die "Bundle not found: $BUNDLE"

    STAGE="$(mktemp -d)"
    trap "rm -rf $STAGE" EXIT

    info "Extracting bundle …"
    tar xzf "$BUNDLE" -C "$STAGE"

    # 1) Source tree
    if [ ! -f "docker-compose.yml" ]; then
        info "Unpacking source tree into $(pwd) …"
        tar xzf "$STAGE/src.tar.gz"
    else
        info "Source tree already present in $(pwd) — skipping unpack."
    fi

    # 2) .env safety
    if [ ! -f backend/.env ]; then
        info "Seeding backend/.env from example (edit JWT_SECRET before exposing publicly!) …"
        cp backend/.env.example backend/.env
    fi

    # 3) Boot the stack
    info "Building & starting containers …"
    docker compose up -d --build

    info "Waiting for MongoDB to become healthy …"
    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
        HEALTH="$(docker compose ps mongo --format json 2>/dev/null | grep -o '"Health":"healthy"' || true)"
        if [ -n "$HEALTH" ]; then ok "Mongo is healthy."; break; fi
        sleep 5
        [ "$i" = "12" ] && die "Mongo failed to become healthy — check: docker compose logs mongo"
    done

    # 4) Restore Mongo dump
    info "Restoring MongoDB …"
    docker cp "$STAGE/mongo.archive" "$(docker compose ps -q mongo)":/tmp/mongo.archive
    docker compose exec -T mongo \
        mongorestore --archive=/tmp/mongo.archive --gzip --drop --nsInclude="formforge.*"
    ok "MongoDB restored."

    # 5) Restore uploads across all 5 named volumes
    info "Restoring uploads volumes …"
    docker run --rm \
        -v formforge_uploads:/data/local \
        -v formforge_pdf_templates:/data/pdf \
        -v formforge_completed:/data/completed \
        -v formforge_assets:/data/assets \
        -v formforge_backups:/data/backups \
        -v "$STAGE":/in \
        alpine sh -c "cd /data && tar xzf /in/uploads.tar.gz"
    ok "Uploads restored."

    # 6) Restart backend so it re-scans folders
    info "Restarting backend …"
    docker compose restart backend >/dev/null
    sleep 4

    log
    ok "Migration complete."
    log
    log "  Open ${BOLD}http://localhost/${NC} (or your LAN IP) and sign in."
    log "  Existing super-admin credentials came over with the DB dump."
    log
    log "  Follow-up commands:"
    log "    docker compose logs -f backend       ${DIM}# tail server logs${NC}"
    log "    docker compose ps                    ${DIM}# see 4 containers running${NC}"
    log "    docker compose down                  ${DIM}# stop (data preserved)${NC}"
    exit 0
fi

usage
