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
    
    // Get today's date string (local time)
    getTodayString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    // Load today's inventory
    async loadTodayStock() {
        try {
            // Wait for db to be ready
            if (typeof db === 'undefined' || !db) {
                console.warn('StockManager: Firestore not ready, retrying in 500ms...');
                await new Promise(r => setTimeout(r, 500));
                if (!db) {
                    console.error('StockManager: Firestore still not available');
                    return;
                }
            }
            
            const today = this.getTodayString();
            console.log('StockManager: Loading stock for date:', today);
            
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
            
            console.log(`StockManager: Loaded stock for ${Object.keys(this.stockCache).length} products`);
            
            // Refresh POS display after loading
            if (typeof POS !== 'undefined' && POS.renderProducts) {
                POS.renderProducts();
            }
        } catch (error) {
            console.error('StockManager: Error loading stock:', error);
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
    
    // Check if product is exempt from stock control (drinks, addons)
    isStockExempt(productId) {
        // Get product from POS
        if (typeof POS === 'undefined' || !POS.products) return false;
        
        const product = POS.products.find(p => p.id === productId);
        if (!product) return false;
        
        const category = (product.category || '').toLowerCase();
        const mainCategory = (product.mainCategory || '').toLowerCase();
        
        // Drinks categories - exempt from stock control
        const drinkCategories = ['coffee', 'non-coffee', 'drinks', 'beverages'];
        const isDrink = mainCategory === 'drinks' || drinkCategories.some(c => category.includes(c));
        
        // Add-on categories - exempt from stock control
        const addonCategories = ['box', 'creamer', 'sugar', 'extras', 'addon', 'add-on', 'addons', 'add-ons'];
        const isAddon = mainCategory === 'addons' || mainCategory === 'add-ons' || addonCategories.some(c => category.includes(c));
        
        return isDrink || isAddon;
    },
    
    // Check stock before adding to cart
    // STRICT MODE: Breads without stock records OR with 0 stock cannot be sold
    // EXEMPT: Drinks and Addons can be sold without stock records
    canAddToCart(productId, requestedQty, currentCartQty = 0) {
        const stock = this.getStock(productId);
        const totalNeeded = requestedQty + currentCartQty;
        
        // Check if product is exempt from stock control (drinks, addons)
        const isExempt = this.isStockExempt(productId);
        
        if (!stock.hasRecord) {
            if (isExempt) {
                // Drinks/Addons - allow without stock record
                return {
                    allowed: true,
                    warning: null,
                    available: null,
                    reason: 'exempt'
                };
            }
            // Breads - BLOCK sale (strict mode)
            return {
                allowed: false,
                warning: 'No stock record - cannot sell',
                available: 0,
                reason: 'no_record'
            };
        }
        
        if (stock.sellable <= 0) {
            if (isExempt) {
                // Drinks/Addons - allow even with 0 stock (not tracked yet)
                return {
                    allowed: true,
                    warning: null,
                    available: null,
                    reason: 'exempt'
                };
            }
            // Breads - BLOCK sale
            return {
                allowed: false,
                warning: 'SOLD OUT - no stock available',
                available: 0,
                reason: 'sold_out'
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
            available: stock.sellable,
            reason: 'insufficient'
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
                    
                    // Calculate if this sale causes sell-out
                    const totalAvailable = data.totalAvailable || 0;
                    const reserved = data.reservedQty || 0;
                    const newSellable = totalAvailable - reserved - newSoldQty;
                    
                    const updateData = {
                        soldQty: newSoldQty,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    // Track sell-out time if stock just hit 0
                    if (newSellable <= 0 && !data.soldOutAt) {
                        updateData.soldOutAt = firebase.firestore.FieldValue.serverTimestamp();
                        console.log(`📢 ${item.productId} SOLD OUT at ${new Date().toLocaleTimeString()}`);
                    }
                    
                    transaction.update(docRef, updateData);
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
     * Drinks and Addons show as "exempt" (no stock tracking)
     */
    getStockStatusText(productId) {
        const stock = this.getStock(productId);
        const isExempt = this.isStockExempt(productId);
        
        if (!stock.hasRecord) {
            if (isExempt) {
                // Drinks/Addons without record - show as available (exempt)
                return { text: '✓', class: 'stock-exempt', qty: null };
            }
            return { text: 'No stock', class: 'stock-none', qty: null };
        }
        
        if (stock.sellable <= 0) {
            if (isExempt) {
                // Drinks/Addons with 0 stock - still available (exempt)
                return { text: '✓', class: 'stock-exempt', qty: null };
            }
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
