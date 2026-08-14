# FlareYield Manager - Quick Start

## 🚀 Start Everything with One Command

```bash
# Option 1: Using the script directly
./start-all.sh

# Option 2: Using npm
npm run start:all
```

This single command starts:
- ✅ FCE Extension Scaffold (Docker: Redis, Proxy, TEE Node)
- ✅ Off-chain Executor (XRPL deposit monitor)
- ✅ FCE Extension Handler (TypeScript handler)
- ✅ Frontend (React UI on http://localhost:5173)

## 🛑 Stop Everything

```bash
# Option 1: Using the script directly
./start-all.sh --stop

# Option 2: Using npm
npm run stop:all
```

## 📖 Full Documentation

For complete setup instructions, troubleshooting, and testing guide, see:
- **[TESTER_SETUP_GUIDE.md](./TESTER_SETUP_GUIDE.md)** - Complete guide for testers
- **[README.md](./README.md)** - Project overview and architecture

## 🎯 Quick Test Flow

1. **Start services**: `./start-all.sh`
2. **Open browser**: http://localhost:5173
3. **Connect wallet**: MetaMask on Coston2 (Chain ID: 114)
4. **Get test tokens**: 
   - CFLR: https://faucet.flare.network/coston2
   - XRP: https://xrpl.org/resources/dev-tools/xrp-faucets
5. **Make a deposit**: Follow UI flow
6. **Monitor logs**: `tail -f *.log`

## 📊 Service Status

Check if everything is running:

```bash
# Check Docker services
cd fce-extension-scaffold
docker compose ps

# Check Node.js processes
ps aux | grep -E "(vite|tsx)" | grep -v grep

# View logs
tail -f executor.log
tail -f fce-extension.log
tail -f frontend.log
```

## ⚡ Common Commands

```bash
# Install dependencies
npm run install:all

# Start all services
./start-all.sh

# Stop all services
./start-all.sh --stop

# Restart just the FCE proxy (if timeout issues)
cd fce-extension-scaffold && docker compose restart ext-proxy

# View all logs
tail -f *.log

# Clean restart (stop + start)
./start-all.sh --stop && sleep 2 && ./start-all.sh
```

## 🔗 Service URLs

- **Frontend**: http://localhost:5173
- **FCE Extension**: http://localhost:8080
- **Extension Proxy**: localhost:6673 (internal) / 6674 (external)
- **Redis**: localhost:6382

## 📝 Log Files

All services log to separate files in the root directory:
- `executor.log` - XRPL deposit monitoring
- `fce-extension.log` - FCE handler operations
- `frontend.log` - Frontend dev server
- Docker logs: `cd fce-extension-scaffold && docker compose logs -f`

---

**For detailed setup instructions and troubleshooting, see [TESTER_SETUP_GUIDE.md](./TESTER_SETUP_GUIDE.md)**
