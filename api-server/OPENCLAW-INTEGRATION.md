# OpenClaw Integration Guide - BreadHub POS API

## Overview

This guide shows you how to integrate the BreadHub POS API with OpenClaw so that Eko (your AI assistant) can monitor and report on your bakery sales in real-time.

---

## Quick Start

### 1. Setup the API Server

```bash
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server"
chmod +x setup.sh
./setup.sh
```

The setup script will:
- Install dependencies
- Create .env file
- Generate a secure API key
- Guide you through Firebase setup

### 2. Get Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select **breadhub-proofmaster** project
3. Click ⚙️ (Settings) → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save as `firebase-service-account.json` in the `api-server` directory

### 3. Start the Server

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

Server will be available at `http://localhost:3001`

### 4. Test the API

```bash
npm test
```

This will run automated tests to ensure everything is working.

---

## OpenClaw Configuration

### Add API to OpenClaw Tools

In your OpenClaw configuration, add the BreadHub API as a custom tool:

```yaml
# openclaw-config.yaml

tools:
  - name: breadhub_sales
    type: http_api
    base_url: http://localhost:3001/api
    auth:
      type: header
      header_name: x-api-key
      key: YOUR_API_KEY_FROM_ENV_FILE
    endpoints:
      - name: get_sales_summary
        method: GET
        path: /sales/summary
        description: Get sales summary for a time period
        parameters:
          - name: period
            type: query
            required: false
            default: today
            options: [today, yesterday, week, month]
      
      - name: get_recent_sales
        method: GET
        path: /sales/recent
        description: Get list of recent transactions
        parameters:
          - name: limit
            type: query
            required: false
            default: 10
      
      - name: get_product_performance
        method: GET
        path: /products/performance
        description: Get product sales analytics
        parameters:
          - name: period
            type: query
            required: false
            default: today
          - name: limit
            type: query
            required: false
            default: 20
      
      - name: get_active_shifts
        method: GET
        path: /shifts/active
        description: Get currently active cashier shifts
      
      - name: get_cashier_performance
        method: GET
        path: /cashiers/performance
        description: Get cashier performance metrics
        parameters:
          - name: period
            type: query
            required: false
            default: today
```

---

## Eko Prompt Templates

### System Prompt Addition

Add this to Eko's system prompt:

```
You have access to BreadHub POS sales data through the breadhub_sales tool.

SALES REPORTING CAPABILITIES:
- Real-time sales summaries (today, yesterday, week, month)
- Recent transaction details
- Product performance analytics
- Shift monitoring
- Cashier performance metrics

WHEN ASKED ABOUT BREADHUB SALES:
1. Use the appropriate endpoint based on the question
2. Format responses in a clear, conversational way
3. Highlight important metrics (totals, trends, top performers)
4. Suggest follow-up actions if needed

EXAMPLE QUERIES YOU CAN ANSWER:
- "How much did we make today?"
- "What are our top selling products?"
- "Show me the last 10 sales"
- "How is the current shift performing?"
- "Compare cashier performance today"
- "What's our best selling bread this week?"
```

### Example Conversation Templates

#### Daily Sales Report

**User:** "Eko, give me today's sales report"

**Eko Response Template:**
```
Let me check BreadHub sales for you...

[Calls: get_sales_summary?period=today]
[Calls: get_product_performance?period=today&limit=5]

📊 BreadHub Sales Report - Today (Feb 16, 2025)

💰 Sales Summary:
• Total Sales: ₱15,750.50
• Transactions: 42
• Average Sale: ₱375.01
• Total Discounts: ₱1,250.00

🏆 Top 5 Products:
1. Pandesal - 156 units (₱12,480)
2. Ensaymada - 45 units (₱2,250)
3. Spanish Bread - 38 units (₱1,140)
4. Coffee - 62 cups (₱1,860)
5. Cheese Bread - 24 units (₱960)

📈 Peak Hours:
• 7:00 AM - ₱3,200 (12 transactions)
• 12:00 PM - ₱2,800 (10 transactions)

Great day so far! Pandesal is performing exceptionally well.
```

