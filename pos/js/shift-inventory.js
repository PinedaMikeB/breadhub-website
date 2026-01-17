/**
 * BreadHub POS - Shift Inventory Endorsement System
 * 
 * Tracks inventory handover between shifts:
 * - Beginning inventory received at shift start
 * - POS sales during shift (auto-tracked)
 * - End-of-shift physical count
 * - Variance calculation (shortage/overage)
 * - Accountability per cashier
 */

const ShiftInventory = {
    // Current shift's starting inventory
    startInventory: {},
    
    // Initialize
    async init() {
        console.log('ShiftInventory module initialized');
    },
    
    // Get today's date string
    getTodayString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    // ========== SHIFT START: RECEIVE INVENTORY ==========
    
    /**
     * Show inventory endorsement modal at shift start
     * Called after cash handover confirmation
     */
    async showStartInventoryModal(previousShiftId = null) {
        const today = this.getTodayString();
        
        try {
            // Load current stock from dailyInventory
            const snapshot = await db.collection('dailyInventory')
                .where('date', '==', today)
                .get();
            
            const inventory = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const sellable = this.calculateSellable(data);
                if (sellable > 0) {
                    inventory.push({
                        productId: data.productId,
                        productName: data.productName,
                        category: data.category || '',
                        expected: sellable,
                        received: sellable // Default to expected
                    });
                }
            });
            
            // Sort by category then name
            inventory.sort((a, b) => {
                if (a.category !== b.category) return a.category.localeCompare(b.category);
                return a.productName.localeCompare(b.productName);
            });
            
            if (inventory.length === 0) {
                // No inventory - just proceed
                Toast.info('No inventory to endorse');
                return { skipped: true, reason: 'no_inventory' };
            }
            
            // Build the modal content
            let rows = '';
            let currentCategory = '';
            
            inventory.forEach((item, index) => {
                if (item.category !== currentCategory) {
                    currentCategory = item.category;
                    rows += `
                        <tr class="category-header">
                            <td colspan="4" style="background:#2d3748;color:#D4894A;font-weight:600;padding:8px 12px;">
                                ${currentCategory || 'Other'}
                            </td>
                        </tr>
                    `;
                }
                rows += `
                    <tr data-product-id="${item.productId}">
                        <td style="padding:8px 12px;">${item.productName}</td>
                        <td style="padding:8px 12px;text-align:center;color:#888;">${item.expected}</td>
                        <td style="padding:8px 12px;text-align:center;">
                            <input type="number" class="inv-received" min="0" value="${item.expected}" 
                                   style="width:70px;text-align:center;padding:6px;border-radius:4px;border:1px solid #444;background:#1a2e3b;color:#fff;"
                                   data-expected="${item.expected}">
                        </td>
                        <td style="padding:8px 12px;text-align:center;" class="inv-variance">-</td>
                    </tr>
                `;
            });
            
            return new Promise((resolve) => {
                Modal.open({
                    title: '📦 Receive Inventory - Start of Shift',
                    width: '700px',
                    content: `
                        <div style="margin-bottom:16px;padding:12px;background:#1a3a4a;border-radius:8px;">
                            <p style="margin:0;color:#aaa;">Count the inventory you're receiving from the previous shift. Any shortage will be noted.</p>
                        </div>
                        
                        <div style="max-height:400px;overflow-y:auto;">
                            <table class="report-table" style="font-size:0.9rem;">
                                <thead>
                                    <tr>
                                        <th style="text-align:left;">Product</th>
                                        <th style="text-align:center;">Expected</th>
                                        <th style="text-align:center;">Received</th>
                                        <th style="text-align:center;">Variance</th>
                                    </tr>
                                </thead>
                                <tbody id="invStartBody">
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                        
                        <div id="invStartSummary" style="margin-top:16px;padding:12px;background:#2d3748;border-radius:8px;">
                            <div style="display:flex;justify-content:space-between;">
                                <span>Total Items:</span>
                                <strong id="invTotalItems">${inventory.length}</strong>
                            </div>
                            <div style="display:flex;justify-content:space-between;margin-top:8px;">
                                <span>Total Variance:</span>
                                <strong id="invTotalVariance" style="color:#27ae60;">0</strong>
                            </div>
                        </div>
                    `,
                    customFooter: `
                        <div style="display:flex;gap:12px;justify-content:flex-end;padding:16px;">
                            <button class="btn btn-outline" onclick="Modal.close(); ShiftInventory._resolveStart({ skipped: true, reason: 'cancelled' });">
                                Skip for Now
                            </button>
                            <button class="btn btn-success btn-lg" onclick="ShiftInventory.confirmStartInventory()">
                                ✅ Confirm & Start Shift
                            </button>
                        </div>
                    `,
                    hideFooter: true
                });
                
                // Store resolve function
                this._resolveStart = resolve;
                this._startInventoryData = inventory;
                this._previousShiftId = previousShiftId;
                
                // Add input listeners
                setTimeout(() => {
                    document.querySelectorAll('.inv-received').forEach(input => {
                        input.addEventListener('input', () => this.updateStartVariance());
                    });
                }, 100);
            });
            
        } catch (error) {
            console.error('Error loading inventory:', error);
            Toast.error('Failed to load inventory');
            return { skipped: true, reason: 'error', error: error.message };
        }
    },
    
    updateStartVariance() {
        let totalVariance = 0;
        
        document.querySelectorAll('#invStartBody tr[data-product-id]').forEach(row => {
            const input = row.querySelector('.inv-received');
            const varianceCell = row.querySelector('.inv-variance');
            const expected = parseInt(input.dataset.expected) || 0;
            const received = parseInt(input.value) || 0;
            const variance = received - expected;
            
            totalVariance += variance;
            
            if (variance === 0) {
                varianceCell.innerHTML = '<span style="color:#666;">-</span>';
            } else if (variance > 0) {
                varianceCell.innerHTML = `<span style="color:#27ae60;">+${variance}</span>`;
            } else {
                varianceCell.innerHTML = `<span style="color:#e74c3c;">${variance}</span>`;
            }
        });
        
        const totalEl = document.getElementById('invTotalVariance');
        if (totalVariance === 0) {
            totalEl.innerHTML = '0';
            totalEl.style.color = '#27ae60';
        } else if (totalVariance > 0) {
            totalEl.innerHTML = `+${totalVariance}`;
            totalEl.style.color = '#27ae60';
        } else {
            totalEl.innerHTML = `${totalVariance}`;
            totalEl.style.color = '#e74c3c';
        }
    },
    
    async confirmStartInventory() {
        const inventory = [];
        let totalVariance = 0;
        
        document.querySelectorAll('#invStartBody tr[data-product-id]').forEach(row => {
            const productId = row.dataset.productId;
            const input = row.querySelector('.inv-received');
            const expected = parseInt(input.dataset.expected) || 0;
            const received = parseInt(input.value) || 0;
            const variance = received - expected;
            
            const item = this._startInventoryData.find(i => i.productId === productId);
            if (item) {
                inventory.push({
                    productId,
                    productName: item.productName,
                    category: item.category,
                    expected,
                    received,
                    variance
                });
                totalVariance += variance;
            }
        });
        
        // Store in memory for this shift
        this.startInventory = {};
        inventory.forEach(item => {
            this.startInventory[item.productId] = item;
        });
        
        Modal.close();
        
        // Resolve the promise with the inventory data
        if (this._resolveStart) {
            this._resolveStart({
                skipped: false,
                inventory,
                totalVariance,
                previousShiftId: this._previousShiftId
            });
        }
    },

    calculateSellable(record) {
        const total = (record.carryoverQty || 0) + (record.newProductionQty || 0);
        const reserved = record.reservedQty || 0;
        const sold = record.soldQty || 0;
        const cancelled = record.cancelledQty || 0;
        return Math.max(0, total - reserved - sold + cancelled);
    },

    // ========== SHIFT END: COUNT INVENTORY ==========
    
    /**
     * Show end-of-shift inventory count modal
     * Called during shift end process
     */
    async showEndInventoryModal() {
        const today = this.getTodayString();
        const shiftId = Auth.currentShift?.id;
        
        if (!shiftId) {
            Toast.error('No active shift');
            return { skipped: true, reason: 'no_shift' };
        }
        
        try {
            // Get sales during this shift
            const sales = await DB.query('sales', 'shiftId', '==', shiftId);
            
            // Aggregate quantities sold per product
            const soldByProduct = {};
            sales.forEach(sale => {
                if (sale.items) {
                    sale.items.forEach(item => {
                        const pid = item.productId;
                        if (!soldByProduct[pid]) {
                            soldByProduct[pid] = { qty: 0, sales: 0, name: item.productName };
                        }
                        soldByProduct[pid].qty += item.quantity || 1;
                        soldByProduct[pid].sales += item.lineTotal || 0;
                    });
                }
            });
            
            // Load current stock
            const snapshot = await db.collection('dailyInventory')
                .where('date', '==', today)
                .get();
            
            const inventory = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const productId = data.productId;
                const startQty = this.startInventory[productId]?.received || this.calculateSellable(data);
                const soldQty = soldByProduct[productId]?.qty || 0;
                const expectedEnd = Math.max(0, startQty - soldQty);
                
                inventory.push({
                    productId,
                    productName: data.productName,
                    category: data.category || '',
                    startQty,
                    soldQty,
                    expectedEnd,
                    actualEnd: expectedEnd // Default to expected
                });
            });
            
            // Sort by category then name
            inventory.sort((a, b) => {
                if (a.category !== b.category) return a.category.localeCompare(b.category);
                return a.productName.localeCompare(b.productName);
            });
            
            // Filter to only items that had stock at start or were sold
            const relevantInventory = inventory.filter(i => i.startQty > 0 || i.soldQty > 0);
            
            if (relevantInventory.length === 0) {
                return { skipped: true, reason: 'no_inventory' };
            }
            
            // Build modal content
            let rows = '';
            let currentCategory = '';
            
            relevantInventory.forEach(item => {
                if (item.category !== currentCategory) {
                    currentCategory = item.category;
                    rows += `
                        <tr class="category-header">
                            <td colspan="5" style="background:#2d3748;color:#D4894A;font-weight:600;padding:8px 12px;">
                                ${currentCategory || 'Other'}
                            </td>
                        </tr>
                    `;
                }
                rows += `
                    <tr data-product-id="${item.productId}">
                        <td style="padding:6px 10px;font-size:0.85rem;">${item.productName}</td>
                        <td style="padding:6px 10px;text-align:center;color:#888;">${item.startQty}</td>
                        <td style="padding:6px 10px;text-align:center;color:#e74c3c;">${item.soldQty}</td>
                        <td style="padding:6px 10px;text-align:center;">
                            <input type="number" class="inv-actual" min="0" value="${item.expectedEnd}" 
                                   style="width:60px;text-align:center;padding:4px;border-radius:4px;border:1px solid #444;background:#1a2e3b;color:#fff;font-size:0.9rem;"
                                   data-expected="${item.expectedEnd}" data-start="${item.startQty}" data-sold="${item.soldQty}">
                        </td>
                        <td style="padding:6px 10px;text-align:center;" class="inv-variance">-</td>
                    </tr>
                `;
            });
            
            return new Promise((resolve) => {
                Modal.open({
                    title: '📋 End-of-Shift Inventory Count',
                    width: '750px',
                    content: `
                        <div style="margin-bottom:12px;padding:10px;background:#1a3a4a;border-radius:8px;">
                            <p style="margin:0;color:#aaa;font-size:0.9rem;">
                                Count remaining inventory. Shortages will be recorded and charged to your account.
                            </p>
                        </div>
                        
                        <div style="max-height:350px;overflow-y:auto;">
                            <table class="report-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th style="text-align:left;">Product</th>
                                        <th style="text-align:center;">Start</th>
                                        <th style="text-align:center;">Sold</th>
                                        <th style="text-align:center;">Actual</th>
                                        <th style="text-align:center;">Variance</th>
                                    </tr>
                                </thead>
                                <tbody id="invEndBody">
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                        
                        <div id="invEndSummary" style="margin-top:12px;padding:12px;background:#2d3748;border-radius:8px;">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                                <div>
                                    <div style="color:#888;font-size:0.8rem;">Total Shortage</div>
                                    <div id="invShortageCount" style="font-size:1.2rem;font-weight:bold;color:#e74c3c;">0 pcs</div>
                                </div>
                                <div>
                                    <div style="color:#888;font-size:0.8rem;">Shortage Value</div>
                                    <div id="invShortageValue" style="font-size:1.2rem;font-weight:bold;color:#e74c3c;">₱0.00</div>
                                </div>
                            </div>
                        </div>
                    `,
                    customFooter: `
                        <div style="display:flex;gap:12px;justify-content:flex-end;padding:16px;">
                            <button class="btn btn-outline" onclick="Modal.close(); ShiftInventory._resolveEnd({ skipped: true });">
                                Skip
                            </button>
                            <button class="btn btn-success btn-lg" onclick="ShiftInventory.confirmEndInventory()">
                                ✅ Confirm Count
                            </button>
                        </div>
                    `,
                    hideFooter: true
                });
                
                this._resolveEnd = resolve;
                this._endInventoryData = relevantInventory;
                
                // Add input listeners
                setTimeout(() => {
                    document.querySelectorAll('.inv-actual').forEach(input => {
                        input.addEventListener('input', () => this.updateEndVariance());
                    });
                }, 100);
            });
            
        } catch (error) {
            console.error('Error loading end inventory:', error);
            return { skipped: true, reason: 'error', error: error.message };
        }
    },
    
    async updateEndVariance() {
        let totalShortage = 0;
        let totalShortageValue = 0;
        
        // Get product prices
        const products = typeof POS !== 'undefined' ? POS.products : [];
        
        document.querySelectorAll('#invEndBody tr[data-product-id]').forEach(row => {
            const productId = row.dataset.productId;
            const input = row.querySelector('.inv-actual');
            const varianceCell = row.querySelector('.inv-variance');
            const expected = parseInt(input.dataset.expected) || 0;
            const actual = parseInt(input.value) || 0;
            const variance = actual - expected;
            
            // Get product price for value calculation
            const product = products.find(p => p.id === productId);
            const price = product?.price || product?.variants?.[0]?.price || 0;
            
            if (variance === 0) {
                varianceCell.innerHTML = '<span style="color:#27ae60;">✓</span>';
            } else if (variance > 0) {
                varianceCell.innerHTML = `<span style="color:#3498db;">+${variance}</span>`;
            } else {
                varianceCell.innerHTML = `<span style="color:#e74c3c;font-weight:bold;">${variance}</span>`;
                totalShortage += Math.abs(variance);
                totalShortageValue += Math.abs(variance) * price;
            }
        });
        
        document.getElementById('invShortageCount').textContent = `${totalShortage} pcs`;
        document.getElementById('invShortageValue').textContent = Utils.formatCurrency(totalShortageValue);
    },
    
    async confirmEndInventory() {
        const inventory = [];
        let totalShortage = 0;
        let totalShortageValue = 0;
        
        const products = typeof POS !== 'undefined' ? POS.products : [];
        
        document.querySelectorAll('#invEndBody tr[data-product-id]').forEach(row => {
            const productId = row.dataset.productId;
            const input = row.querySelector('.inv-actual');
            const expected = parseInt(input.dataset.expected) || 0;
            const actual = parseInt(input.value) || 0;
            const startQty = parseInt(input.dataset.start) || 0;
            const soldQty = parseInt(input.dataset.sold) || 0;
            const variance = actual - expected;
            
            const item = this._endInventoryData.find(i => i.productId === productId);
            const product = products.find(p => p.id === productId);
            const price = product?.price || product?.variants?.[0]?.price || 0;
            
            if (item) {
                const invItem = {
                    productId,
                    productName: item.productName,
                    category: item.category,
                    startQty,
                    soldQty,
                    expectedEnd: expected,
                    actualEnd: actual,
                    variance,
                    unitPrice: price,
                    shortageValue: variance < 0 ? Math.abs(variance) * price : 0
                };
                inventory.push(invItem);
                
                if (variance < 0) {
                    totalShortage += Math.abs(variance);
                    totalShortageValue += invItem.shortageValue;
                }
            }
        });
        
        Modal.close();
        
        if (this._resolveEnd) {
            this._resolveEnd({
                skipped: false,
                inventory,
                totalShortage,
                totalShortageValue,
                shiftId: Auth.currentShift?.id
            });
        }
    },


    // ========== SAVE ENDORSEMENT RECORD ==========
    
    /**
     * Save shift inventory endorsement to Firebase
     */
    async saveEndorsement(type, data) {
        const shiftId = Auth.currentShift?.id;
        const today = this.getTodayString();
        
        const record = {
            type, // 'start' or 'end'
            shiftId,
            shiftNumber: Auth.currentShift?.shiftNumber,
            dateKey: today,
            cashierId: Auth.userData?.id,
            cashierName: Auth.userData?.name,
            timestamp: new Date().toISOString(),
            ...data
        };
        
        try {
            const docId = `${shiftId}_${type}`;
            await db.collection('shiftInventory').doc(docId).set(record);
            console.log(`Saved shift inventory ${type}:`, record);
            return docId;
        } catch (error) {
            console.error('Error saving endorsement:', error);
            throw error;
        }
    },
    
    /**
     * Get shift inventory report
     */
    async getShiftReport(shiftId) {
        try {
            const startDoc = await db.collection('shiftInventory').doc(`${shiftId}_start`).get();
            const endDoc = await db.collection('shiftInventory').doc(`${shiftId}_end`).get();
            
            return {
                start: startDoc.exists ? startDoc.data() : null,
                end: endDoc.exists ? endDoc.data() : null
            };
        } catch (error) {
            console.error('Error getting shift report:', error);
            return { start: null, end: null };
        }
    },
    
    /**
     * Generate shortage report for a shift
     */
    generateShortageReport(endData) {
        if (!endData || !endData.inventory) return null;
        
        const shortages = endData.inventory.filter(i => i.variance < 0);
        
        if (shortages.length === 0) return null;
        
        return {
            items: shortages,
            totalPieces: endData.totalShortage,
            totalValue: endData.totalShortageValue,
            cashierName: endData.cashierName,
            shiftNumber: endData.shiftNumber,
            date: endData.dateKey
        };
    }
};
