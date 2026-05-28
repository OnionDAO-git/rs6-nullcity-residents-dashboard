#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Deploy the NullCity residents dashboard to Railway.

Required environment:
  LANDING_DATABASE_URL       Existing landing-2026 Postgres URL. Use a read-only user if possible.

Common options:
  RAILWAY_PROJECT_ID         Existing Railway project ID. Alias: PROJECT_ID.
  RAILWAY_PROJECT_NAME       Existing/create project name. Alias: PROJECT_NAME. Default: nullcity
  RAILWAY_WORKSPACE          Workspace ID or name for project creation.
  RAILWAY_SELECT_PROJECT     1 to force workspace/project prompts, 0 to disable, auto by default.
  RAILWAY_ENVIRONMENT        Environment name. Alias: RAILWAY_ENV. Default: production
  RAILWAY_APP_SERVICE        App service name. Default: residents-dashboard
  RAILWAY_SERVER_GAME_SERVICE nullcity-server game service name. Default: game
  RAILWAY_POSTGRES_SERVICE   City Postgres service name used in reference vars. Default: Postgres
  AGENT_GATEWAY_URL          Defaults to ws://${{game.RAILWAY_PRIVATE_DOMAIN}}:43595.
  AGENT_GATEWAY_TOKEN        Defaults to ${{game.AGENT_GATEWAY_AUTH_TOKEN}}.
  NULLCITY_RS_HOST           Defaults to ${{game.RAILWAY_PRIVATE_DOMAIN}}:43594.
  NIXPACKS_NODE_VERSION      Node major version for Nixpacks builds. Default: 22
  CITY_PRINT_BRIDGE_TOKEN    Shared LAN print bridge token. Reused from service when set,
                             generated when no service token exists.
  CUSTOM_DOMAIN              Optional custom domain to attach, for example city.oniondao.dev.
  CITY_PUBLIC_BASE_URL       Public base URL. Default: https://city.oniondao.dev
  ENV_FILE                   Optional file to source before reading config, for example .env.production
  SKIP_DEPLOY=1              Configure Railway without uploading a deployment.
  SKIP_DOMAIN=1              Do not create or update a Railway/custom domain.
  DRY_RUN=1                  Print the high-level plan without changing Railway.

Examples:
  ENV_FILE=.env.production ./railway-deploy.sh
  PROJECT_ID=... CUSTOM_DOMAIN=city.oniondao.dev ./railway-deploy.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -n "${ENV_FILE:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ENV_FILE does not exist: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

