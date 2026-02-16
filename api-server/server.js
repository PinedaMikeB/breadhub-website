/**
 * BreadHub POS API Server
 * REST API for OpenClaw to access sales data
 * 
 * Features:
 * - Real-time sales reporting
 * - Daily/weekly/monthly summaries
 * - Product performance analytics
 * - Shift reports
 * - Cashier performance
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// API Key Authentication Middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key' 
    });
  }
  
  next();
};

// Apply authentication to all API routes
app.use('/api/', authenticateApiKey);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get today's date key in YYYY-MM-DD format
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get date range for queries
 */
function getDateRange(period = 'today') {
  const now = new Date();
  const today = getTodayKey();
  
  switch (period) {
    case 'today':
      return { start: today, end: today };
      
    case 'yesterday':
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toISOString().split('T')[0];
      return { start: yesterdayKey, end: yesterdayKey };
      
    case 'week':
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { start: weekAgo.toISOString().split('T')[0], end: today };
      
    case 'month':
      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { start: monthAgo.toISOString().split('T')[0], end: today };
      
    default:
      return { start: today, end: today };
  }
}

/**
 * Format currency for PHP
 */
function formatCurrency(amount) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'BreadHub POS API'
  });
});

/**
 * GET /api/sales/summary
 * Get sales summary for a specific period
 * 
 * Query params:
 * - period: today|yesterday|week|month (default: today)
 * - dateKey: specific date in YYYY-MM-DD format (overrides period)
 */
app.get('/api/sales/summary', async (req, res) => {
  try {
    const { period = 'today', dateKey } = req.query;
    
    let query;
    if (dateKey) {
      // Specific date
      query = db.collection('sales').where('dateKey', '==', dateKey);
    } else {
      // Date range
      const { start, end } = getDateRange(period);
      query = db.collection('sales')
        .where('dateKey', '>=', start)
        .where('dateKey', '<=', end);
    }
    
    const snapshot = await query.get();
    const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate summary
    const summary = {
      period: dateKey || period,
      dateRange: dateKey ? { start: dateKey, end: dateKey } : getDateRange(period),
      totalSales: sales.reduce((sum, sale) => sum + (sale.total || 0), 0),
      totalTransactions: sales.length,
      totalDiscount: sales.reduce((sum, sale) => sum + (sale.totalDiscount || 0), 0),
      subtotal: sales.reduce((sum, sale) => sum + (sale.subtotal || 0), 0),
      averageTransaction: 0,
      paymentMethods: {
        cash: 0,
        gcash: 0,
        card: 0
      },
      topProducts: [],
      hourlyBreakdown: []
    };
    
    // Calculate average
    if (summary.totalTransactions > 0) {
      summary.averageTransaction = summary.totalSales / summary.totalTransactions;
    }
    
    // Payment methods breakdown
    sales.forEach(sale => {
      const method = sale.paymentMethod || 'cash';
      summary.paymentMethods[method] = (summary.paymentMethods[method] || 0) + sale.total;
    });
    
    // Product sales aggregation
    const productSales = {};
    sales.forEach(sale => {
      (sale.items || []).forEach(item => {
        const key = item.productId || item.productName;
        if (!productSales[key]) {
          productSales[key] = {
            productId: item.productId,
            productName: item.productName,
            category: item.category,
            mainCategory: item.mainCategory,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += item.lineTotal || (item.unitPrice * item.quantity);
      });
    });
    
    // Top 10 products by revenue
    summary.topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    // Hourly breakdown
    const hourlyData = {};
    sales.forEach(sale => {
      const hour = new Date(sale.timestamp).getHours();
      if (!hourlyData[hour]) {
        hourlyData[hour] = { hour, sales: 0, transactions: 0 };
      }
      hourlyData[hour].sales += sale.total;
      hourlyData[hour].transactions += 1;
    });
    
    summary.hourlyBreakdown = Object.values(hourlyData).sort((a, b) => a.hour - b.hour);
    
    // Format currency fields
    summary.totalSalesFormatted = formatCurrency(summary.totalSales);
    summary.totalDiscountFormatted = formatCurrency(summary.totalDiscount);
    summary.subtotalFormatted = formatCurrency(summary.subtotal);
    summary.averageTransactionFormatted = formatCurrency(summary.averageTransaction);
    
    res.json({
      success: true,
      data: summary
    });
    
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales summary',
      message: error.message
    });
  }
});

/**
 * GET /api/sales/recent
 * Get recent sales transactions
 * 
 * Query params:
 * - limit: number of transactions (default: 10, max: 100)
 * - dateKey: filter by specific date
 */