#### Product Analysis

**User:** "Which bread products sold best this week?"

**Eko Response Template:**
```
Analyzing bread sales for this week...

[Calls: get_product_performance?period=week&mainCategory=breads&limit=10]

🍞 Bread Performance - This Week

Top 10 Bread Products:
1. Pandesal - 1,245 units (₱99,600) 🥇
2. Ensaymada - 320 units (₱16,000)
3. Spanish Bread - 285 units (₱8,550)
4. Cheese Bread - 210 units (₱8,400)
5. Cinnamon Roll - 180 units (₱9,000)
6. Raisin Bread - 165 units (₱6,600)
7. Ube Pandesal - 145 units (₱7,250)
8. Mongo Bread - 130 units (₱5,200)
9. Hotdog Buns - 125 units (₱5,000)
10. Hamburger Buns - 110 units (₱4,400)

💡 Insights:
• Pandesal dominates with 35% of bread revenue
• Sweet items (Ensaymada, Cinnamon Roll) performing well
• Specialty breads (Ube, Mongo) showing steady demand

Consider increasing Pandesal production capacity!
```

#### Shift Monitoring

**User:** "How is today's shift doing?"

**Eko Response Template:**
```
Checking current shift status...

[Calls: get_active_shifts]
[Calls: get_shifts/{shiftId}]

👤 Active Shift - Maria Santos (Shift #1)

⏰ Shift Details:
• Started: 6:00 AM
• Duration: 4 hours 30 minutes
• Starting Cash: ₱5,000.00

💰 Performance:
• Total Sales: ₱12,500.00
• Transactions: 35
• Average Sale: ₱357.14

📊 Sales Pace:
• Hourly Average: ₱2,777.78
• Projected 8-hour: ~₱22,222.40

🎯 Status: On track for a strong day!
Average transaction size is solid, maintaining good pace.
```

#### Cashier Comparison

**User:** "Compare cashier performance today"

**Eko Response Template:**
```
Analyzing cashier performance for today...

[Calls: get_cashier_performance?period=today]

👥 Cashier Performance - Today

1. 🥇 Maria Santos
   • Sales: ₱15,750.50
   • Transactions: 42
   • Avg Sale: ₱375.01
   • Discounts: ₱1,250.00

2. 🥈 Juan Reyes
   • Sales: ₱12,300.00
   • Transactions: 38
   • Avg Sale: ₱323.68
   • Discounts: ₱980.00

3. 🥉 Ana Cruz
   • Sales: ₱9,450.00
   • Transactions: 28
   • Avg Sale: ₱337.50
   • Discounts: ₱750.00

📈 Insights:
• Maria leading in both sales and transactions
• All cashiers maintaining consistent average ticket
• Discount usage is appropriate across the board

Everyone's performing well today! 👏
```

---

## Scheduled Reports

### Setup Automated Daily Reports

Add to your OpenClaw scheduled tasks:

```yaml
# openclaw-scheduled.yaml

tasks:
  - name: morning_sales_report
    schedule: "0 11 * * *"  # Every day at 11 AM
    action: |
      Generate a morning sales summary for BreadHub:
      - Sales from opening (6 AM) to now
      - Top 3 products
      - Current shift status
      - Notify Mike via Telegram
  
  - name: end_of_day_report
    schedule: "0 18 * * *"  # Every day at 6 PM
    action: |
      Generate end-of-day report for BreadHub:
      - Total daily sales
      - Top 10 products
      - All shift summaries
      - Cashier performance comparison
      - Email full report to Mike
  
  - name: weekly_summary
    schedule: "0 9 * * 1"  # Every Monday at 9 AM
    action: |
      Generate weekly sales summary for BreadHub:
      - Week-over-week comparison
      - Top performing products
      - Trends and insights
      - Recommendations for next week
```

---

## Advanced Queries

### Multi-Step Analysis

**User:** "Give me a comprehensive sales analysis"