RAILWAY_PROJECT_ID="${RAILWAY_PROJECT_ID:-${PROJECT_ID:-}}"
RAILWAY_PROJECT_NAME="${RAILWAY_PROJECT_NAME:-${PROJECT_NAME:-nullcity}}"
RAILWAY_WORKSPACE="${RAILWAY_WORKSPACE:-${WORKSPACE:-}}"
RAILWAY_SELECT_PROJECT="${RAILWAY_SELECT_PROJECT:-auto}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-${RAILWAY_ENV:-production}}"
RAILWAY_APP_SERVICE="${RAILWAY_APP_SERVICE:-residents-dashboard}"
RAILWAY_SERVER_GAME_SERVICE="${RAILWAY_SERVER_GAME_SERVICE:-game}"
RAILWAY_POSTGRES_SERVICE="${RAILWAY_POSTGRES_SERVICE:-Postgres}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-}"
CITY_PUBLIC_BASE_URL="${CITY_PUBLIC_BASE_URL:-https://city.oniondao.dev}"
LANDING_AUTH_BASE_URL="${LANDING_AUTH_BASE_URL:-https://oniondao.dev}"
AUTH_COOKIE_NAME="${AUTH_COOKIE_NAME:-session}"
AUTH_COOKIE_DOMAIN="${AUTH_COOKIE_DOMAIN:-.oniondao.dev}"
SESSION_COOKIE_SECURE="${SESSION_COOKIE_SECURE:-true}"
DASHBOARD_HOST="${DASHBOARD_HOST:-0.0.0.0}"
DASHBOARD_PORT="${DASHBOARD_PORT:-}"
NIXPACKS_NODE_VERSION="${NIXPACKS_NODE_VERSION:-22}"
DEPLOY_MESSAGE="${DEPLOY_MESSAGE:-Configure and deploy residents dashboard}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_DEPLOY="${SKIP_DEPLOY:-0}"
SKIP_DOMAIN="${SKIP_DOMAIN:-0}"
SKIP_POSTGRES="${SKIP_POSTGRES:-0}"
CREATE_NEW_PROJECT_SELECTED=0
APP_SERVICE_CREATED=0
NULLCITY_RS_PORT="${NULLCITY_RS_PORT:-43594}"
AGENT_GATEWAY_PORT="${AGENT_GATEWAY_PORT:-43595}"
NULLCITY_SERVER_PRIVATE_DOMAIN_REF="\${{${RAILWAY_SERVER_GAME_SERVICE}.RAILWAY_PRIVATE_DOMAIN}}"
AGENT_GATEWAY_URL="${AGENT_GATEWAY_URL:-ws://${NULLCITY_SERVER_PRIVATE_DOMAIN_REF}:${AGENT_GATEWAY_PORT}}"
AGENT_GATEWAY_TOKEN="${AGENT_GATEWAY_TOKEN:-\${{${RAILWAY_SERVER_GAME_SERVICE}.AGENT_GATEWAY_AUTH_TOKEN}}}"
NULLCITY_RS_HOST="${NULLCITY_RS_HOST:-${NULLCITY_SERVER_PRIVATE_DOMAIN_REF}:${NULLCITY_RS_PORT}}"
CITY_PRINT_BRIDGE_TOKEN="${CITY_PRINT_BRIDGE_TOKEN:-}"

export RAILWAY_CALLER="${RAILWAY_CALLER:-script:residents-dashboard-railway-deploy}"
export RAILWAY_AGENT_SESSION="${RAILWAY_AGENT_SESSION:-railway-deploy-$(date +%Y%m%d%H%M%S)-$$}"

log() {
  printf '[railway-deploy] %s\n' "$*"
}

die() {
  printf '[railway-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "Missing required environment variable: $name"
}

can_prompt() {
  if [[ "$RAILWAY_SELECT_PROJECT" == "0" ]]; then
    return 1
  fi
  if [[ "$RAILWAY_SELECT_PROJECT" == "1" ]]; then
    [[ -t 0 && -t 1 ]] || die "RAILWAY_SELECT_PROJECT=1 requires an interactive terminal"
    return 0
  fi
  [[ -t 0 && -t 1 && "${CI:-}" != "true" ]]
}

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[railway-deploy] DRY RUN:'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

run_quiet() {
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN: $1"
  else
    shift
    "$@" >/dev/null
  fi
}

parse_project_id() {
  jq -r '.projectId // .project.id // .project_id // empty'
}

project_list_filter() {
  jq --arg workspace "$RAILWAY_WORKSPACE" '
    [
      .[]
      | select(.deletedAt == null)
      | select($workspace == "" or .workspace.id == $workspace or .workspace.name == $workspace)
    ]
  '
}

status_project_id() {
  local status_json
  status_json="$(railway status --json 2>/dev/null || true)"
  if [[ -n "$status_json" ]]; then
    printf '%s' "$status_json" | parse_project_id
  fi
}

select_workspace_from_projects() {
  local projects_json="$1"
  local workspace_count
  workspace_count="$(printf '%s' "$projects_json" | jq '
    [
      .[]
      | select(.deletedAt == null)
      | .workspace
      | select(.id and .name)
    ]
    | unique_by(.id)
    | length
  ')"

  if (( workspace_count == 0 )); then
    return 0
  fi

  printf '\nAvailable Railway workspaces:\n' >&2
  printf '%s' "$projects_json" | jq -r '
    [
      .[]
      | select(.deletedAt == null)
      | .workspace
      | select(.id and .name)
    ]
    | unique_by(.id)
    | sort_by(.name)
    | to_entries[]
    | "\(.key + 1)) \(.value.name) [\(.value.id)]"
  ' >&2
  printf '0) All workspaces / default workspace\n' >&2

  local choice
  while true; do
    read -r -p "Select workspace [0]: " choice
    choice="${choice:-0}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 0 && choice <= workspace_count )); then
      break
    fi
    printf 'Enter a number from 0 to %s.\n' "$workspace_count" >&2
  done

  if (( choice == 0 )); then
    return 0
  fi

  RAILWAY_WORKSPACE="$(printf '%s' "$projects_json" | jq -r --argjson index "$((choice - 1))" '
    [
      .[]
      | select(.deletedAt == null)
      | .workspace
      | select(.id and .name)
    ]
    | unique_by(.id)
    | sort_by(.name)
    | .[$index].id
  ')"
  log "Selected workspace $RAILWAY_WORKSPACE"
}