app.get('/api/sales/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const { dateKey } = req.query;
    
    let query = db.collection('sales')
      .orderBy('timestamp', 'desc')
      .limit(limit);
    
    if (dateKey) {
      query = db.collection('sales')
        .where('dateKey', '==', dateKey)
        .orderBy('timestamp', 'desc')
        .limit(limit);
    }
    
    const snapshot = await query.get();
    const sales = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        saleId: data.saleId,
        timestamp: data.timestamp,
        dateKey: data.dateKey,
        total: data.total,
        totalFormatted: formatCurrency(data.total),
        totalDiscount: data.totalDiscount || 0,
        items: data.items,
        itemCount: data.items?.length || 0,
        paymentMethod: data.paymentMethod,
        cashierName: data.cashierName,
        shiftNumber: data.shiftNumber
      };
    });
    
    res.json({
      success: true,
      data: {
        count: sales.length,
        sales
      }
    });
    
  } catch (error) {
    console.error('Error fetching recent sales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent sales',
      message: error.message
    });
  }
});

/**
 * GET /api/sales/:saleId
 * Get detailed information for a specific sale
 */
app.get('/api/sales/:saleId', async (req, res) => {
  try {
    const { saleId } = req.params;
    
    const snapshot = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found'
      });
    }
    
    const doc = snapshot.docs[0];
    const sale = { id: doc.id, ...doc.data() };
    
    // Format currency fields
    sale.totalFormatted = formatCurrency(sale.total);
    sale.subtotalFormatted = formatCurrency(sale.subtotal);
    if (sale.totalDiscount) {
      sale.totalDiscountFormatted = formatCurrency(sale.totalDiscount);
    }
    
    res.json({
      success: true,
      data: sale
    });
    
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sale',
      message: error.message
    });
  }
});

/**
 * GET /api/products/performance
 * Get product performance metrics
 * 
 * Query params:
 * - period: today|yesterday|week|month (default: today)
 * - category: filter by category
 * - mainCategory: filter by main category (breads/drinks)
 * - limit: number of products (default: 20)
 */
app.get('/api/products/performance', async (req, res) => {
  try {
    const { period = 'today', category, mainCategory, limit = 20 } = req.query;
    const { start, end } = getDateRange(period);
    
    const snapshot = await db.collection('sales')
      .where('dateKey', '>=', start)
      .where('dateKey', '<=', end)
      .get();
    
    const sales = snapshot.docs.map(doc => doc.data());
    
    // Aggregate product data
    const productStats = {};
    
    sales.forEach(sale => {
      (sale.items || []).forEach(item => {
        // Filter by category if specified
        if (category && item.category !== category) return;
        if (mainCategory && item.mainCategory !== mainCategory) return;
        
        const key = item.productId || item.productName;
        if (!productStats[key]) {
          productStats[key] = {
            productId: item.productId,
            productName: item.productName,
            category: item.category,
            mainCategory: item.mainCategory,
            totalQuantity: 0,
            totalRevenue: 0,
            totalDiscount: 0,
            transactions: 0,
            averagePrice: 0
          };
        }
        
        productStats[key].totalQuantity += item.quantity;
        productStats[key].totalRevenue += item.lineTotal || (item.unitPrice * item.quantity);
        productStats[key].totalDiscount += (item.discountAmount || 0) * item.quantity;
        productStats[key].transactions += 1;
      });
    });
    
    // Calculate averages and sort
    const products = Object.values(productStats)
      .map(p => ({
        ...p,
        averagePrice: p.totalRevenue / p.totalQuantity,
        revenueFormatted: formatCurrency(p.totalRevenue),
        discountFormatted: formatCurrency(p.totalDiscount)
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        period,
        dateRange: { start, end },
        filters: { category, mainCategory },
        count: products.length,
        products
      }
    });
    
  } catch (error) {
    console.error('Error fetching product performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product performance',
      message: error.message
    });
  }
});

/**
 * GET /api/shifts/active
 * Get currently active shifts
 */
app.get('/api/shifts/active', async (req, res) => {
  try {
    const snapshot = await db.collection('shifts')
      .where('status', '==', 'active')
      .orderBy('startTime', 'desc')
      .get();
    
    const shifts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        shiftNumber: data.shiftNumber,
        cashierName: data.cashierName,
        startTime: data.startTime,
        startingCash: data.startingCash,
        startingCashFormatted: formatCurrency(data.startingCash),
        totalSales: data.totalSales || 0,
        totalSalesFormatted: formatCurrency(data.totalSales || 0),
        transactionCount: data.transactionCount || 0
      };
    });
    
    res.json({
      success: true,
      data: {
        count: shifts.length,
        shifts
      }
    });
    
  } catch (error) {
    console.error('Error fetching active shifts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active shifts',
      message: error.message
    });
  }
});

