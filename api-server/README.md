# BreadHub POS API Documentation

## Overview

REST API for OpenClaw to access BreadHub POS sales data in real-time. This API provides comprehensive endpoints for sales analytics, product performance, shift management, and cashier metrics.

**Base URL:** `http://localhost:3001/api`

**Authentication:** All endpoints require an API key in the `x-api-key` header.

---

## Table of Contents

1. [Setup Instructions](#setup-instructions)
2. [Authentication](#authentication)
3. [Endpoints](#endpoints)
   - [Health Check](#health-check)
   - [Sales Summary](#sales-summary)
   - [Recent Sales](#recent-sales)
   - [Sale Details](#sale-details)
   - [Product Performance](#product-performance)
   - [Active Shifts](#active-shifts)
   - [Shift Details](#shift-details)
   - [Cashier Performance](#cashier-performance)
4. [Response Formats](#response-formats)
5. [Error Handling](#error-handling)
6. [OpenClaw Integration](#openclaw-integration)

---

## Setup Instructions

### 1. Install Dependencies

```bash
cd /Volumes/Wotg\ Drive\ Mike/GitHub/Breadhub-website/api-server
npm install
```

### 2. Get Firebase Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your BreadHub project: `breadhub-proofmaster`
3. Go to **Project Settings** (⚙️ icon)
4. Navigate to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the downloaded JSON file as `firebase-service-account.json` in the `api-server` directory

### 3. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your settings
nano .env
```

Update the following in `.env`:

```env
# Generate a strong API key
API_KEY=your-secure-api-key-here-change-this

# Update if running on different port
PORT=3001

# Set to production when deploying
NODE_ENV=development
```

### 4. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3001` and display available endpoints.

---

## Authentication

All API endpoints require authentication using an API key.

**Header:**
```
x-api-key: your-api-key-from-env-file
```

**Example:**
```bash
curl -H "x-api-key: your-secure-api-key-here-change-this" \
     http://localhost:3001/api/health
```

**Unauthorized Response (401):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

---

## Endpoints

### Health Check

Check if the API server is running.

**Endpoint:** `GET /api/health`

**Authentication:** Not required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-02-16T10:30:00.000Z",
  "service": "BreadHub POS API"
}
```

---

### Sales Summary

Get aggregated sales data for a time period.

**Endpoint:** `GET /api/sales/summary`

**Query Parameters:**
- `period` (optional): `today`, `yesterday`, `week`, `month` (default: `today`)
- `dateKey` (optional): Specific date in `YYYY-MM-DD` format (overrides period)

**Examples:**

```bash
# Today's sales
GET /api/sales/summary?period=today

# This week's sales
GET /api/sales/summary?period=week

# Specific date
GET /api/sales/summary?dateKey=2025-02-15
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "today",
    "dateRange": {
      "start": "2025-02-16",
      "end": "2025-02-16"
    },
    "totalSales": 15750.50,
    "totalSalesFormatted": "₱15,750.50",
    "totalTransactions": 42,
    "totalDiscount": 1250.00,
    "totalDiscountFormatted": "₱1,250.00",
    "subtotal": 17000.50,
    "subtotalFormatted": "₱17,000.50",
    "averageTransaction": 375.01,
    "averageTransactionFormatted": "₱375.01",
    "paymentMethods": {
      "cash": 12500.50,
      "gcash": 3250.00,
      "card": 0
    },
    "topProducts": [
      {
        "productId": "prod_123",
        "productName": "Pandesal",
        "category": "Bread",
        "mainCategory": "breads",
        "quantity": 156,
        "revenue": 4680.00
      }
    ],
    "hourlyBreakdown": [
      {
        "hour": 6,
        "sales": 2500.00,
        "transactions": 8
      },
      {
        "hour": 7,
        "sales": 3200.00,
        "transactions": 12
      }
    ]
  }
}
```

**Use Cases for OpenClaw:**
- "How much did we make today?"
- "What were our sales this week?"
- "What are our top selling products today?"
- "Show me hourly sales breakdown"

---

### Recent Sales

Get a list of recent transactions.

**Endpoint:** `GET /api/sales/recent`

**Query Parameters:**
- `limit` (optional): Number of transactions (1-100, default: 10)
- `dateKey` (optional): Filter by specific date `YYYY-MM-DD`

**Examples:**

```bash
# Last 10 transactions
GET /api/sales/recent

# Last 50 transactions
GET /api/sales/recent?limit=50

# Today's transactions
GET /api/sales/recent?dateKey=2025-02-16&limit=100
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 10,
    "sales": [
      {
        "id": "abc123",
        "saleId": "S-20250216-001",
        "timestamp": "2025-02-16T10:30:15.000Z",
        "dateKey": "2025-02-16",
        "total": 450.00,
        "totalFormatted": "₱450.00",
        "totalDiscount": 50.00,
        "itemCount": 5,
        "items": [
          {
            "productName": "Pandesal",
            "quantity": 5,
            "unitPrice": 80.00,
            "lineTotal": 400.00
          }
        ],
        "paymentMethod": "cash",
        "cashierName": "Maria Santos",
        "shiftNumber": 1
      }
    ]
  }
}
```

**Use Cases for OpenClaw:**
- "Show me the last 10 sales"
- "What were today's transactions?"
- "List recent purchases"

---

### Sale Details

Get detailed information for a specific sale.

**Endpoint:** `GET /api/sales/:saleId`

**Path Parameters:**
- `saleId`: Sale ID (e.g., `S-20250216-001`)

**Example:**

```bash
GET /api/sales/S-20250216-001
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "saleId": "S-20250216-001",
    "dateKey": "2025-02-16",
    "timestamp": "2025-02-16T10:30:15.000Z",
    "shiftId": "shift_789",
    "shiftNumber": 1,
    "cashierId": "user_456",
    "cashierName": "Maria Santos",
    "items": [
      {
        "productId": "prod_123",
        "productName": "Pandesal",
        "category": "Bread",
        "mainCategory": "breads",
        "quantity": 5,
        "originalPrice": 100.00,
        "discountId": "senior",
        "discountName": "Senior Citizen",
        "discountPercent": 20,
        "discountAmount": 20.00,
        "unitPrice": 80.00,
        "lineTotal": 400.00
      }
    ],
    "subtotal": 500.00,
    "subtotalFormatted": "₱500.00",
    "totalDiscount": 50.00,
    "totalDiscountFormatted": "₱50.00",
    "total": 450.00,
    "totalFormatted": "₱450.00",
    "discountInfo": {
      "hasDiscount": true,
      "discountTypes": ["senior"],
      "details": {
        "senior": {
          "name": "Senior Citizen",
          "percent": 20,
          "amount": 50.00
        }
      },
      "idPhoto": "base64_image_data"
    },
    "paymentMethod": "cash",
    "cashReceived": 500.00,
    "change": 50.00,
    "source": "pos",
    "createdBy": "user_456",
    "createdByName": "Maria Santos"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Sale not found"
}
```

---

### Product Performance

Get product sales metrics and analytics.

**Endpoint:** `GET /api/products/performance`

**Query Parameters:**
- `period` (optional): `today`, `yesterday`, `week`, `month` (default: `today`)
- `category` (optional): Filter by product category
- `mainCategory` (optional): Filter by main category (`breads` or `drinks`)
- `limit` (optional): Number of products to return (default: 20)

**Examples:**

```bash
# Top 20 products today
GET /api/products/performance?period=today

# Top 10 bread products this week
GET /api/products/performance?period=week&mainCategory=breads&limit=10

# All products in "Pastry" category
GET /api/products/performance?category=Pastry&limit=100
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "today",
    "dateRange": {
      "start": "2025-02-16",
      "end": "2025-02-16"
    },
    "filters": {
      "category": null,
      "mainCategory": "breads"
    },
    "count": 10,
    "products": [
      {
        "productId": "prod_123",
        "productName": "Pandesal",
        "category": "Bread",
        "mainCategory": "breads",
        "totalQuantity": 156,
        "totalRevenue": 12480.00,
        "revenueFormatted": "₱12,480.00",
        "totalDiscount": 520.00,
        "discountFormatted": "₱520.00",
        "transactions": 42,
        "averagePrice": 80.00
      }
    ]
  }
}
```

**Use Cases for OpenClaw:**
- "Which products sold the most today?"
- "Show me bread sales for this week"
- "What's our top performing product?"

---

### Active Shifts

Get currently active cashier shifts.

**Endpoint:** `GET /api/shifts/active`

**Example:**

```bash
GET /api/shifts/active
```

**Response:**
```json
{
  "success": true,
  "data": {
    "count": 2,
    "shifts": [
      {
        "id": "shift_789",
        "shiftNumber": 1,
        "cashierName": "Maria Santos",
        "startTime": "2025-02-16T06:00:00.000Z",
        "startingCash": 5000.00,
        "startingCashFormatted": "₱5,000.00",
        "totalSales": 12500.00,
        "totalSalesFormatted": "₱12,500.00",
        "transactionCount": 35
      }
    ]
  }
}
```

**Use Cases for OpenClaw:**
- "Who's currently working?"
- "Show me active shifts"
- "How much has the current shift made?"

---

### Shift Details

Get detailed information about a specific shift.

**Endpoint:** `GET /api/shifts/:shiftId`

**Path Parameters:**
- `shiftId`: Shift document ID from Firebase

**Example:**

```bash
GET /api/shifts/shift_789
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shift": {
      "id": "shift_789",
      "shiftNumber": 1,
      "cashierName": "Maria Santos",
      "cashierId": "user_456",
      "startTime": "2025-02-16T06:00:00.000Z",
      "startingCash": 5000.00,
      "startingCashFormatted": "₱5,000.00",
      "totalSales": 12500.00,
      "totalSalesFormatted": "₱12,500.00",
      "status": "active"
    },
    "sales": {
      "count": 35,
      "totalSales": 12500.00,
      "totalSalesFormatted": "₱12,500.00",
      "totalDiscount": 1000.00,
      "totalDiscountFormatted": "₱1,000.00",
      "transactions": [
        {
          "saleId": "S-20250216-001",
          "timestamp": "2025-02-16T06:15:00.000Z",
          "total": 450.00,
          "totalFormatted": "₱450.00",
          "paymentMethod": "cash",
          "itemCount": 5
        }
      ]
    }
  }
}
```

---

### Cashier Performance

Get performance metrics for all cashiers.

**Endpoint:** `GET /api/cashiers/performance`

**Query Parameters:**
- `period` (optional): `today`, `yesterday`, `week`, `month` (default: `today`)

**Example:**

```bash
# Today's cashier performance
GET /api/cashiers/performance?period=today

# This week's performance
GET /api/cashiers/performance?period=week
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "today",
    "dateRange": {
      "start": "2025-02-16",
      "end": "2025-02-16"
    },
    "count": 3,
    "cashiers": [
      {
        "cashierId": "user_456",
        "cashierName": "Maria Santos",
        "totalSales": 15750.50,
        "totalSalesFormatted": "₱15,750.50",
        "totalDiscount": 1250.00,
        "totalDiscountFormatted": "₱1,250.00",
        "transactions": 42,
        "averageTransaction": 375.01,
        "averageTransactionFormatted": "₱375.01"
      }
    ]
  }
}
```

**Use Cases for OpenClaw:**
- "How is each cashier performing today?"
- "Who made the most sales this week?"
- "Show me cashier stats"

---

## Response Formats

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data here
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message"
}
```

---

## Error Handling

### HTTP Status Codes

- `200 OK` - Request successful
- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Missing or invalid API key
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### Common Errors

**Missing API Key:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

**Resource Not Found:**
```json
{
  "success": false,
  "error": "Sale not found"
}
```

**Rate Limit Exceeded:**
```json
{
  "message": "Too many requests from this IP"
}
```

---

## OpenClaw Integration

### Example Prompt Templates for Eko

Here are example prompts you can use with OpenClaw/Eko:

#### Daily Sales Report

```
Check BreadHub sales and tell me:
1. Total sales today
2. Number of transactions
3. Top 5 selling products
4. Total discounts given
```

**API Calls:**
```bash
GET /api/sales/summary?period=today
GET /api/products/performance?period=today&limit=5
```

#### Shift Performance

```
How is the current shift performing?
Show me total sales, transaction count, and average sale amount.
```

**API Calls:**
```bash
GET /api/shifts/active
GET /api/shifts/{shiftId}
```

#### Product Analysis

```
What are our best-selling bread products this week?
Include quantity sold and revenue for each.
```

**API Calls:**
```bash
GET /api/products/performance?period=week&mainCategory=breads&limit=10
```

#### Cashier Comparison

```
Compare cashier performance for today.
Who has the highest sales and most transactions?
```

**API Calls:**
```bash
GET /api/cashiers/performance?period=today
```

### Testing with cURL

```bash
# Set your API key
API_KEY="your-secure-api-key-here-change-this"

# Test health endpoint
curl -H "x-api-key: $API_KEY" \
     http://localhost:3001/api/health

# Get today's sales summary
curl -H "x-api-key: $API_KEY" \
     http://localhost:3001/api/sales/summary?period=today

# Get recent transactions
curl -H "x-api-key: $API_KEY" \
     http://localhost:3001/api/sales/recent?limit=5

# Get product performance
curl -H "x-api-key: $API_KEY" \
     "http://localhost:3001/api/products/performance?period=week&limit=10"
```

### Node.js Example

```javascript
const API_KEY = 'your-secure-api-key-here-change-this';
const BASE_URL = 'http://localhost:3001/api';

async function getBreadHubSales() {
  const response = await fetch(`${BASE_URL}/sales/summary?period=today`, {
    headers: {
      'x-api-key': API_KEY
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Total Sales:', data.data.totalSalesFormatted);
    console.log('Transactions:', data.data.totalTransactions);
    console.log('Top Products:', data.data.topProducts);
  }
}

getBreadHubSales();
```

---

## Rate Limiting

- **Default:** 100 requests per 15 minutes per IP
- **Configurable:** Update `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` in `.env`

---

## Security Best Practices

1. **Change Default API Key:** Generate a strong, unique API key
2. **Use HTTPS in Production:** Deploy behind a reverse proxy with SSL
3. **Restrict CORS:** Update `ALLOWED_ORIGINS` in `.env`
4. **Firewall Rules:** Only allow access from trusted IPs
5. **Monitor Logs:** Track API usage and suspicious activity
6. **Rotate API Keys:** Change keys periodically

---

## Troubleshooting

### Server won't start

**Error:** `Cannot find module 'firebase-admin'`
```bash
npm install
```

**Error:** `Cannot find service account file`
- Make sure `firebase-service-account.json` exists in `api-server` directory
- Check `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env`

### 401 Unauthorized

- Check that `x-api-key` header is included
- Verify API key matches the one in `.env`
- Ensure no extra spaces in the header value

### No data returned

- Verify Firebase connection is working
- Check that sales data exists for the requested period
- Look for errors in server console logs

---

## Support

For issues or questions:
1. Check server logs: `npm start` shows console output
2. Verify Firebase connectivity
3. Test with the health endpoint first
4. Review error messages in API responses

---

## Version History

- **v1.0.0** (2025-02-16) - Initial release
  - Sales summary endpoint
  - Recent sales endpoint
  - Product performance analytics
  - Shift management
  - Cashier performance metrics
