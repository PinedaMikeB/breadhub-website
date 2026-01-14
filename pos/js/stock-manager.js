/**
 * BreadHub POS - Stock Management Module
 * 
 * Integrates with ProofMaster's dailyInventory collection
 * - Checks stock availability before adding to cart
 * - Deducts stock on sale completion
 * - Shows low stock warnings
 */

const StockManager = {
    // Cache of today's stock
    stockCache: {},
    
    // Real-time listener
    unsubscribe: null,
    
    // Initialize
    async init() {
        await this.loadTodayStock();
        this.setupRealtimeListener();
        console.log('StockManager initialized');
    },
    
    // Get today's date string
    getTodayString() {
        const now = new Date();
        return now.toISOString().split('T')[0];
    },
    
    // Load today's inventory
    async loadTodayStock() {
        try {
            const today = this.getTodayString();
            const snapshot = await db.collection('dailyInventory')
                .where('date', '==', today)
                .get();
            
            this.stockCache = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                this.stockCache[data.productId] = {
                    id: doc.id,
                    ...data,
                    sellable: this.calculateSellable(data)
                };
            });
            
            console.log(`Loaded stock for ${Object.keys(this.stockCache).length} products`);
        } catch (error) {
            console.error('Error loading stock:', error);
        }
    },
    
    // Setup real-time listener for stock updates
    setupRealtimeListener() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        const today = this.getTodayString();
        this.unsubscribe = db.collection('dailyInventory')
            .where('date', '==', today)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    const data = change.doc.data();
                    if (change.type === 'added' || change.type === 'modified') {
                        this.stockCache[data.productId] = {
                            id: change.doc.id,
                            ...data,
                            sellable: this.calculateSellable(data)
                        };
                    } else if (change.type === 'removed') {
                        delete this.stockCache[data.productId];
                    }
                });
                
                // Refresh POS display if available
                if (typeof POS !== 'undefined' && POS.renderProducts) {
                    POS.renderProducts();
                }
            }, error => {
                console.error('Stock listener error:', error);
            });
    },
    
    // Calculate sellable quantity
    calculateSellable(record) {
        const total = record.totalAvailable || 0;
        const reserved = record.reservedQty || 0;
        const sold = record.soldQty || 0;
        const cancelled = record.cancelledQty || 0;
        return Math.max(0, total - reserved - sold + cancelled);
    },
    
    // Get stock for a product
    getStock(productId) {
        const stock = this.stockCache[productId];
        if (!stock) {
            return {
                hasRecord: false,
                sellable: 0,
                totalAvailable: 0,
                reserved: 0,
                sold: 0
            };
        }
        
        return {
            hasRecord: true,
            sellable: stock.sellable,
            totalAvailable: stock.totalAvailable || 0,
            reserved: stock.reservedQty || 0,
            sold: stock.soldQty || 0,
            hasCarryover: (stock.carryoverQty || 0) > 0,
            carryoverQty: stock.carryoverQty || 0
        };
    },
    
    // Check if product is in stock
    isInStock(productId, quantity = 1) {
        const stock = this.getStock(productId);
        return stock.sellable >= quantity;
    },
    
    // Check stock before adding to cart
    canAddToCart(productId, requestedQty, currentCartQty = 0) {
        const stock = this.getStock(productId);
        const totalNeeded = requestedQty + currentCartQty;
        
        if (!stock.hasRecord) {
            // No inventory record - allow sale but warn
            return {
                allowed: true,
                warning: 'No stock record for today',
                available: null
            };
        }
        
        if (stock.sellable >= totalNeeded) {
            return {
                allowed: true,
                warning: stock.sellable <= 5 ? `Only ${stock.sellable} left` : null,
                available: stock.sellable
            };
        }
        
        return {
            allowed: false,
            warning: `Only ${stock.sellable} available (need ${totalNeeded})`,
            available: stock.sellable
        };
    },

    /**
     * Deduct stock after sale is completed
     * @param {Array} items - Sale items [{productId, quantity}, ...]
     * @param {string} saleId - Sale ID for reference
     */
    async deductStock(items, saleId) {
        const today = this.getTodayString();
        const results = [];
        
        for (const item of items) {
            const docId = `${today}_${item.productId}`;
            
            try {
                const docRef = db.collection('dailyInventory').doc(docId);
                
                await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(docRef);
                    
                    if (!doc.exists) {
                        console.warn(`No inventory record for ${item.productId}`);
                        results.push({
                            productId: item.productId,
                            success: false,
                            error: 'No inventory record'
                        });
                        return;
                    }
                    
                    const data = doc.data();
                    const newSoldQty = (data.soldQty || 0) + item.quantity;
                    
                    transaction.update(docRef, {
                        soldQty: newSoldQty,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                // Log stock movement
                await db.collection('stockMovements').add({
                    productId: item.productId,
                    date: today,
                    type: 'sale',
                    qty: -item.quantity,
                    orderId: saleId,
                    notes: `POS walk-in sale`,
                    performedBy: Auth?.userData?.name || 'POS',
                    performedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                results.push({
                    productId: item.productId,
                    success: true,
                    deducted: item.quantity
                });
                
            } catch (error) {
                console.error(`Error deducting stock for ${item.productId}:`, error);
                results.push({
                    productId: item.productId,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    },
    
    /**
     * Get stock status text for display
     */
    getStockStatusText(productId) {
        const stock = this.getStock(productId);
        
        if (!stock.hasRecord) {
            return { text: 'No stock', class: 'stock-none', qty: null };
        }
        
        if (stock.sellable <= 0) {
            return { text: 'SOLD OUT', class: 'stock-out', qty: 0 };
        }
        
        if (stock.sellable <= 5) {
            return { text: `${stock.sellable} left`, class: 'stock-low', qty: stock.sellable };
        }
        
        return { text: `${stock.sellable} in stock`, class: 'stock-ok', qty: stock.sellable };
    },
    
    /**
     * Get all products with stock status
     */
    getAllStock() {
        return Object.entries(this.stockCache).map(([productId, data]) => ({
            productId,
            productName: data.productName,
            sellable: data.sellable,
            totalAvailable: data.totalAvailable,
            reserved: data.reservedQty || 0,
            sold: data.soldQty || 0
        }));
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Will be initialized after Firebase is ready
});
