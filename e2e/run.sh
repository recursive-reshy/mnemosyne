#!/usr/bin/env bash
# Builds and starts the Compose stack against the local fakes, runs the Playwright tests,
# and always tears the stack down with its volume. Needs Docker running. Never touches
# the real instance: own project name, own port (3101), temp vault and backups folders.
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[ 0 ]}" )/.." && pwd )"
cd "$ROOT"

PROJECT=mnemosyne-e2e
COMPOSE=( docker compose -p "$PROJECT" --project-directory "$ROOT" -f "$ROOT/docker-compose.yml" -f "$ROOT/e2e/docker-compose.e2e.yml" )

VAULT_HOST_PATH="$( mktemp -d )"
BACKUP_HOST_PATH="$( mktemp -d )"
AGENT_SECRET="$( openssl rand -hex 32 )"
TOKEN_ENCRYPTION_KEY="$( openssl rand -base64 32 )"
printf '# Existing note\n\nA note that was already in the vault.\n' > "$VAULT_HOST_PATH/Existing note.md"
node "$ROOT/e2e/fakes/seedVault.mjs" "$VAULT_HOST_PATH"

chmod -R 777 "$VAULT_HOST_PATH" "$BACKUP_HOST_PATH"

export VAULT_HOST_PATH BACKUP_HOST_PATH AGENT_SECRET TOKEN_ENCRYPTION_KEY
export ANTHROPIC_API_KEY=e2e

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans || true
  rm -rf "$VAULT_HOST_PATH" "$BACKUP_HOST_PATH"
}
trap cleanup EXIT

"${COMPOSE[@]}" up -d --build --wait

cd e2e
pnpm exec playwright install chromium
E2E_VAULT_DIR="$VAULT_HOST_PATH" E2E_BACKUP_DIR="$BACKUP_HOST_PATH" pnpm exec playwright test