select_project_from_projects() {
  local projects_json="$1"
  local linked_project_id="$2"
  local filtered_json
  local project_count

  filtered_json="$(printf '%s' "$projects_json" | project_list_filter)"
  project_count="$(printf '%s' "$filtered_json" | jq 'length')"

  if (( project_count == 0 )); then
    log "No existing projects found for the selected workspace"
    CREATE_NEW_PROJECT_SELECTED=1
    return 1
  fi

  printf '\nAvailable Railway projects:\n' >&2
  printf '%s' "$filtered_json" | jq -r '
    sort_by(.workspace.name, .name)
    | to_entries[]
    | "\(.key + 1)) \(.value.name) [\(.value.id)] - \(.value.workspace.name)"
  ' >&2
  printf '0) Create new project "%s"\n' "$RAILWAY_PROJECT_NAME" >&2
  if [[ -n "$linked_project_id" ]]; then
    printf 'Press Enter to keep linked project [%s].\n' "$linked_project_id" >&2
  fi

  local choice
  while true; do
    read -r -p "Select project: " choice
    if [[ -z "$choice" && -n "$linked_project_id" ]]; then
      RAILWAY_PROJECT_ID="$linked_project_id"
      log "Using linked Railway project $RAILWAY_PROJECT_ID"
      return 0
    fi
    choice="${choice:-0}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 0 && choice <= project_count )); then
      break
    fi
    printf 'Enter a number from 0 to %s.\n' "$project_count" >&2
  done

  if (( choice == 0 )); then
    CREATE_NEW_PROJECT_SELECTED=1
    return 1
  fi

  RAILWAY_PROJECT_ID="$(printf '%s' "$filtered_json" | jq -r --argjson index "$((choice - 1))" '
    sort_by(.workspace.name, .name)
    | .[$index].id
  ')"
  log "Selected Railway project $RAILWAY_PROJECT_ID"
}

select_project_interactively() {
  local linked_project_id="$1"
  local projects_json

  log "Loading Railway projects for selection"
  projects_json="$(railway list --json)"

  if [[ -z "$RAILWAY_WORKSPACE" ]]; then
    select_workspace_from_projects "$projects_json"
  fi

  select_project_from_projects "$projects_json" "$linked_project_id"
}

find_project_id_by_name() {
  local projects_json
  local matches
  projects_json="$(railway list --json 2>/dev/null || true)"
  if [[ -z "$projects_json" ]]; then
    return 1
  fi

  matches="$(printf '%s' "$projects_json" | jq -r --arg name "$RAILWAY_PROJECT_NAME" --arg workspace "$RAILWAY_WORKSPACE" '
    [
      .[]
      | select(.deletedAt == null)
      | select(.name == $name)
      | select($workspace == "" or .workspace.id == $workspace or .workspace.name == $workspace)
    ] as $matches
    | if ($matches | length) == 1 then
        $matches[0].id
      elif ($matches | length) > 1 then
        "MULTIPLE\n" + (
          $matches
          | sort_by(.workspace.name, .name)
          | map("  \(.name) [\(.id)] - \(.workspace.name)")
          | join("\n")
        )
      else
        empty
      end
  ')"

  if [[ "$matches" == MULTIPLE* ]]; then
    printf '%s\n' "$matches" | sed '1d' >&2
    die "Multiple Railway projects named '$RAILWAY_PROJECT_NAME'. Set RAILWAY_WORKSPACE or RAILWAY_PROJECT_ID."
  fi

  [[ -n "$matches" ]] || return 1
  printf '%s' "$matches"
}

