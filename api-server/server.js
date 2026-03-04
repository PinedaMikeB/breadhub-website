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

/**
 * GET /api/analytics/overview
 * Single endpoint for Steward high-level KPI analysis + recommendations
 */
app.get('/api/analytics/overview', async (req, res) => {
  try {
    const { period = 'month', compare = 'previous' } = req.query;
    const currentRange = getDateRange(period);

    const currentSnapshot = await db.collection('sales')
      .where('dateKey', '>=', currentRange.start)
      .where('dateKey', '<=', currentRange.end)
      .get();

    const currentSales = currentSnapshot.docs.map(doc => doc.data());

    // Build previous range with same number of days for fair comparison
    const endDate = new Date(currentRange.end);
    const startDate = new Date(currentRange.start);
    const days = Math.max(1, Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1);
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    const prevRange = {
      start: prevStart.toISOString().split('T')[0],
      end: prevEnd.toISOString().split('T')[0]
    };

    const previousSnapshot = await db.collection('sales')
      .where('dateKey', '>=', prevRange.start)
      .where('dateKey', '<=', prevRange.end)
      .get();
    const previousSales = previousSnapshot.docs.map(doc => doc.data());

    const summarize = (rows) => {
      const productMap = {};
      let totalSales = 0;
      let totalDiscount = 0;
      const byChannel = { walkIn: 0, website: 0, grab: 0, other: 0 };

      rows.forEach((sale) => {
        totalSales += sale.total || 0;
        totalDiscount += sale.totalDiscount || 0;
        const channel = (sale.channel || sale.source || sale.orderSource || '').toLowerCase();
        if (channel.includes('walk')) byChannel.walkIn += sale.total || 0;
        else if (channel.includes('web')) byChannel.website += sale.total || 0;
        else if (channel.includes('grab')) byChannel.grab += sale.total || 0;
        else byChannel.other += sale.total || 0;

        (sale.items || []).forEach((item) => {
          const key = item.productId || item.productName || 'unknown';
          if (!productMap[key]) {
            productMap[key] = {
              productId: item.productId || null,
              productName: item.productName || 'Unknown',
              quantity: 0,
              revenue: 0
            };
          }
          productMap[key].quantity += item.quantity || 0;
          productMap[key].revenue += item.lineTotal || ((item.unitPrice || 0) * (item.quantity || 0));
        });
      });

      const transactions = rows.length;
      const averageTransaction = transactions > 0 ? totalSales / transactions : 0;
      const topProducts = Object.values(productMap)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

      return { totalSales, transactions, totalDiscount, averageTransaction, byChannel, topProducts };
    };

    const current = summarize(currentSales);
    const previous = summarize(previousSales);

    const pctChange = (now, prev) => {
      if (!prev && now) return 100;
      if (!prev) return 0;
      return ((now - prev) / prev) * 100;
    };

    const insights = [];
    if (pctChange(current.totalSales, previous.totalSales) < -8) {
      insights.push('Sales dropped vs previous period. Run promo bundles on top-selling bread + drink pairings.');
    }
    if (current.averageTransaction < 120) {
      insights.push('Average transaction is low. Increase upsell prompts and bundle discounts.');
    }
    if ((current.byChannel.website + current.byChannel.grab) < (current.totalSales * 0.35)) {
      insights.push('Digital channel mix is low. Push website/Grab promos and improve conversion landing pages.');
    }
    if (insights.length === 0) {
      insights.push('Performance is stable. Focus on best-seller availability and margin-optimized bundles.');
    }

    res.json({
      success: true,
      data: {
        period,
        compare,
        currentRange,
        previousRange: prevRange,
        current: {
          ...current,
          totalSalesFormatted: formatCurrency(current.totalSales),
          averageTransactionFormatted: formatCurrency(current.averageTransaction)
        },
        previous: {
          ...previous,
          totalSalesFormatted: formatCurrency(previous.totalSales),
          averageTransactionFormatted: formatCurrency(previous.averageTransaction)
        },
        changes: {
          salesPct: pctChange(current.totalSales, previous.totalSales),
          transactionsPct: pctChange(current.transactions, previous.transactions),
          averageTransactionPct: pctChange(current.averageTransaction, previous.averageTransaction)
        },
        recommendations: insights
      }
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics overview',
      message: error.message
    });
  }
});

/**
 * GET /api/executive/daily
 * One-shot daily executive briefing for Steward (POS + Production + Waste + Actions)
 */