**Eko Workflow:**
```javascript
// Step 1: Get overall summary
const todaySummary = await get_sales_summary({ period: 'today' });
const weekSummary = await get_sales_summary({ period: 'week' });

// Step 2: Get product performance
const topProducts = await get_product_performance({ 
  period: 'today', 
  limit: 10 
});

// Step 3: Get cashier metrics
const cashierPerf = await get_cashier_performance({ period: 'today' });

// Step 4: Compare with yesterday
const yesterdaySummary = await get_sales_summary({ period: 'yesterday' });

// Generate comprehensive report with trends
```

### Custom Alerts

**Example Alert Conditions:**

```javascript
// Low sales alert
if (todaySales < averageDaily * 0.7) {
  notify("⚠️ Sales are 30% below average today. Current: ₱X,XXX");
}

// High performing product alert
if (productRevenue > 10000) {
  notify("🚀 Pandesal is crushing it today! ₱X,XXX in revenue");
}

// Shift milestone alert
if (shiftSales > 20000) {
  notify("🎉 Maria's shift just hit ₱20,000 in sales!");
}
```

---

## Testing Your Integration

### Manual Test

```bash
# 1. Start the API server
cd api-server
npm start

# 2. Test with curl
curl -H "x-api-key: YOUR_API_KEY" \
     http://localhost:3001/api/sales/summary?period=today

# 3. Verify response format
```

### Automated Test

```bash
npm test
```

### Integration Test with OpenClaw

In OpenClaw CLI:

```bash
# Test simple query
eko "How much did BreadHub make today?"

# Test complex analysis
eko "Analyze BreadHub product performance this week and suggest optimizations"

# Test scheduled report
eko "Run the morning sales report for BreadHub"
```

---

## Monitoring & Maintenance

### Health Checks

Set up a health check in OpenClaw:

```yaml
health_checks:
  - name: breadhub_api
    url: http://localhost:3001/api/health
    interval: 5m
    on_failure:
      notify: mike_telegram
      message: "🚨 BreadHub API is down!"
```

### Logs

View API logs:

```bash
# If using systemd
journalctl -u breadhub-api -f

# If running in terminal
# Logs appear in the console
```

### Common Issues

**API not responding:**
```bash
# Check if server is running
ps aux | grep node

# Restart server
npm start
```

**Authentication errors:**
```bash
# Verify API key in .env
cat .env | grep API_KEY

# Update OpenClaw config with correct key
```

**No data returned:**
```bash
# Check Firebase connection
# Verify sales data exists in Firestore
# Check date filters in query
```

---

## Production Deployment

### Running as a Service (macOS)

Create a LaunchAgent for automatic startup:

```bash
# Create service file
cat > ~/Library/LaunchAgents/com.breadhub.api.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.breadhub.api</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Volumes/Wotg Drive Mike/GitHub/Breadhub-website/api-server</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/breadhub-api.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/breadhub-api.error.log</string>
</dict>
</plist>
EOF

# Load the service
launchctl load ~/Library/LaunchAgents/com.breadhub.api.plist

# Start the service
launchctl start com.breadhub.api
```

### Verify Service

```bash
# Check if running
launchctl list | grep breadhub

# View logs
tail -f /tmp/breadhub-api.log
```

---

## Security Checklist

- ✅ API key is strong and unique (generated by setup.sh)
- ✅ .env file is not committed to Git
- ✅ Firebase service account has minimal permissions
- ✅ Rate limiting is enabled
- ✅ CORS is restricted to trusted origins
- ✅ Only accessible from localhost (or trusted network)

---

## Next Steps

1. ✅ Complete setup and test API
2. ✅ Configure OpenClaw with API credentials
3. ✅ Test basic queries with Eko
4. ✅ Set up scheduled reports
5. ✅ Configure alerts for important metrics
6. ✅ Deploy as service for 24/7 availability

---

## Support

**Questions or Issues?**

1. Check `README.md` for detailed API documentation
2. Run `npm test` to diagnose problems
3. View server logs for error messages
4. Verify Firebase connectivity

**Contact:** Mike (BreadHub Owner)