/**
 * GET /api/shifts/:shiftId
 * Get shift details with sales breakdown
 */
app.get('/api/shifts/:shiftId', async (req, res) => {
  try {
    const { shiftId } = req.params;
    
    // Get shift data
    const shiftDoc = await db.collection('shifts').doc(shiftId).get();
    
    if (!shiftDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Shift not found'
      });
    }
    
    const shift = { id: shiftDoc.id, ...shiftDoc.data() };
    
    // Get sales for this shift
    const salesSnapshot = await db.collection('sales')
      .where('shiftId', '==', shiftId)
      .orderBy('timestamp', 'asc')
      .get();
    
    const sales = salesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Calculate totals
    const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalDiscount = sales.reduce((sum, s) => sum + (s.totalDiscount || 0), 0);
    
    res.json({
      success: true,
      data: {
        shift: {
          ...shift,
          startingCashFormatted: formatCurrency(shift.startingCash),
          totalSalesFormatted: formatCurrency(totalSales)
        },
        sales: {
          count: sales.length,
          totalSales,
          totalSalesFormatted: formatCurrency(totalSales),
          totalDiscount,
          totalDiscountFormatted: formatCurrency(totalDiscount),
          transactions: sales.map(s => ({
            saleId: s.saleId,
            timestamp: s.timestamp,
            total: s.total,
            totalFormatted: formatCurrency(s.total),
            paymentMethod: s.paymentMethod,
            itemCount: s.items?.length || 0
          }))
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching shift:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shift',
      message: error.message
    });
  }
});

/**
 * GET /api/cashiers/performance
 * Get cashier performance metrics
 * 
 * Query params:
 * - period: today|yesterday|week|month (default: today)
 */
app.get('/api/cashiers/performance', async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { start, end } = getDateRange(period);
    
    const snapshot = await db.collection('sales')
      .where('dateKey', '>=', start)
      .where('dateKey', '<=', end)
      .get();
    
    const sales = snapshot.docs.map(doc => doc.data());
    
    // Aggregate by cashier
    const cashierStats = {};
    
    sales.forEach(sale => {
      const cashierId = sale.cashierId || 'unknown';
      const cashierName = sale.cashierName || 'Unknown';
      
      if (!cashierStats[cashierId]) {
        cashierStats[cashierId] = {
          cashierId,
          cashierName,
          totalSales: 0,
          totalDiscount: 0,
          transactions: 0,
          averageTransaction: 0
        };
      }
      
      cashierStats[cashierId].totalSales += sale.total || 0;
      cashierStats[cashierId].totalDiscount += sale.totalDiscount || 0;
      cashierStats[cashierId].transactions += 1;
    });
    
    // Calculate averages
    const cashiers = Object.values(cashierStats)
      .map(c => ({
        ...c,
        averageTransaction: c.transactions > 0 ? c.totalSales / c.transactions : 0,
        totalSalesFormatted: formatCurrency(c.totalSales),
        totalDiscountFormatted: formatCurrency(c.totalDiscount),
        averageTransactionFormatted: formatCurrency(c.averageTransaction)
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
    
    res.json({
      success: true,
      data: {
        period,
        dateRange: { start, end },
        count: cashiers.length,
        cashiers
      }
    });
    
  } catch (error) {
    console.error('Error fetching cashier performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cashier performance',
      message: error.message
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/sales/summary',
      'GET /api/sales/recent',
      'GET /api/sales/:saleId',
      'GET /api/products/performance',
      'GET /api/shifts/active',
      'GET /api/shifts/:shiftId',
      'GET /api/cashiers/performance'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║         BreadHub POS API Server                         ║
║         OpenClaw Integration Ready                      ║
║                                                          ║
║         Server: http://localhost:${PORT}                   ║
║         Status: RUNNING                                  ║
║         Environment: ${process.env.NODE_ENV || 'development'}                        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

Available endpoints:
  GET  /api/health                    - Health check
  GET  /api/sales/summary             - Sales summary (today/week/month)
  GET  /api/sales/recent              - Recent transactions
  GET  /api/sales/:saleId             - Specific sale details
  GET  /api/products/performance      - Product sales metrics
  GET  /api/shifts/active             - Active shifts
  GET  /api/shifts/:shiftId           - Shift details
  GET  /api/cashiers/performance      - Cashier performance

Authentication: x-api-key header required for all /api/* endpoints
  `);
});