app.get('/api/executive/daily', async (req, res) => {
  try {
    const date = req.query.date || getTodayKey();

    const [todaySalesSnap, yesterdaySalesSnap, monthSalesSnap, inventorySnap, wasteSnap] = await Promise.all([
      db.collection('sales').where('dateKey', '==', date).get(),
      db.collection('sales').where('dateKey', '==', (() => {
        const d = new Date(date); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0];
      })()).get(),
      db.collection('sales').where('dateKey', '>=', `${date.slice(0, 8)}01`).where('dateKey', '<=', date).get(),
      db.collection('dailyInventory').where('date', '==', date).get(),
      db.collection('dailyWastage').where('date', '==', date).get()
    ]);

    const mapSales = (snap) => snap.docs.map(d => d.data());
    const todaySales = mapSales(todaySalesSnap);
    const yesterdaySales = mapSales(yesterdaySalesSnap);
    const monthSales = mapSales(monthSalesSnap);

    const summarizeSales = (rows) => {
      const productMap = {};
      let totalSales = 0;
      rows.forEach((sale) => {
        totalSales += sale.total || 0;
        (sale.items || []).forEach((item) => {
          const key = item.productId || item.productName || 'unknown';
          if (!productMap[key]) productMap[key] = { productId: item.productId || null, productName: item.productName || 'Unknown', qty: 0, revenue: 0 };
          productMap[key].qty += item.quantity || 0;
          productMap[key].revenue += item.lineTotal || ((item.unitPrice || 0) * (item.quantity || 0));
        });
      });
      const transactions = rows.length;
      const aov = transactions ? totalSales / transactions : 0;
      const bestSellers = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
      return { totalSales, transactions, aov, bestSellers };
    };

    const t = summarizeSales(todaySales);
    const y = summarizeSales(yesterdaySales);
    const m = summarizeSales(monthSales);

    const inventoryRows = inventorySnap.docs.map(d => d.data());
    const wasteRows = wasteSnap.docs.map(d => d.data());

    const production = inventoryRows.reduce((s, r) => s + (r.newProductionQty || 0), 0);
    const sold = inventoryRows.reduce((s, r) => s + (r.soldQty || 0), 0);
    const remaining = inventoryRows.reduce((s, r) => s + ((r.carryoverQty || 0) + (r.newProductionQty || 0) - (r.soldQty || 0) + (r.cancelledQty || 0)), 0);

    const runouts = inventoryRows
      .map((r) => {
        const rem = (r.carryoverQty || 0) + (r.newProductionQty || 0) - (r.soldQty || 0) + (r.cancelledQty || 0);
        return { productId: r.productId, productName: r.productName, remaining: rem, sold: r.soldQty || 0, produced: r.newProductionQty || 0 };
      })
      .filter(r => r.remaining <= 0)
      .sort((a, b) => a.remaining - b.remaining);

    const totalWasteQty = wasteRows.reduce((s, w) => s + (w.qty || 0), 0);
    const totalWasteValue = wasteRows.reduce((s, w) => s + (w.lossValue || w.amount || 0), 0);

    const recommendations = [];
    const salesDeltaPct = y.totalSales ? ((t.totalSales - y.totalSales) / y.totalSales) * 100 : 0;

    if (salesDeltaPct < -8) recommendations.push('Sales dropped vs yesterday. Trigger flash bundles on top 3 breads + drink add-on.');
    if (t.aov < 120) recommendations.push('AOV is low. Add upsell prompts at checkout and combo pricing.');
    if (runouts.length > 0) recommendations.push(`Detected ${runouts.length} runout item(s). Increase early-batch production for high sell-through items.`);
    if (totalWasteQty > 15) recommendations.push('Waste is elevated. Reduce late-day production for slow movers and re-balance batch timing.');
    if (recommendations.length === 0) recommendations.push('Ops health is stable. Keep current production rhythm and monitor evening demand spikes.');

    res.json({
      success: true,
      data: {
        date,
        sales: {
          today: { ...t, totalSalesFormatted: formatCurrency(t.totalSales), aovFormatted: formatCurrency(t.aov) },
          yesterday: { ...y, totalSalesFormatted: formatCurrency(y.totalSales), aovFormatted: formatCurrency(y.aov) },
          monthToDate: { ...m, totalSalesFormatted: formatCurrency(m.totalSales), aovFormatted: formatCurrency(m.aov) },
          deltaVsYesterdayPct: salesDeltaPct
        },
        production: {
          skuCount: inventoryRows.length,
          totalProduction: production,
          totalSold: sold,
          totalRemaining: remaining,
          runoutCount: runouts.length,
          runouts
        },
        waste: {
          totalQty: totalWasteQty,
          totalValue: totalWasteValue,
          totalValueFormatted: formatCurrency(totalWasteValue)
        },
        recommendations
      }
    });
  } catch (error) {
    console.error('Error fetching executive daily report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch executive daily report',
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
      'GET /api/cashiers/performance',
      'GET /api/analytics/overview',
      'GET /api/executive/daily'
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
  GET  /api/analytics/overview        - Steward KPI + recommendations
  GET  /api/executive/daily           - Daily executive brief (sales + ops + actions)

Authentication: x-api-key header required for all /api/* endpoints
  `);
});