environment_exists() {
  local env_json
  env_json="$(railway environment list --json)"
  printf '%s' "$env_json" | jq -e --arg name "$RAILWAY_ENVIRONMENT" '
    def environments:
      if type == "array" then .
      elif .environments then .environments
      elif .data then .data
      else []
      end;
    environments
    | map(select((.name? // .environmentName? // .) == $name or (.id? // "") == $name))
    | length > 0
  ' >/dev/null
}

service_exists() {
  local service_name="$1"
  local service_json
  local args=()
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    args+=(--project "$RAILWAY_PROJECT_ID")
  fi
  service_json="$(railway service list --environment "$RAILWAY_ENVIRONMENT" "${args[@]}" --json)"
  printf '%s' "$service_json" | jq -e --arg name "$service_name" '
    def services:
      if type == "array" then .
      elif .services then .services
      elif .data then .data
      else []
      end;
    services
    | map(select((.name? // .serviceName? // .) == $name or (.id? // "") == $name))
    | length > 0
  ' >/dev/null
}

set_service_var() {
  local key="$1"
  local value="$2"
  local args=(--service "$RAILWAY_APP_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --skip-deploys --json)
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    args+=(--project "$RAILWAY_PROJECT_ID")
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN: set $key on $RAILWAY_APP_SERVICE"
  else
    printf '%s' "$value" | railway variable set "$key" --stdin "${args[@]}" >/dev/null
  fi
}

set_optional_service_var() {
  local key="$1"
  local value="${2:-}"
  if [[ -n "$value" ]]; then
    set_service_var "$key" "$value"
  fi
}

service_variable_value() {
  local key="$1"
  local variable_json
  local args=(--service "$RAILWAY_APP_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --json)
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    args+=(--project "$RAILWAY_PROJECT_ID")
  fi

  variable_json="$(railway variable list "${args[@]}" 2>/dev/null || true)"
  if [[ -z "$variable_json" ]]; then
    return 1
  fi

  printf '%s' "$variable_json" | jq -r --arg key "$key" '
    def value_from_object:
      .[$key] // .variables?[$key] // .data?[$key] // empty;
    def value_from_array:
      map(select((.name? // .key? // .variableName? // "") == $key))
      | first
      | (.value? // .rawValue? // .val? // empty);
    if type == "object" then
      if (.variables? | type) == "array" then
        .variables | value_from_array
      elif (.data? | type) == "array" then
        .data | value_from_array
      else
        value_from_object
      end
    elif type == "array" then
      value_from_array
    else
      empty
    end
  '
}

generate_print_bridge_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
    return
  fi
  die "CITY_PRINT_BRIDGE_TOKEN is unset and openssl is unavailable for generating one"
}

resolve_print_bridge_token() {
  if [[ -n "$CITY_PRINT_BRIDGE_TOKEN" ]]; then
    log "Using CITY_PRINT_BRIDGE_TOKEN from environment"
    return
  fi

  local existing_token
  existing_token="$(service_variable_value CITY_PRINT_BRIDGE_TOKEN || true)"
  if [[ -n "$existing_token" ]]; then
    CITY_PRINT_BRIDGE_TOKEN="$existing_token"
    log "Reusing existing CITY_PRINT_BRIDGE_TOKEN from $RAILWAY_APP_SERVICE"
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    CITY_PRINT_BRIDGE_TOKEN="dry-run-generated-print-bridge-token"
    log "DRY RUN: would generate CITY_PRINT_BRIDGE_TOKEN when no existing service token is found"
    return
  fi

  CITY_PRINT_BRIDGE_TOKEN="$(generate_print_bridge_token)"
  if [[ "$APP_SERVICE_CREATED" == "1" ]]; then
    log "Generated CITY_PRINT_BRIDGE_TOKEN for new $RAILWAY_APP_SERVICE service"
  else
    log "Generated missing CITY_PRINT_BRIDGE_TOKEN for existing $RAILWAY_APP_SERVICE service"
  fi
}

ensure_project() {
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    log "Linking Railway project $RAILWAY_PROJECT_ID"
    run_quiet "link project" railway link --project "$RAILWAY_PROJECT_ID" --json
    return
  fi

  local linked_project_id
  linked_project_id="$(status_project_id)"

  CREATE_NEW_PROJECT_SELECTED=0
  if can_prompt && select_project_interactively "$linked_project_id"; then
    run_quiet "link project" railway link --project "$RAILWAY_PROJECT_ID" --json
    return
  fi
  if [[ "$CREATE_NEW_PROJECT_SELECTED" == "1" ]]; then
    linked_project_id=""
  fi

  RAILWAY_PROJECT_ID="$linked_project_id"
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    log "Using linked Railway project $RAILWAY_PROJECT_ID"
    return
  fi

  if [[ "$CREATE_NEW_PROJECT_SELECTED" != "1" ]]; then
    local named_project_id
    named_project_id="$(find_project_id_by_name || true)"
    if [[ -n "$named_project_id" ]]; then
      RAILWAY_PROJECT_ID="$named_project_id"
      log "Using existing Railway project $RAILWAY_PROJECT_NAME ($RAILWAY_PROJECT_ID)"
      run_quiet "link project" railway link --project "$RAILWAY_PROJECT_ID" --json
      return
    fi
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN: would create Railway project $RAILWAY_PROJECT_NAME"
    RAILWAY_PROJECT_ID="dry-run-project"
    return
  fi

  local init_args=(init --name "$RAILWAY_PROJECT_NAME" --json)
  if [[ -n "$RAILWAY_WORKSPACE" ]]; then
    init_args+=(--workspace "$RAILWAY_WORKSPACE")
  fi

  log "Creating Railway project $RAILWAY_PROJECT_NAME"
  run_quiet "create project" railway "${init_args[@]}"
  RAILWAY_PROJECT_ID="$(status_project_id)"
  [[ -n "$RAILWAY_PROJECT_ID" ]] || die "Could not resolve Railway project ID after project creation"
  log "Created and linked Railway project $RAILWAY_PROJECT_ID"
}

ensure_environment() {
  log "Ensuring Railway environment $RAILWAY_ENVIRONMENT"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN: would create or link environment $RAILWAY_ENVIRONMENT"
    return
  fi

  if environment_exists; then
    run_quiet "link environment" railway environment link "$RAILWAY_ENVIRONMENT" --json
    return
  fi

  run_quiet "create environment" railway environment new "$RAILWAY_ENVIRONMENT" --json
  run_quiet "link environment" railway environment link "$RAILWAY_ENVIRONMENT" --json
}

ensure_app_service() {
  log "Ensuring app service $RAILWAY_APP_SERVICE"
  APP_SERVICE_CREATED=0
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN: would create app service when missing"
    return
  fi

  if service_exists "$RAILWAY_APP_SERVICE"; then
    return
  fi
  APP_SERVICE_CREATED=1
  run_quiet "create app service" railway add --service "$RAILWAY_APP_SERVICE" --json
}

ensure_postgres_service() {
  if [[ "$SKIP_POSTGRES" == "1" ]]; then
    return 0
  fi

  log "Ensuring city Postgres service $RAILWAY_POSTGRES_SERVICE"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN: would create city Postgres service when missing"
    return
  fi

  if service_exists "$RAILWAY_POSTGRES_SERVICE"; then
    return
  fi

  if [[ "$RAILWAY_POSTGRES_SERVICE" != "Postgres" ]]; then
    die "Postgres service '$RAILWAY_POSTGRES_SERVICE' does not exist. Create it first or use RAILWAY_POSTGRES_SERVICE=Postgres so this script can provision the default Railway Postgres service."
  fi

  run_quiet "create Postgres service" railway add --database postgres --json
}

configure_variables() {
  local city_database_url
  city_database_url="${CITY_DATABASE_URL:-\${{ ${RAILWAY_POSTGRES_SERVICE}.DATABASE_URL }}}"

  log "Configuring production variables on $RAILWAY_APP_SERVICE"
  set_service_var DASHBOARD_HOST "$DASHBOARD_HOST"
  set_optional_service_var DASHBOARD_PORT "$DASHBOARD_PORT"
  set_service_var NIXPACKS_NODE_VERSION "$NIXPACKS_NODE_VERSION"
  set_service_var CITY_DATABASE_URL "$city_database_url"
  set_service_var LANDING_DATABASE_URL "$LANDING_DATABASE_URL"
  set_service_var LANDING_AUTH_BASE_URL "$LANDING_AUTH_BASE_URL"
  set_service_var AUTH_COOKIE_NAME "$AUTH_COOKIE_NAME"
  set_service_var AUTH_COOKIE_DOMAIN "$AUTH_COOKIE_DOMAIN"
  set_service_var SESSION_COOKIE_SECURE "$SESSION_COOKIE_SECURE"
  set_service_var CITY_PUBLIC_BASE_URL "$CITY_PUBLIC_BASE_URL"
  set_service_var AGENT_GATEWAY_URL "$AGENT_GATEWAY_URL"
  set_service_var AGENT_GATEWAY_TOKEN "$AGENT_GATEWAY_TOKEN"
  set_service_var NULLCITY_RS_HOST "$NULLCITY_RS_HOST"
  set_service_var CITY_PRINT_BRIDGE_TOKEN "$CITY_PRINT_BRIDGE_TOKEN"

  set_optional_service_var NULLCITY_RS_SECURE "${NULLCITY_RS_SECURE:-}"
  set_optional_service_var CITY_SOUL_BASE_BIRTH_AP "${CITY_SOUL_BASE_BIRTH_AP:-}"
  set_optional_service_var CITY_SOUL_SKILL_LEVEL_AP "${CITY_SOUL_SKILL_LEVEL_AP:-}"
  set_optional_service_var CITY_SOUL_EQUIPMENT_GP_PER_AP "${CITY_SOUL_EQUIPMENT_GP_PER_AP:-}"
  set_optional_service_var CITY_SOUL_INVENTORY_GP_PER_AP "${CITY_SOUL_INVENTORY_GP_PER_AP:-}"
  set_optional_service_var CITY_SOUL_COMPLEXITY_AP "${CITY_SOUL_COMPLEXITY_AP:-}"
}

configure_domain() {
  if [[ "$SKIP_DOMAIN" == "1" ]]; then
    return 0
  fi
  if [[ -z "$CUSTOM_DOMAIN" ]]; then
    return 0
  fi

  local args=(domain "$CUSTOM_DOMAIN" --service "$RAILWAY_APP_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --json)
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    args+=(--project "$RAILWAY_PROJECT_ID")
  fi
  if [[ -n "${RAILWAY_DOMAIN_PORT:-}" ]]; then
    args+=(--port "$RAILWAY_DOMAIN_PORT")
  fi

  log "Ensuring custom domain $CUSTOM_DOMAIN"
  run railway "${args[@]}"
}

deploy_app() {
  if [[ "$SKIP_DEPLOY" == "1" ]]; then
    return 0
  fi

  local args=(up --service "$RAILWAY_APP_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --detach --json --message "$DEPLOY_MESSAGE")
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    args+=(--project "$RAILWAY_PROJECT_ID")
  fi

  log "Uploading and deploying current checkout"
  run railway "${args[@]}"

  local status_args=(service status --service "$RAILWAY_APP_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --json)
  if [[ -n "$RAILWAY_PROJECT_ID" ]]; then
    status_args+=(--project "$RAILWAY_PROJECT_ID")
  fi

  log "Current service status"
  run railway "${status_args[@]}"
}

main() {
  require_cmd railway
  require_cmd jq
  require_env LANDING_DATABASE_URL

  [[ "$NULLCITY_RS_HOST" == *:* ]] || die "NULLCITY_RS_HOST must be host:port"

  log "Checking Railway authentication"
  run_quiet "railway whoami" railway whoami --json

  ensure_project
  ensure_environment
  ensure_app_service
  resolve_print_bridge_token
  ensure_postgres_service
  configure_variables
  configure_domain
  deploy_app

  log "Done"
}

main "$@"
