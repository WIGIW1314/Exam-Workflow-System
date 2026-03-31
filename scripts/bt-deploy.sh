#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-exam-workflow-system}"
APP_ROOT="${APP_ROOT:-/www/wwwroot/${APP_NAME}}"
WEB_ROOT="${WEB_ROOT:-/www/wwwroot/${APP_NAME}-web}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"
DOMAIN="${DOMAIN:-_}"
CORS_ORIGIN="${CORS_ORIGIN:-http://${DOMAIN}}"
RUN_SEED="${RUN_SEED:-false}"
INSTALL_PM2="${INSTALL_PM2:-true}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() {
  printf '\n[%s] %s\n' "$(date '+%F %T')" "$1"
}

ensure_command() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd"
    echo "Please install it first: $install_hint"
    exit 1
  fi
}

prepare_node() {
  if ! command -v node >/dev/null 2>&1; then
    log "Node.js was not found. Installing Node.js ${NODE_MAJOR}"
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    if command -v yum >/dev/null 2>&1; then
      yum install -y nodejs
    else
      apt-get update
      apt-get install -y nodejs
    fi
  fi

  ensure_command corepack "Node.js 自带 corepack"
  corepack enable
  corepack prepare pnpm@10.33.0 --activate
}

prepare_repo() {
  mkdir -p "$APP_ROOT"
  if [ -n "$REPO_URL" ] && [ ! -d "$APP_ROOT/.git" ]; then
    log "Cloning repository into $APP_ROOT"
    rm -rf "$APP_ROOT"
    git clone -b "$BRANCH" "$REPO_URL" "$APP_ROOT"
  fi

  if [ ! -f "$APP_ROOT/package.json" ]; then
    echo "package.json was not found. Check APP_ROOT=$APP_ROOT or provide REPO_URL."
    exit 1
  fi

  cd "$APP_ROOT"

  if [ -d .git ]; then
    log "Syncing Git branch $BRANCH"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
  else
    log "Current directory is not a Git repository. Skipping pull and deploying current files"
  fi
}

prepare_env() {
  mkdir -p "$APP_ROOT/logs" "$WEB_ROOT"

  if [ ! -f "$APP_ROOT/packages/server/.env" ]; then
    log "Creating server .env file"
    cp "$APP_ROOT/packages/server/.env.example" "$APP_ROOT/packages/server/.env"
  fi

  python3 - <<PY
from pathlib import Path
env_path = Path(r"$APP_ROOT/packages/server/.env")
content = env_path.read_text(encoding="utf-8")
updates = {
    "PORT": "$PORT",
    "CORS_ORIGIN": "$CORS_ORIGIN",
}
for key, value in updates.items():
    marker = f"{key}="
    lines = content.splitlines()
    replaced = False
    for idx, line in enumerate(lines):
        if line.startswith(marker):
            lines[idx] = f'{key}="{value}"'
            replaced = True
            break
    if not replaced:
        lines.append(f'{key}="{value}"')
    content = "\n".join(lines) + "\n"
env_path.write_text(content, encoding="utf-8")
PY
}

build_project() {
  log "Installing dependencies"
  pnpm install --frozen-lockfile || pnpm install

  log "Syncing database schema"
  pnpm db:migrate

  if [ "$RUN_SEED" = "true" ]; then
    log "Running seed data"
    pnpm db:seed
  fi

  log "Building project"
  pnpm build
}

deploy_static() {
  log "Publishing frontend assets to $WEB_ROOT"
  rm -rf "$WEB_ROOT"/*
  cp -r "$APP_ROOT/packages/client/dist/." "$WEB_ROOT/"
}

start_server() {
  if [ "$INSTALL_PM2" = "true" ] && ! command -v pm2 >/dev/null 2>&1; then
    log "Installing PM2"
    npm install -g pm2
  fi

  ensure_command pm2 "npm install -g pm2"

  log "Starting or reloading PM2 process"
  APP_ROOT="$APP_ROOT" PORT="$PORT" pm2 startOrReload "$APP_ROOT/scripts/pm2.exam-workflow.config.cjs"
  pm2 save
}

print_next_steps() {
  cat <<EOF

Deployment completed.

Paths:
  APP_ROOT = $APP_ROOT
  WEB_ROOT = $WEB_ROOT
  PORT     = $PORT

Suggested BaoTa Nginx setup:
  site root  : $WEB_ROOT
  /api       -> http://127.0.0.1:$PORT
  /socket.io -> http://127.0.0.1:$PORT

Clone-and-deploy example:
  REPO_URL="https://github.com/WIGIW1314/Exam-Workflow-System.git" BRANCH="main" bash scripts/bt-deploy.sh

First deployment with seed data:
  RUN_SEED=true bash scripts/bt-deploy.sh
EOF
}

main() {
  ensure_command git "yum install git / apt-get install git"
  ensure_command curl "yum install curl / apt-get install curl"
  ensure_command python3 "yum install python3 / apt-get install python3"

  prepare_node
  prepare_repo
  prepare_env
  build_project
  deploy_static
  start_server
  print_next_steps
}

main "$@"
