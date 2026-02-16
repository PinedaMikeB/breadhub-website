# BreadHub POS API - Deployment Options

## Your Current Situation

**OpenClaw/Eko:** Running on Mac Mini (different machine)
**BreadHub POS:** Firebase database in the cloud
**API Server:** Needs to run somewhere to connect them

---

## Understanding the Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     THE FLOW                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Eko (Mac Mini)                                            │
│       ↓                                                     │
│  HTTP Request to API                                       │
│       ↓                                                     │
│  API Server (Node.js) ← YOU NEED THIS RUNNING             │
│       ↓                                                     │
│  Firebase Admin SDK                                        │
│       ↓                                                     │
│  Firebase Firestore (Cloud) ← THIS IS ALREADY RUNNING     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**The Problem:** Firebase doesn't expose a REST API for your custom queries. You need the Node.js server running to:
1. Authenticate with Firebase
2. Query your sales data
3. Format responses for Eko

**Firebase handles:** Data storage (already running 24/7)
**Your API needs:** A server running 24/7 to query Firebase and serve data to Eko

---

## RECOMMENDED SOLUTION: Cloud Deployment

Since Eko is on a different Mac, you should deploy the API to a cloud service that runs 24/7.

### Option 1: Firebase Cloud Functions (BEST FOR YOU) ⭐

**Why this is perfect:**
- Already using Firebase
- Serverless (no server management)
- Auto-scales
- Pay only for usage (very cheap for your use case)
- Same project, everything together

**Cost:** ~₱50-100/month (probably less)

**Setup:**

```bash
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server"

# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Functions
firebase init functions

# Deploy
firebase deploy --only functions
```

Then your API will be at:
```
https://us-central1-breadhub-proofmaster.cloudfunctions.net/api
```

**Pros:**
- ✅ Always running (99.9% uptime)
- ✅ No server to manage
- ✅ Auto-scales
- ✅ Very affordable
- ✅ Integrated with your Firebase project

**Cons:**
- ❌ Slight learning curve
- ❌ Cold start delays (1-2 seconds first call)

---

### Option 2: Run on Mac Mini (Where Eko Lives) ⭐⭐

**Why this works:**
- Mac Mini is already running 24/7 for Eko
- Local network = faster responses
- No cloud costs
- You control everything

**How to set up:**

1. **Copy API to Mac Mini:**
```bash
# On your current Mac
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website"
git push origin main  # Push to GitHub first

# On Mac Mini
git clone https://github.com/your-username/Breadhub-website.git
cd Breadhub-website/api-server
```

2. **Setup on Mac Mini:**
```bash
# Run setup
./setup.sh

# Download Firebase credentials to Mac Mini
# (same process as before)

# Install PM2 for 24/7 running
npm install -g pm2

# Start with PM2
pm2 start server.js --name breadhub-api

# Make it auto-start on boot
pm2 startup
pm2 save
```

3. **Configure Eko to use localhost:**
```yaml
breadhub_api:
  base_url: http://localhost:3001/api
  auth_header: x-api-key
  api_key: [YOUR_API_KEY]
```

**Pros:**
- ✅ Free (uses existing Mac Mini)
- ✅ Fast (local network)
- ✅ Full control
- ✅ Easy to debug

**Cons:**
- ❌ Depends on Mac Mini being on
- ❌ Not accessible remotely
- ❌ Manual updates

---

### Option 3: Railway.app / Render.com (EASIEST CLOUD)

**Why this is great:**
- Very easy deployment
- Free tier available
- Handles everything for you
- Public URL immediately

**Railway.app Setup:**

1. **Sign up:** https://railway.app (GitHub login)

2. **Create new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your Breadhub-website repo
   - Root directory: `api-server`

3. **Add environment variables:**
   - `API_KEY`: [your key]
   - `PORT`: 3001
   - Upload `firebase-service-account.json` as file

4. **Deploy:**
   - Railway auto-deploys
   - Get URL like: `https://breadhub-api-production.up.railway.app`

**Cost:** Free tier (500 hours/month) or $5/month for unlimited

**Pros:**
- ✅ Super easy setup
- ✅ Always running
- ✅ Free tier available
- ✅ Auto-deploys from GitHub
- ✅ Public URL

**Cons:**
- ❌ Free tier has limits
- ❌ Cold starts on free tier

---

