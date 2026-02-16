# 🚀 BreadHub POS API - Quick Start

## For Mike: 5-Minute Setup

### Step 1: Download Firebase Credentials

1. Open: https://console.firebase.google.com/
2. Select: **breadhub-proofmaster**
3. Click: ⚙️ → **Project Settings** → **Service Accounts**
4. Click: **Generate New Private Key** button
5. Save file as: `firebase-service-account.json`
6. Move to: `/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server/`

### Step 2: Run Setup

```bash
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server"
./setup.sh
```

This will:
- ✅ Install all dependencies
- ✅ Create .env configuration
- ✅ Generate secure API key
- ✅ Verify Firebase credentials

**Important:** Save the API key shown! You'll need it for OpenClaw.

### Step 3: Start the Server

```bash
npm start
```

You should see:
```
╔══════════════════════════════════════════════════════════╗
║         BreadHub POS API Server                         ║
║         Server: http://localhost:3001                   ║
║         Status: RUNNING                                  ║
╚══════════════════════════════════════════════════════════╝
```

### Step 4: Test It

Open a new terminal:

```bash
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server"
npm test
```

If all tests pass ✅, you're ready to integrate with OpenClaw!

---

## OpenClaw Integration

### Add to OpenClaw Config

In your OpenClaw tools configuration, add:

**API Base URL:** `http://localhost:3001/api`
**API Key:** (from .env file)
**Auth Header:** `x-api-key`

### Test with Eko

Ask Eko:
- "How much did BreadHub make today?"
- "Show me the last 10 BreadHub sales"
- "What are our top selling products?"

---

## Running 24/7 (Optional)

To keep the API running even when you close the terminal:

```bash
# Install PM2 (process manager)
npm install -g pm2

# Start with PM2
pm2 start server.js --name breadhub-api

# Make it start on system boot
pm2 startup
pm2 save
```

**PM2 Commands:**
- `pm2 status` - Check if running
- `pm2 logs breadhub-api` - View logs
- `pm2 restart breadhub-api` - Restart server
- `pm2 stop breadhub-api` - Stop server

---

## Files Created

```
api-server/
├── server.js                    # Main API server
├── package.json                 # Dependencies
├── .env.example                 # Config template
├── .env                         # Your config (created by setup)
├── .gitignore                   # Git ignore rules
├── setup.sh                     # Setup script
├── test-api.js                  # Test suite
├── firebase-service-account.json # Firebase credentials (you add this)
├── README.md                    # Full API documentation
├── OPENCLAW-INTEGRATION.md      # OpenClaw guide
└── QUICK-START.md               # This file
```

---

## Available Endpoints

Once running, your API provides:

| Endpoint | Description | Example |
|----------|-------------|---------|
| `/api/health` | Health check | Always available |
| `/api/sales/summary` | Daily/weekly/monthly sales | `?period=today` |
| `/api/sales/recent` | Recent transactions | `?limit=10` |
| `/api/sales/:saleId` | Specific sale details | `/api/sales/S-20250216-001` |
| `/api/products/performance` | Product analytics | `?period=week&limit=10` |
| `/api/shifts/active` | Active cashier shifts | Current shifts |
| `/api/shifts/:shiftId` | Shift details | With all sales |
| `/api/cashiers/performance` | Cashier metrics | `?period=today` |

**Full documentation:** See `README.md`

---

## Troubleshooting

**Server won't start?**
```bash
# Check if port 3001 is already in use
lsof -i :3001

# Kill the process if needed
kill -9 [PID]
```

**Tests failing?**
```bash
# Make sure server is running first
npm start

# Then in another terminal
npm test
```

**No sales data?**
- Verify Firebase credentials are correct
- Check that sales exist in Firestore
- Try querying different date ranges

---

## What's Next?

1. ✅ Complete setup (you just did this!)
2. 📖 Read `OPENCLAW-INTEGRATION.md` for detailed Eko integration
3. 🤖 Configure OpenClaw with your API key
4. 🎯 Set up scheduled daily reports
5. 📊 Create custom dashboards and alerts

---

## Quick Reference

**Start server:** `npm start`
**Run tests:** `npm test`
**View logs:** Check terminal output
**API docs:** `README.md`
**OpenClaw guide:** `OPENCLAW-INTEGRATION.md`

**Need help?** All documentation is in this directory!

---

**Status:** ✅ Your BreadHub POS data is now accessible via API!

**OpenClaw can now:**
- Monitor real-time sales
- Generate daily reports
- Analyze product performance
- Track cashier metrics
- Alert on important events

🎉 You're all set!
