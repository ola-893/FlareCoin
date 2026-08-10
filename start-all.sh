#!/usr/bin/env bash
#
# FlareYield Manager - One-Command Startup Script
# 
# This script starts all components of the FlareYield Manager:
# 1. FCE Extension Scaffold (Docker services: Redis, proxy, TEE node)
# 2. Off-chain Executor (processes XRPL deposits)
# 3. Frontend (React UI)
#
# Usage:
#   ./start-all.sh              # Start all services
#   ./start-all.sh --stop       # Stop all services
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - Node.js and npm installed
#   - .env files configured in root, frontend/, executor/, and fce-extension-scaffold/
#   - npm dependencies installed (run: npm run install:all)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[FlareYield]${NC} $*"; }
warn() { echo -e "${YELLOW}[FlareYield]${NC} $*"; }
error() { echo -e "${RED}[FlareYield] ERROR:${NC} $*" >&2; }
die() { error "$*"; exit 1; }

# Parse arguments
ACTION="start"
if [[ $# -gt 0 ]] && [[ "$1" == "--stop" ]]; then
    ACTION="stop"
fi

# Stop services
if [[ "$ACTION" == "stop" ]]; then
    log "Stopping all FlareYield services..."
    
    # Stop FCE scaffold services
    if [[ -d "fce-extension-scaffold" ]]; then
        log "Stopping FCE scaffold Docker services..."
        cd fce-extension-scaffold
        docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml down 2>/dev/null || true
        cd ..
    fi
    
    # Kill node processes (frontend, executor, fce-extension)
    log "Stopping Node.js services..."
    pkill -f "vite.*frontend" 2>/dev/null || true
    pkill -f "tsx.*executor" 2>/dev/null || true
    pkill -f "tsx.*fce-extension" 2>/dev/null || true
    
    # Stop ngrok
    log "Stopping ngrok tunnel..."
    pkill -f "ngrok" 2>/dev/null || true
    
    log "✅ All services stopped"
    exit 0
fi

# Start services
log "🚀 Starting FlareYield Manager - All Components"
echo ""

# Check prerequisites
log "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    die "Docker is not installed. Please install Docker first."
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    die "Node.js is not installed. Please install Node.js first."
fi

# Check npm
if ! command -v npm &> /dev/null; then
    die "npm is not installed. Please install npm first."
fi

# Check if dependencies are installed
if [[ ! -d "frontend/node_modules" ]] || [[ ! -d "executor/node_modules" ]] || [[ ! -d "fce-extension/node_modules" ]]; then
    warn "Dependencies not installed. Running: npm run install:all"
    npm run install:all
fi

log "✅ Prerequisites OK"
echo ""

# Step 1: Start FCE Extension Scaffold (Docker services) - Optional
log "📦 Step 1/5: Starting FCE Extension Scaffold (Docker)"

if [[ -d "fce-extension-scaffold" ]]; then
    log "  • Redis (port 6382)"
    log "  • Extension Proxy (ports 6673, 6674)"
    log "  • TEE Node"

    cd fce-extension-scaffold

    # Check if .env exists
    if [[ ! -f ".env" ]]; then
        warn ".env file not found in fce-extension-scaffold/"
        warn "Creating from .env.example..."
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            warn "⚠️  Please configure fce-extension-scaffold/.env before continuing"
            die "Configuration required"
        else
            die ".env.example not found"
        fi
    fi

    # Heal stale networks that Compose would refuse to reuse.
    # Compose only adopts an existing network if it carries its own
    # com.docker.compose.* labels; a leftover network (e.g. created
    # outside compose, or by an aborted run) has no/foreign labels and
    # makes `up` fail with: "network ... has incorrect label
    # com.docker.compose.network set to \"\" (expected: \"default\")".
    NETWORK_NAME="${COMPOSE_NETWORK:-extension-scaffold-coston2}"
    # Compose project name = COMPOSE_PROJECT_NAME override, else normalized dirname.
    COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
    if docker network inspect "$NETWORK_NAME" &>/dev/null; then
        # "default" is the network key name in docker-compose.yaml.
        NET_LABEL="$(docker network inspect "$NETWORK_NAME" --format '{{index .Labels "com.docker.compose.network"}}' 2>/dev/null || true)"
        NET_PROJECT="$(docker network inspect "$NETWORK_NAME" --format '{{index .Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
        if [[ "$NET_LABEL" != "default" || "$NET_PROJECT" != "$COMPOSE_PROJECT" ]]; then
            warn "Stale network '$NETWORK_NAME' is not owned by this compose project — removing it so Compose can recreate it"
            if ! docker network rm "$NETWORK_NAME" 2>/dev/null; then
                warn "Could not remove '$NETWORK_NAME' (containers may be attached)."
                warn "Run: docker network disconnect --force <container> '$NETWORK_NAME' and retry."
            fi
        fi
    fi

    # Start Docker services for Coston2
    log "Starting Docker Compose services for Coston2..."
    docker compose -f docker-compose.yaml -f docker-compose.coston2.yaml up -d

    # Wait for services to be ready
    log "Waiting for services to initialize..."
    sleep 5

    # Check if Redis is responding
    if docker compose exec -T redis redis-cli ping &>/dev/null; then
        log "✅ Redis ready"
    else
        warn "⚠️  Redis may not be ready yet"
    fi

    cd ..
else
    warn "fce-extension-scaffold/ not found — skipping Docker services"
    warn "FCE extension will run standalone (no TEE node)"
fi
echo ""

# Step 2: Start Executor
log "⚙️  Step 2/5: Starting Off-chain Executor"
log "  • Monitors XRPL deposits"
log "  • Calls processDirectMint() on-chain"

if [[ ! -d "executor" ]]; then
    warn "executor/ directory not found — skipping executor"
else
    if [[ ! -f "executor/.env" ]]; then
        warn "⚠️  executor/.env not found - executor may fail to start"
    fi

    # Start executor in background
    log "Starting executor..."
    cd executor
    nohup npm start > ../executor.log 2>&1 &
    EXECUTOR_PID=$!
    disown $EXECUTOR_PID
    echo $EXECUTOR_PID > ../executor.pid
    cd ..

    log "✅ Executor started (PID: $EXECUTOR_PID, logs: executor.log)"
fi
echo ""

# Step 3: Start ngrok tunnel
log "🌐 Step 3/5: Starting ngrok tunnel (optional)"
log "  • Exposes FCE extension to external network"
log "  • Reserved domain: trolling-affluent-parcel.ngrok-free.dev"

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    warn "⚠️  ngrok not found. Install with: brew install ngrok/ngrok/ngrok"
    warn "⚠️  Or download from: https://ngrok.com/download"
    warn "⚠️  Continuing without ngrok - external access will not work"
else
    # Check if ngrok is already running on port 8080
    if lsof -i :4040 &>/dev/null; then
        log "✅ ngrok already running (dashboard: http://localhost:4040)"
    else
        log "Starting ngrok tunnel for port 8080..."
        ngrok http 8080 --log=stdout > ngrok.log 2>&1 &
        NGROK_PID=$!
        echo $NGROK_PID > ngrok.pid
        
        # Wait for ngrok to start
        sleep 3
        
        if ps -p $NGROK_PID > /dev/null; then
            log "✅ ngrok started (PID: $NGROK_PID, logs: ngrok.log)"
            log "   Dashboard: http://localhost:4040"
        else
            warn "⚠️  ngrok failed to start - check ngrok.log"
        fi
    fi
fi
echo ""

# Step 4: Start FCE Extension Handler
log "🔌 Step 4/5: Starting FCE Extension Handler"
log "  • Handles VAULT_REBALANCE actions from TEE"
log "  • Signs settlement transactions"

if [[ ! -d "fce-extension" ]]; then
    warn "fce-extension/ directory not found — skipping FCE extension"
else
    cd fce-extension
    nohup npm start > ../fce-extension.log 2>&1 &
    FCE_PID=$!
    disown $FCE_PID
    echo $FCE_PID > ../fce-extension.pid
    cd ..

    log "✅ FCE Extension started (PID: $FCE_PID, logs: fce-extension.log)"
fi
echo ""

# Step 5: Start Frontend
log "🎨 Step 5/5: Starting Frontend (React UI)"
log "  • Development server with hot reload"
log "  • Will open in browser automatically"

if [[ ! -d "frontend" ]]; then
    warn "frontend/ directory not found — skipping frontend"
else
    if [[ ! -f "frontend/.env" ]]; then
        warn "⚠️  frontend/.env not found - frontend may use incorrect contract addresses"
    fi

    cd frontend
    nohup npm run dev > ../frontend.log 2>&1 &
    FRONTEND_PID=$!
    disown $FRONTEND_PID
    echo $FRONTEND_PID > ../frontend.pid
    cd ..

    log "✅ Frontend started (PID: $FRONTEND_PID, logs: frontend.log)"
fi
echo ""

# Wait a moment for everything to initialize
sleep 3

# Summary
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}✅ FlareYield Manager - All Services Running${NC}              ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Service URLs:${NC}"
echo -e "   Frontend:        ${CYAN}http://localhost:5200${NC}"
echo -e "   FCE Extension:   ${CYAN}http://localhost:8080${NC}"
echo -e "   ngrok Dashboard: ${CYAN}http://localhost:4040${NC}"
echo -e "   ngrok Public:    ${CYAN}https://trolling-affluent-parcel.ngrok-free.dev${NC}"
echo -e "   Extension Proxy: ${CYAN}localhost:6673${NC} (internal) / ${CYAN}6674${NC} (external)"
echo -e "   Redis:           ${CYAN}localhost:6382${NC}"
echo ""
echo -e "${BLUE}📝 Log Files:${NC}"
echo -e "   Executor:        ${CYAN}executor.log${NC}"
echo -e "   FCE Extension:   ${CYAN}fce-extension.log${NC}"
echo -e "   Frontend:        ${CYAN}frontend.log${NC}"
echo -e "   ngrok:           ${CYAN}ngrok.log${NC}"
echo -e "   Docker:          ${CYAN}docker compose logs -f${NC} (in fce-extension-scaffold/)"
echo ""
echo -e "${BLUE}🔧 Management:${NC}"
echo -e "   View logs:       ${CYAN}tail -f executor.log${NC} (or fce-extension.log, frontend.log)"
echo -e "   View all:        ${CYAN}tail -f *.log${NC}"
echo -e "   Docker logs:     ${CYAN}cd fce-extension-scaffold && docker compose logs -f${NC}"
echo -e "   Stop all:        ${CYAN}./start-all.sh --stop${NC}"
echo ""
echo -e "${YELLOW}⚠️  Notes:${NC}"
echo -e "   • Frontend will open automatically in your browser"
echo -e "   • If FCE services timeout after ~5 hours, restart proxy:"
echo -e "     ${CYAN}cd fce-extension-scaffold && docker compose restart ext-proxy${NC}"
echo -e "   • All services log to separate files for easy debugging"
echo ""
echo -e "${GREEN}🎉 Ready to test! Visit http://localhost:5200 to start.${NC}"
echo ""