## MY RECOMMENDATION: Mac Mini (Option 2)

**Why?**

1. **You already have it running 24/7** for OpenClaw/Eko
2. **Zero cost** - uses existing hardware
3. **Faster** - localhost is instant
4. **Simpler** - no cloud service to manage
5. **More secure** - not exposed to internet
6. **Easy updates** - just `git pull` and `pm2 restart`

---

## Step-by-Step: Deploy to Mac Mini

### Step 1: Prepare on Current Mac (2 minutes)

```bash
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website"

# Commit everything
git add .
git commit -m "Add BreadHub POS API"
git push origin main
```

### Step 2: Setup on Mac Mini (5 minutes)

```bash
# Clone or pull latest
cd ~/Projects  # or wherever you keep code
git clone https://github.com/[your-username]/Breadhub-website.git
# or if already cloned:
cd ~/Projects/Breadhub-website
git pull origin main

# Go to API directory
cd api-server

# Run setup
chmod +x setup.sh
./setup.sh

# Copy Firebase credentials
# (Download from Firebase Console to Mac Mini)
# Save as: firebase-service-account.json
```

### Step 3: Start as Service (2 minutes)

```bash
# Install PM2 if not already installed
npm install -g pm2

# Start the API
pm2 start server.js --name breadhub-api

# Configure auto-start on boot
pm2 startup

# This will show you a command to run, like:
# sudo env PATH=$PATH:/usr/local/bin pm2 startup launchd -u [username] --hp /Users/[username]
# Copy and run that command

# Save PM2 configuration
pm2 save

# Verify it's running
pm2 status
pm2 logs breadhub-api
```

### Step 4: Test from Mac Mini (1 minute)

```bash
# Test locally
curl -H "x-api-key: [YOUR_API_KEY]" \
     http://localhost:3001/api/health

# Should return:
# {"status":"healthy","timestamp":"...","service":"BreadHub POS API"}

# Test full endpoint
curl -H "x-api-key: [YOUR_API_KEY]" \
     http://localhost:3001/api/sales/summary?period=today
```

### Step 5: Configure Eko (2 minutes)

In your OpenClaw configuration on Mac Mini:

```yaml
tools:
  breadhub_api:
    type: http_api
    base_url: http://localhost:3001/api
    auth:
      type: header
      header_name: x-api-key
      key: [YOUR_API_KEY_FROM_ENV]
```

### Step 6: Test with Eko (1 minute)

```bash
# In OpenClaw CLI
eko "How much did BreadHub make today?"
```

---

## Maintenance Commands (Mac Mini)

```bash
# Check status
pm2 status

# View logs
pm2 logs breadhub-api

# Restart (after code updates)
pm2 restart breadhub-api

# Stop
pm2 stop breadhub-api

# Update code
cd ~/Projects/Breadhub-website/api-server
git pull origin main
pm2 restart breadhub-api

# Check if running after reboot
pm2 list
```

---

## Alternative: If You Want Cloud Later

If you decide you want the API accessible from anywhere (not just Mac Mini), here's the quickest cloud option:

### Firebase Cloud Functions (30 minutes)

I can create a modified version that deploys to Firebase Functions. This would:

1. Use the same Firebase project
2. Be accessible via HTTPS URL
3. Cost ~₱50-100/month
4. Run alongside your existing Firebase setup

**Would you like me to create the Firebase Functions version?**

---

## Summary Table

| Option | Cost | Complexity | Speed | Availability |
|--------|------|------------|-------|--------------|
| Mac Mini | ₱0 | Easy | Fast | When Mac is on |
| Firebase Functions | ~₱75/mo | Medium | Good | 99.9% |
| Railway/Render | ₱0-250/mo | Easy | Good | 99.9% |

---

## My Recommendation

**Start with Mac Mini** because:
1. Eko already lives there
2. Zero cost
3. Faster (localhost)
4. Easier to debug
5. More secure (not on internet)

**Later, if needed:**
- Move to Firebase Functions for remote access
- Or keep both (Mac Mini primary, cloud backup)

---

## Next Steps

1. ✅ Commit current code to GitHub (from your Mac)
2. ✅ Pull code on Mac Mini
3. ✅ Run setup on Mac Mini
4. ✅ Start with PM2
5. ✅ Configure Eko
6. ✅ Test!

**Want me to help you with any of these steps?**
