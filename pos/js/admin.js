/**
 * BreadHub POS - Admin Panel v5
 * - Added delete shifts, delete purchases
 * - Added staff setup modal
 * - Added permission-based visibility
 * - Added auto-refresh for shifts
 */

const Admin = {
    refreshInterval: null,
    
    async init() {
        this.loadTodayStats();
        this.loadLowStockAlerts();
        this.loadActiveShifts();
        this.loadProductAvailability();
        this.loadDiscountPresets();
        this.loadStaffList();
        this.updateChangeFundDisplay();
        this.loadFeatureToggles();
        
        // Auto-refresh shifts every 30 seconds
        this.startAutoRefresh();
    },
    
    startAutoRefresh() {
        // Clear any existing interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Refresh shifts and stats every 30 seconds
        this.refreshInterval = setInterval(() => {
            console.log('Auto-refreshing admin data...');
            this.loadActiveShifts();
            this.loadTodayStats();
        }, 30000);
    },
    
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },
    
    // Manual refresh button
    refreshShifts() {
        Toast.info('Refreshing...');
        this.loadActiveShifts();
        this.loadTodayStats();
    },
    
    // Update change fund display
    updateChangeFundDisplay() {
        const el = document.getElementById('currentChangeFund');
        if (el && Auth.changeFund) {
            el.textContent = Utils.formatCurrency(Auth.changeFund);
        }
    },
    
    // ========== TODAY'S STATS ==========
    
    async loadTodayStats() {
        const today = Utils.getTodayKey();
        
        try {
            // Get today's sales
            const sales = await DB.query('sales', 'dateKey', '==', today);
            
            const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
            const transactionCount = sales.length;
            const avgTicket = transactionCount > 0 ? totalSales / transactionCount : 0;
            
            // Get today's online orders
            const orders = await DB.query('orders', 'dateKey', '==', today);
            const onlineCount = orders.length;
            
            document.getElementById('todaySales').textContent = Utils.formatCurrency(totalSales);
            document.getElementById('todayOrders').textContent = transactionCount;
            document.getElementById('todayOnlineOrders').textContent = onlineCount;
            document.getElementById('todayAvgTicket').textContent = Utils.formatCurrency(avgTicket);
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },
    
    // ========== LOW STOCK ALERTS ==========
    
    async loadLowStockAlerts() {
        const container = document.getElementById('lowStockAlerts');
        if (!container) return;
        
        try {
            // Check ingredients
            const ingredients = await DB.getAll('ingredients');
            const lowIngredients = ingredients.filter(i => 
                i.currentStock !== undefined && 
                i.reorderLevel !== undefined && 
                i.currentStock <= i.reorderLevel
            );
            
            // Check packaging
            const packaging = await DB.getAll('packagingMaterials');
            const lowPackaging = packaging.filter(p => 
                p.currentStock !== undefined && 
                p.reorderLevel !== undefined && 
                p.currentStock <= p.reorderLevel
            );
            
            const allLow = [
                ...lowIngredients.map(i => ({ ...i, type: 'ingredient' })),
                ...lowPackaging.map(p => ({ ...p, type: 'packaging' }))
            ];
            
            if (allLow.length === 0) {
                container.innerHTML = '<p class="success-message">✅ All stock levels OK</p>';
                return;
            }
            
            container.innerHTML = allLow.map(item => `
                <div class="alert-item ${item.currentStock === 0 ? 'critical' : 'warning'}">
                    <span class="alert-icon">${item.currentStock === 0 ? '🔴' : '🟡'}</span>
                    <div class="alert-info">
                        <strong>${item.name}</strong>
                        <span>${item.type === 'ingredient' ? '🥣' : '📦'}</span>
                    </div>
                    <div class="alert-stock">
                        ${item.currentStock} / ${item.reorderLevel} ${item.unit || 'units'}
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading stock alerts:', error);
            container.innerHTML = '<p class="error">Failed to load alerts</p>';
        }
    },
    
    // ========== SHIFTS ==========
    
    async loadActiveShifts() {
        const container = document.getElementById('activeShifts');
        if (!container) return;
        
        try {
            const today = Utils.getTodayKey();
            
            // Use fresh queries to bypass Firestore cache
            const shifts = await DB.queryFresh('shifts', 'dateKey', '==', today);
            
            if (shifts.length === 0) {
                container.innerHTML = '<p class="empty-state">No shifts today</p>';
                return;
            }
            
            // Get sales for each shift - also fresh
            const sales = await DB.queryFresh('sales', 'dateKey', '==', today);
            
            console.log(`Loaded ${shifts.length} shifts, ${sales.length} sales for ${today}`);
            
            // Sort shifts by number
            shifts.sort((a, b) => (a.shiftNumber || 0) - (b.shiftNumber || 0));
            
            container.innerHTML = shifts.map(shift => {
                const shiftSales = sales.filter(s => s.shiftId === shift.id);
                const shiftTotal = shiftSales.reduce((sum, s) => sum + (s.total || 0), 0);
                const txnCount = shiftSales.length;
                
                return `
                    <div class="shift-card ${shift.status === 'active' ? 'active' : 'completed'}">
                        <div class="shift-header">
                            <span class="shift-number">Shift #${shift.shiftNumber || '?'}</span>
                            <span class="shift-status-badge ${shift.status}">${shift.status === 'active' ? '🟢 Active' : '✅ Completed'}</span>
                        </div>
                        <div class="shift-cashier">
                            <strong>${shift.staffName || shift.userName || 'Unknown'}</strong>
                            <span class="role-tag">${shift.staffRole || 'cashier'}</span>
                        </div>
                        <div class="shift-times">
                            <span>⏰ ${Utils.formatTime(shift.startTime)}</span>
                            ${shift.endTime ? `<span>→ ${Utils.formatTime(shift.endTime)}</span>` : '<span class="ongoing">Ongoing...</span>'}
                        </div>
                        <div class="shift-stats">
                            <div class="stat-item">
                                <span class="stat-value">${Utils.formatCurrency(shiftTotal)}</span>
                                <span class="stat-label">Sales</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${txnCount}</span>
                                <span class="stat-label">Transactions</span>
                            </div>
                        </div>
                        ${shift.status === 'completed' && shift.variance !== undefined ? `
                            <div class="shift-variance ${shift.variance >= 0 ? 'positive' : 'negative'}">
                                Variance: ${Utils.formatCurrency(shift.variance)}
                            </div>
                        ` : ''}
                        <button class="btn btn-sm btn-block" onclick="Admin.viewShiftDetails('${shift.id}')">
                            📋 View Details
                        </button>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error loading shifts:', error);
            container.innerHTML = '<p class="error">Failed to load shifts</p>';
        }
    },
    
    async viewShiftDetails(shiftId) {
        try {
            // Get shift - fresh from server
            const shifts = await DB.getAllFresh('shifts');
            const shift = shifts.find(s => s.id === shiftId);
            if (!shift) {
                Toast.error('Shift not found');
                return;
            }
            
            // Get sales for this shift - fresh from server
            const allSales = await DB.queryFresh('sales', 'shiftId', '==', shiftId);
            const shiftSales = allSales;
            const totalSales = shiftSales.reduce((sum, s) => sum + (s.total || 0), 0);
            
            console.log(`Shift ${shiftId}: Found ${shiftSales.length} sales, total: ${totalSales}`);
            
            // Calculate discount totals
            let totalDiscounts = 0;
            let discountTransactions = 0;
            const discountBreakdown = {};
            
            // Calculate payment method breakdown
            const paymentBreakdown = {
                cash: { count: 0, amount: 0 },
                gcash: { count: 0, amount: 0 },
                card: { count: 0, amount: 0 }
            };
            
            shiftSales.forEach(sale => {
                // Payment method tracking
                const method = sale.paymentMethod || 'cash';
                if (paymentBreakdown[method]) {
                    paymentBreakdown[method].count++;
                    paymentBreakdown[method].amount += sale.total || 0;
                }
                
                if (sale.totalDiscount > 0) {
                    totalDiscounts += sale.totalDiscount;
                    discountTransactions++;
                    
                    // Track by type
                    if (sale.discountInfo?.details) {
                        Object.entries(sale.discountInfo.details).forEach(([type, info]) => {
                            if (!discountBreakdown[type]) {
                                discountBreakdown[type] = { name: info.name, count: 0, amount: 0 };
                            }
                            discountBreakdown[type].count++;
                            discountBreakdown[type].amount += info.amount;
                        });
                    }
                }
            });
            
            // Store sales for detail view
            this.shiftSales = shiftSales;
            
            Modal.open({
                title: `📋 Shift #${shift.shiftNumber} Details`,
                width: '95vw',
                content: `
                    <div class="shift-detail-modal">
                        <div class="detail-grid">
                            <div class="detail-item">
                                <span class="label">Cashier</span>
                                <span class="value">${shift.staffName || 'Unknown'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Date</span>
                                <span class="value">${shift.dateKey}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Start Time</span>
                                <span class="value">${Utils.formatTime(shift.startTime)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">End Time</span>
                                <span class="value">${shift.endTime ? Utils.formatTime(shift.endTime) : 'Ongoing'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Starting Cash</span>
                                <span class="value">${Utils.formatCurrency(shift.startingCash || 0)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Ending Cash</span>
                                <span class="value">${shift.actualCash ? Utils.formatCurrency(shift.actualCash) : '-'}</span>
                            </div>
                            <div class="detail-item highlight">
                                <span class="label">Total Sales</span>
                                <span class="value">${Utils.formatCurrency(totalSales)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Transactions</span>
                                <span class="value">${shiftSales.length}</span>
                            </div>
                        </div>
                        
                        <div class="payment-summary-box">
                            <h4>💳 Payment Methods</h4>
                            <div class="payment-breakdown">
                                <div class="payment-item">
                                    <span class="payment-icon">💵</span>
                                    <span class="payment-label">Cash</span>
                                    <span class="payment-count">${paymentBreakdown.cash.count}x</span>
                                    <span class="payment-amount">${Utils.formatCurrency(paymentBreakdown.cash.amount)}</span>
                                </div>
                                <div class="payment-item gcash">
                                    <span class="payment-icon">📱</span>
                                    <span class="payment-label">GCash</span>
                                    <span class="payment-count">${paymentBreakdown.gcash.count}x</span>
                                    <span class="payment-amount">${Utils.formatCurrency(paymentBreakdown.gcash.amount)}</span>
                                </div>
                                <div class="payment-item">
                                    <span class="payment-icon">💳</span>
                                    <span class="payment-label">Card</span>
                                    <span class="payment-count">${paymentBreakdown.card.count}x</span>
                                    <span class="payment-amount">${Utils.formatCurrency(paymentBreakdown.card.amount)}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${totalDiscounts > 0 ? `
                        <div class="discount-summary-box">
                            <h4>🏷️ Discounts Given</h4>
                            <div class="discount-stats">
                                <div class="discount-stat">
                                    <span class="stat-value">${discountTransactions}</span>
                                    <span class="stat-label">Transactions w/ Discount</span>
                                </div>
                                <div class="discount-stat">
                                    <span class="stat-value">${Utils.formatCurrency(totalDiscounts)}</span>
                                    <span class="stat-label">Total Discounts</span>
                                </div>
                            </div>
                            <div class="discount-breakdown">
                                ${Object.entries(discountBreakdown).map(([type, info]) => `
                                    <div class="breakdown-item">
                                        <span>${info.name}</span>
                                        <span>${info.count}x</span>
                                        <span>${Utils.formatCurrency(info.amount)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                        
                        <h4>Transactions</h4>
                        <p class="txn-hint">👆 Tap a transaction to view details and ID photos</p>
                        <div class="shift-transactions">
                            ${shiftSales.length === 0 ? '<p>No transactions in this shift</p>' : 
                                shiftSales.map(s => `
                                    <div class="txn-item ${s.totalDiscount > 0 ? 'has-discount' : ''}" onclick="Admin.viewSaleDetails('${s.id}')">
                                        <div class="txn-main">
                                            <span class="txn-id">${s.saleId}</span>
                                            <span class="txn-time">${Utils.formatTime(s.timestamp)}</span>
                                        </div>
                                        <div class="txn-info">
                                            <span class="txn-items">${s.items?.length || 0} items</span>
                                            ${s.totalDiscount > 0 ? `<span class="txn-discount">-${Utils.formatCurrency(s.totalDiscount)}</span>` : ''}
                                            ${s.discountInfo?.idPhoto ? `<span class="txn-has-id">📸</span>` : ''}
                                        </div>
                                        <span class="txn-total">${Utils.formatCurrency(s.total)}</span>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                `,
                hideFooter: true
            });
            
        } catch (error) {
            console.error('Error viewing shift:', error);
            Toast.error('Failed to load shift details');
        }
    },
    
    viewSaleDetails(saleId) {
        const sale = this.shiftSales?.find(s => s.id === saleId);
        if (!sale) return;
        
        Modal.open({
            title: `🧾 ${sale.saleId}`,
            content: `
                <div class="sale-detail-modal">
                    <div class="sale-header">
                        <p><strong>Time:</strong> ${new Date(sale.timestamp).toLocaleString('en-PH')}</p>
                        <p><strong>Cashier:</strong> ${sale.cashierName}</p>
                        <p><strong>Payment:</strong> ${sale.paymentMethod?.toUpperCase() || 'Cash'}</p>
                    </div>
                    
                    <div class="sale-items">
                        <h4>Items</h4>
                        ${sale.items.map(item => `
                            <div class="sale-item-row">
                                <span>${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}</span>
                                <span>${Utils.formatCurrency(item.lineTotal)}</span>
                            </div>
                            ${item.discountName ? `
                                <div class="sale-item-row discount">
                                    <span>↳ ${item.discountName} (-${item.discountPercent}%)</span>
                                    <span>-${Utils.formatCurrency(item.discountAmount * item.quantity)}</span>
                                </div>
                            ` : ''}
                        `).join('')}
                    </div>
                    
                    <div class="sale-totals">
                        ${sale.totalDiscount > 0 ? `
                            <div class="total-row">
                                <span>Subtotal</span>
                                <span>${Utils.formatCurrency(sale.subtotal)}</span>
                            </div>
                            <div class="total-row discount">
                                <span>Total Discounts</span>
                                <span>-${Utils.formatCurrency(sale.totalDiscount)}</span>
                            </div>
                        ` : ''}
                        <div class="total-row final">
                            <span>TOTAL</span>
                            <span>${Utils.formatCurrency(sale.total)}</span>
                        </div>
                    </div>
                    
                    ${sale.discountInfo?.idPhoto ? `
                        <div class="id-verification-section">
                            <h4>📸 ID Verification (${sale.discountInfo.idPhoto.photoCount || 1} photo${(sale.discountInfo.idPhoto.photoCount || 1) > 1 ? 's' : ''})</h4>
                            ${sale.discountInfo.idPhoto.photos ? `
                                <div class="id-photos-admin">
                                    ${sale.discountInfo.idPhoto.photos.map((p, i) => `
                                        <img src="${p.photoData}" alt="ID ${i+1}" class="id-photo-admin" onclick="Admin.showFullIdPhoto('${p.photoData.replace(/'/g, "\\'")}')">
                                    `).join('')}
                                </div>
                            ` : sale.discountInfo.idPhoto.photoData ? `
                                <img src="${sale.discountInfo.idPhoto.photoData}" alt="ID Photo" class="id-photo-admin" onclick="Admin.showFullIdPhoto('${sale.discountInfo.idPhoto.photoData.replace(/'/g, "\\'")}')">
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    ${sale.gcashPayment ? `
                        <div class="gcash-verification-section" style="margin-top: 16px; padding: 12px; background: #E3F2FD; border-radius: 8px;">
                            <h4 style="margin: 0 0 10px; color: #1565C0;">📱 GCash Payment Verification</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
                                <div><strong>Reference No:</strong></div>
                                <div style="font-family: monospace;">${sale.gcashPayment.refNo}</div>
                                <div><strong>Amount:</strong></div>
                                <div>₱${sale.gcashPayment.amount?.toLocaleString() || sale.total?.toLocaleString()}</div>
                                ${sale.gcashPayment.customerMobile ? `
                                    <div><strong>Customer Mobile:</strong></div>
                                    <div>${sale.gcashPayment.customerMobile}</div>
                                ` : ''}
                                ${sale.gcashPayment.senderName ? `
                                    <div><strong>Sender Name:</strong></div>
                                    <div>${sale.gcashPayment.senderName}</div>
                                ` : ''}
                            </div>
                            ${sale.gcashPayment.photoData ? `
                                <div style="margin-top: 10px;">
                                    <img src="${sale.gcashPayment.photoData}" alt="GCash Screenshot" 
                                         style="max-width: 200px; border-radius: 8px; border: 2px solid #1565C0; cursor: pointer;"
                                         onclick="Admin.showFullIdPhoto('${sale.gcashPayment.photoData.replace(/'/g, "\\'")}')">
                                    <div style="font-size: 0.8rem; color: #666; margin-top: 4px;">Click to enlarge</div>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `,
            showFooter: true,
            saveText: 'Close',
            onSave: () => true
        });
    },
    
    showFullIdPhoto(photoData) {
        Modal.open({
            title: '📸 ID Photo (Full Size)',
            content: `<img src="${photoData}" style="width:100%;border-radius:8px;">`,
            showFooter: true,
            saveText: 'Close',
            onSave: () => true
        });
    },
    
    async startShift() {
        // Now handled by Auth.showShiftStartModal()
        Toast.info('Use the PIN login to start a new shift');
    },
    
    async endShift() {
        // Now handled by Auth.endShift()
        if (Auth.currentShift && !Auth.currentShift.isAdmin) {
            Auth.endShift();
        } else {
            Toast.warning('No active shift to end');
        }
    },

    // ========== PRODUCT AVAILABILITY ==========
    
    async loadProductAvailability() {
        const container = document.getElementById('productAvailabilityList');
        if (!container) return;
        
        try {
            const products = await DB.getAll('products');
            const published = products.filter(p => p.shop?.published);
            
            if (published.length === 0) {
                container.innerHTML = '<p class="empty-state">No published products</p>';
                return;
            }
            
            container.innerHTML = `
                <div class="availability-header">
                    <span>Product</span>
                    <span>Online</span>
                </div>
                ${published.map(p => `
                    <div class="availability-item">
                        <span class="product-name">${p.name}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" 
                                   ${p.shop?.available !== false ? 'checked' : ''} 
                                   onchange="Admin.toggleAvailability('${p.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                `).join('')}
            `;
            
        } catch (error) {
            console.error('Error loading availability:', error);
        }
    },
    
    async toggleAvailability(productId, available) {
        try {
            await DB.update('products', productId, {
                'shop.available': available
            });
            Toast.success(available ? 'Product now available online' : 'Product hidden from online orders');
        } catch (error) {
            console.error('Error updating availability:', error);
            Toast.error('Failed to update');
        }
    },
    
    // ========== DISCOUNT PRESETS ==========
    
    async loadDiscountPresets() {
        const container = document.getElementById('discountPresetsList');
        if (!container) return;
        
        // Reload from Firebase to get latest
        await POS.loadDiscountPresets();
        
        if (POS.discountPresets.length === 0) {
            container.innerHTML = '<p class="empty-state">No discount presets</p>';
            return;
        }
        
        container.innerHTML = POS.discountPresets.map(d => `
            <div class="preset-item">
                <span class="preset-icon">${d.icon}</span>
                <span class="preset-name">${d.name}</span>
                <span class="preset-percent">${d.percent}%</span>
                <div class="preset-actions">
                    <button class="btn btn-icon btn-sm" onclick="Admin.editDiscountPreset('${d.id}')" title="Edit">✏️</button>
                    <button class="btn btn-icon btn-sm btn-danger" onclick="Admin.deleteDiscountPreset('${d.id}')" title="Delete">🗑️</button>
                </div>
            </div>
        `).join('');
    },
    
    addDiscountPreset() {
        Modal.open({
            title: '➕ Add Discount Preset',
            content: `
                <form id="presetForm">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" class="form-input" placeholder="e.g., Birthday" required>
                    </div>
                    <div class="form-group">
                        <label>Icon (emoji)</label>
                        <input type="text" name="icon" class="form-input" value="🎉" maxlength="4">
                    </div>
                    <div class="form-group">
                        <label>Discount %</label>
                        <input type="number" name="percent" class="form-input" value="10" min="1" max="100" required>
                    </div>
                </form>
            `,
            saveText: 'Save',
            onSave: async () => {
                const form = document.getElementById('presetForm');
                const data = new FormData(form);
                
                const preset = {
                    id: 'custom_' + Date.now(),
                    name: data.get('name'),
                    icon: data.get('icon') || '🏷️',
                    percent: parseInt(data.get('percent')) || 10
                };
                
                try {
                    await DB.add('discountPresets', preset);
                    POS.discountPresets.push(preset);
                    POS.renderDiscountBar();
                    this.loadDiscountPresets();
                    Toast.success('Discount preset added');
                } catch (error) {
                    Toast.error('Failed to save preset');
                    return false;
                }
            }
        });
    },
    
    editDiscountPreset(presetId) {
        const preset = POS.discountPresets.find(d => d.id === presetId);
        if (!preset) return;
        
        Modal.open({
            title: '✏️ Edit Discount Preset',
            content: `
                <form id="presetForm">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" class="form-input" value="${preset.name}" required>
                    </div>
                    <div class="form-group">
                        <label>Icon (emoji)</label>
                        <input type="text" name="icon" class="form-input" value="${preset.icon}" maxlength="4">
                    </div>
                    <div class="form-group">
                        <label>Discount %</label>
                        <input type="number" name="percent" class="form-input" value="${preset.percent}" min="1" max="100" required>
                    </div>
                </form>
            `,
            saveText: 'Update',
            onSave: async () => {
                const form = document.getElementById('presetForm');
                const data = new FormData(form);
                
                const updatedPreset = {
                    name: data.get('name'),
                    icon: data.get('icon') || '🏷️',
                    percent: parseInt(data.get('percent')) || 10
                };
                
                try {
                    // Always save to Firebase (all presets should be in Firebase)
                    await DB.update('discountPresets', presetId, updatedPreset);
                    
                    // Update local array
                    Object.assign(preset, updatedPreset);
                    
                    POS.renderDiscountBar();
                    this.loadDiscountPresets();
                    Toast.success('Discount preset updated');
                } catch (error) {
                    console.error('Error updating preset:', error);
                    Toast.error('Failed to update');
                    return false;
                }
            }
        });
    },
    
    async deleteDiscountPreset(presetId) {
        const preset = POS.discountPresets.find(d => d.id === presetId);
        if (!preset) return;
        
        if (!confirm(`Delete discount "${preset.name}"?`)) return;
        
        try {
            await DB.delete('discountPresets', presetId);
            
            // Remove from local array
            const index = POS.discountPresets.findIndex(d => d.id === presetId);
            if (index !== -1) {
                POS.discountPresets.splice(index, 1);
            }
            
            POS.renderDiscountBar();
            this.loadDiscountPresets();
            Toast.success('Discount preset deleted');
        } catch (error) {
            console.error('Error deleting preset:', error);
            Toast.error('Failed to delete');
        }
    },
    
    // ========== MANAGE POS SALES ==========
    
    async showDeleteSales() {
        const container = document.getElementById('deleteManageList');
        if (!container) return;
        
        container.innerHTML = '<p class="loading">Loading sales...</p>';
        
        try {
            const sales = await DB.getAll('sales');
            sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            if (sales.length === 0) {
                container.innerHTML = '<p class="empty-state">No POS sales to delete</p>';
                return;
            }
            
            container.innerHTML = `
                <h4>🧾 Sales Transactions (${sales.length})</h4>
                <div class="delete-manage-header">
                    <button class="btn btn-danger btn-sm" onclick="Admin.deleteAllSales()">🗑️ Delete ALL Sales</button>
                </div>
                <div class="delete-manage-list">
                    ${sales.slice(0, 15).map(s => `
                        <div class="delete-item">
                            <div class="item-info">
                                <strong>${Utils.formatCurrency(s.total || 0)}</strong>
                                <span>${s.items?.length || 0} items</span>
                                <small>${new Date(s.timestamp).toLocaleString()}</small>
                            </div>
                            <button class="btn btn-danger btn-xs" onclick="Admin.deleteSale('${s.id}')">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                ${sales.length > 15 ? `<p class="text-muted">Showing first 15 of ${sales.length}</p>` : ''}
            `;
        } catch (error) {
            console.error('Error loading sales:', error);
            container.innerHTML = '<p class="error">Failed to load sales</p>';
        }
    },
    
    async deleteSale(saleId) {
        if (!confirm('Delete this transaction?')) return;
        
        try {
            await DB.delete('sales', saleId);
            Toast.success('Transaction deleted');
            this.showDeleteSales();
            this.loadTodayStats();
        } catch (error) {
            console.error('Error deleting sale:', error);
            Toast.error('Failed to delete');
        }
    },
    
    async deleteAllSales() {
        if (!confirm('⚠️ DELETE ALL POS SALES?\n\nThis cannot be undone!')) return;
        if (!confirm('Are you REALLY sure? This will delete ALL transaction history.')) return;
        
        try {
            const sales = await DB.getAll('sales');
            for (const sale of sales) {
                await DB.delete('sales', sale.id);
            }
            Toast.success(`Deleted ${sales.length} transactions`);
            this.showDeleteSales();
            this.loadTodayStats();
        } catch (error) {
            console.error('Error deleting sales:', error);
            Toast.error('Failed to delete');
        }
    },
    
    // ========== DELETE SHIFTS ==========
    
    async showDeleteShifts() {
        const container = document.getElementById('deleteManageList');
        if (!container) return;
        
        container.innerHTML = '<p class="loading">Loading shifts...</p>';
        
        try {
            const shifts = await DB.getAll('shifts');
            shifts.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
            
            if (shifts.length === 0) {
                container.innerHTML = '<p class="empty-state">No shifts to delete</p>';
                return;
            }
            
            container.innerHTML = `
                <h4>🕐 Shifts (${shifts.length})</h4>
                <div class="delete-manage-header">
                    <button class="btn btn-danger btn-sm" onclick="Admin.deleteAllShifts()">🗑️ Delete ALL Shifts</button>
                </div>
                <div class="delete-manage-list">
                    ${shifts.slice(0, 15).map(s => `
                        <div class="delete-item">
                            <div class="item-info">
                                <strong>Shift #${s.shiftNumber || '?'}</strong>
                                <span>${s.staffName || 'Unknown'}</span>
                                <small>${s.dateKey} - ${s.status}</small>
                            </div>
                            <button class="btn btn-danger btn-xs" onclick="Admin.deleteShift('${s.id}')">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                ${shifts.length > 15 ? `<p class="text-muted">Showing first 15 of ${shifts.length}</p>` : ''}
            `;
        } catch (error) {
            console.error('Error loading shifts:', error);
            container.innerHTML = '<p class="error">Failed to load shifts</p>';
        }
    },
    
    async deleteShift(shiftId) {
        if (!confirm('Delete this shift?')) return;
        
        try {
            await DB.delete('shifts', shiftId);
            Toast.success('Shift deleted');
            this.showDeleteShifts();
            this.loadActiveShifts();
        } catch (error) {
            console.error('Error deleting shift:', error);
            Toast.error('Failed to delete');
        }
    },
    
    async deleteAllShifts() {
        if (!confirm('⚠️ DELETE ALL SHIFTS?\n\nThis cannot be undone!')) return;
        if (!confirm('Are you REALLY sure? This will delete ALL shift history.')) return;
        
        try {
            const shifts = await DB.getAll('shifts');
            for (const shift of shifts) {
                await DB.delete('shifts', shift.id);
            }
            Toast.success(`Deleted ${shifts.length} shifts`);
            this.showDeleteShifts();
            this.loadActiveShifts();
        } catch (error) {
            console.error('Error deleting shifts:', error);
            Toast.error('Failed to delete');
        }
    },
    
    // ========== DELETE PURCHASES ==========
    
    async showDeletePurchases() {
        const container = document.getElementById('deleteManageList');
        if (!container) return;
        
        container.innerHTML = '<p class="loading">Loading purchases...</p>';
        
        try {
            const purchases = await DB.getAll('pendingPurchases');
            purchases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            if (purchases.length === 0) {
                container.innerHTML = '<p class="empty-state">No purchases to delete</p>';
                return;
            }
            
            container.innerHTML = `
                <h4>🛒 Pending Purchases (${purchases.length})</h4>
                <div class="delete-manage-header">
                    <button class="btn btn-danger btn-sm" onclick="Admin.deleteAllPurchases()">🗑️ Delete ALL Purchases</button>
                </div>
                <div class="delete-manage-list">
                    ${purchases.slice(0, 15).map(p => `
                        <div class="delete-item">
                            <div class="item-info">
                                <strong>${p.itemName || 'Unknown'}</strong>
                                <span>${p.qty} ${p.unit} - ${Utils.formatCurrency(p.amount)}</span>
                                <small>${p.dateKey} by ${p.cashierName}</small>
                            </div>
                            <button class="btn btn-danger btn-xs" onclick="Admin.deletePurchase('${p.id}')">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                ${purchases.length > 15 ? `<p class="text-muted">Showing first 15 of ${purchases.length}</p>` : ''}
            `;
        } catch (error) {
            console.error('Error loading purchases:', error);
            container.innerHTML = '<p class="error">Failed to load purchases</p>';
        }
    },
    
    async deletePurchase(purchaseId) {
        if (!confirm('Delete this purchase?')) return;
        
        try {
            await DB.delete('pendingPurchases', purchaseId);
            Toast.success('Purchase deleted');
            this.showDeletePurchases();
        } catch (error) {
            console.error('Error deleting purchase:', error);
            Toast.error('Failed to delete');
        }
    },
    
    async deleteAllPurchases() {
        if (!confirm('⚠️ DELETE ALL PENDING PURCHASES?\n\nThis cannot be undone!')) return;
        
        try {
            const purchases = await DB.getAll('pendingPurchases');
            for (const p of purchases) {
                await DB.delete('pendingPurchases', p.id);
            }
            Toast.success(`Deleted ${purchases.length} purchases`);
            this.showDeletePurchases();
        } catch (error) {
            console.error('Error deleting purchases:', error);
            Toast.error('Failed to delete');
        }
    },
    
    // ========== STAFF MANAGEMENT ==========
    
    async loadStaffList() {
        const container = document.getElementById('staffList');
        if (!container) return;
        
        try {
            const staff = await DB.getAll('staff');
            const activeStaff = staff.filter(s => s.status === 'active');
            
            if (activeStaff.length === 0) {
                container.innerHTML = '<p class="empty-state">No staff members</p>';
                return;
            }
            
            container.innerHTML = activeStaff.map(s => `
                <div class="staff-item">
                    <span class="staff-name">${s.name}</span>
                    <span class="staff-role">${s.role}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading staff:', error);
        }
    },
    
    async showStaffSetup() {
        try {
            const staff = await DB.getAll('staff');
            
            Modal.open({
                title: '👥 Staff Management',
                width: '700px',
                content: `
                    <div class="staff-setup-modal">
                        <div class="staff-list-header">
                            <span>Name</span>
                            <span>PIN</span>
                            <span>Role</span>
                            <span>Actions</span>
                        </div>
                        <div id="staffSetupList">
                            ${staff.map(s => `
                                <div class="staff-row" data-id="${s.id}">
                                    <span>${s.name}</span>
                                    <span>****</span>
                                    <span class="role-tag ${s.role}">${s.role}</span>
                                    <div class="staff-actions">
                                        <button class="btn btn-sm" onclick="Admin.editStaff('${s.id}')">✏️</button>
                                        <button class="btn btn-sm btn-danger" onclick="Admin.deleteStaff('${s.id}')">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-primary" onclick="Admin.addStaff()" style="margin-top: 15px;">
                            ➕ Add Staff Member
                        </button>
                    </div>
                `,
                hideFooter: true
            });
        } catch (error) {
            console.error('Error showing staff setup:', error);
            Toast.error('Failed to load staff');
        }
    },
    
    async addStaff() {
        Modal.open({
            title: '➕ Add Staff Member',
            content: `
                <form id="staffForm">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label>PIN (4-6 digits)</label>
                        <input type="password" name="pin" class="form-input" maxlength="6" pattern="[0-9]{4,6}" required>
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <select name="role" class="form-input">
                            <option value="cashier">Cashier</option>
                            <option value="baker">Baker</option>
                            <option value="manager">Manager</option>
                            <option value="owner">Owner</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Day Off</label>
                        <select name="dayOff" class="form-input">
                            <option value="">None</option>
                            <option value="Sunday">Sunday</option>
                            <option value="Monday">Monday</option>
                            <option value="Tuesday">Tuesday</option>
                            <option value="Wednesday">Wednesday</option>
                            <option value="Thursday">Thursday</option>
                            <option value="Friday">Friday</option>
                            <option value="Saturday">Saturday</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Monthly Salary</label>
                            <input type="number" name="monthlySalary" class="form-input" value="0">
                        </div>
                        <div class="form-group">
                            <label>Transport Allowance/day</label>
                            <input type="number" name="transportAllowance" class="form-input" value="0">
                        </div>
                    </div>
                    <div class="permissions-section">
                        <h4>Permissions</h4>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canUsePOS" checked> Can Use POS
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canGiveDiscount"> Can Give Discounts
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canVoidSales"> Can Void Sales
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canViewReports"> Can View Reports
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="isAdmin"> Admin Access (Reports, Import, Admin Panel)
                        </label>
                    </div>
                </form>
            `,
            saveText: 'Save Staff',
            onSave: async () => {
                const form = document.getElementById('staffForm');
                const data = new FormData(form);
                
                const staffData = {
                    name: data.get('name'),
                    pin: data.get('pin'),
                    role: data.get('role'),
                    dayOff: data.get('dayOff') || null,
                    monthlySalary: parseFloat(data.get('monthlySalary')) || 0,
                    transportAllowance: parseFloat(data.get('transportAllowance')) || 0,
                    canUsePOS: form.querySelector('[name="canUsePOS"]').checked,
                    canGiveDiscount: form.querySelector('[name="canGiveDiscount"]').checked,
                    canVoidSales: form.querySelector('[name="canVoidSales"]').checked,
                    canViewReports: form.querySelector('[name="canViewReports"]').checked,
                    isAdmin: form.querySelector('[name="isAdmin"]').checked,
                    status: 'active'
                };
                
                // Calculate daily rate
                staffData.dailyRate = staffData.monthlySalary > 0 ? staffData.monthlySalary / 26 : 0;
                
                try {
                    await DB.add('staff', staffData);
                    Toast.success('Staff member added');
                    this.showStaffSetup();
                    this.loadStaffList();
                } catch (error) {
                    console.error('Error adding staff:', error);
                    Toast.error('Failed to add staff');
                    return false;
                }
            }
        });
    },
    
    async editStaff(staffId) {
        const staff = await DB.get('staff', staffId);
        if (!staff) {
            Toast.error('Staff not found');
            return;
        }
        
        Modal.open({
            title: '✏️ Edit Staff Member',
            content: `
                <form id="staffForm">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" class="form-input" value="${staff.name}" required>
                    </div>
                    <div class="form-group">
                        <label>PIN (leave blank to keep current)</label>
                        <input type="password" name="pin" class="form-input" maxlength="6" pattern="[0-9]{4,6}" placeholder="****">
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <select name="role" class="form-input">
                            <option value="cashier" ${staff.role === 'cashier' ? 'selected' : ''}>Cashier</option>
                            <option value="baker" ${staff.role === 'baker' ? 'selected' : ''}>Baker</option>
                            <option value="manager" ${staff.role === 'manager' ? 'selected' : ''}>Manager</option>
                            <option value="owner" ${staff.role === 'owner' ? 'selected' : ''}>Owner</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Day Off</label>
                        <select name="dayOff" class="form-input">
                            <option value="">None</option>
                            <option value="Sunday" ${staff.dayOff === 'Sunday' ? 'selected' : ''}>Sunday</option>
                            <option value="Monday" ${staff.dayOff === 'Monday' ? 'selected' : ''}>Monday</option>
                            <option value="Tuesday" ${staff.dayOff === 'Tuesday' ? 'selected' : ''}>Tuesday</option>
                            <option value="Wednesday" ${staff.dayOff === 'Wednesday' ? 'selected' : ''}>Wednesday</option>
                            <option value="Thursday" ${staff.dayOff === 'Thursday' ? 'selected' : ''}>Thursday</option>
                            <option value="Friday" ${staff.dayOff === 'Friday' ? 'selected' : ''}>Friday</option>
                            <option value="Saturday" ${staff.dayOff === 'Saturday' ? 'selected' : ''}>Saturday</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Monthly Salary</label>
                            <input type="number" name="monthlySalary" class="form-input" value="${staff.monthlySalary || 0}">
                        </div>
                        <div class="form-group">
                            <label>Transport Allowance/day</label>
                            <input type="number" name="transportAllowance" class="form-input" value="${staff.transportAllowance || 0}">
                        </div>
                    </div>
                    <div class="permissions-section">
                        <h4>Permissions</h4>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canUsePOS" ${staff.canUsePOS ? 'checked' : ''}> Can Use POS
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canGiveDiscount" ${staff.canGiveDiscount ? 'checked' : ''}> Can Give Discounts
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canVoidSales" ${staff.canVoidSales ? 'checked' : ''}> Can Void Sales
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="canViewReports" ${staff.canViewReports ? 'checked' : ''}> Can View Reports
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="isAdmin" ${staff.isAdmin ? 'checked' : ''}> Admin Access
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select name="status" class="form-input">
                            <option value="active" ${staff.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${staff.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>
                </form>
            `,
            saveText: 'Update Staff',
            onSave: async () => {
                const form = document.getElementById('staffForm');
                const data = new FormData(form);
                
                const updateData = {
                    name: data.get('name'),
                    role: data.get('role'),
                    dayOff: data.get('dayOff') || null,
                    monthlySalary: parseFloat(data.get('monthlySalary')) || 0,
                    transportAllowance: parseFloat(data.get('transportAllowance')) || 0,
                    canUsePOS: form.querySelector('[name="canUsePOS"]').checked,
                    canGiveDiscount: form.querySelector('[name="canGiveDiscount"]').checked,
                    canVoidSales: form.querySelector('[name="canVoidSales"]').checked,
                    canViewReports: form.querySelector('[name="canViewReports"]').checked,
                    isAdmin: form.querySelector('[name="isAdmin"]').checked,
                    status: data.get('status')
                };
                
                // Update PIN only if provided
                const newPin = data.get('pin');
                if (newPin && newPin.length >= 4) {
                    updateData.pin = newPin;
                }
                
                // Calculate daily rate
                updateData.dailyRate = updateData.monthlySalary > 0 ? updateData.monthlySalary / 26 : 0;
                
                try {
                    await DB.update('staff', staffId, updateData);
                    Toast.success('Staff member updated');
                    this.showStaffSetup();
                    this.loadStaffList();
                } catch (error) {
                    console.error('Error updating staff:', error);
                    Toast.error('Failed to update staff');
                    return false;
                }
            }
        });
    },
    
    async deleteStaff(staffId) {
        if (!confirm('Delete this staff member?')) return;
        
        try {
            await DB.delete('staff', staffId);
            Toast.success('Staff member deleted');
            this.showStaffSetup();
            this.loadStaffList();
        } catch (error) {
            console.error('Error deleting staff:', error);
            Toast.error('Failed to delete');
        }
    },
    
    // ========== DEVICE MANAGEMENT ==========
    
    async showDeviceManagement() {
        const devices = await DB.getAll('authorizedDevices');
        const settings = await DB.get('settings', 'pos') || {};
        const isEnabled = settings.deviceRestrictionEnabled || false;
        const thisDeviceId = Auth.getDeviceId();
        
        Modal.open({
            title: '📱 Device Management',
            width: '95vw',
            content: `
                <div class="device-management">
                    <div class="device-setting">
                        <label class="toggle-setting">
                            <input type="checkbox" id="deviceRestrictionToggle" ${isEnabled ? 'checked' : ''} 
                                   onchange="Admin.toggleDeviceRestriction(this.checked)">
                            <span>🔒 Enable Device Restriction</span>
                        </label>
                        <p class="setting-desc">When enabled, only registered devices can access the POS.</p>
                    </div>
                    
                    <div class="current-device-box">
                        <h4>This Device</h4>
                        <p class="device-id">ID: ${thisDeviceId}</p>
                        ${devices.find(d => d.deviceId === thisDeviceId) ? 
                            '<span class="device-status registered">✅ Registered</span>' : 
                            `<button class="btn btn-primary btn-sm" onclick="Admin.registerThisDevice()">
                                ➕ Register This Device
                            </button>`
                        }
                    </div>
                    
                    <h4>Authorized Devices (${devices.length})</h4>
                    <div class="devices-list">
                        ${devices.length === 0 ? '<p class="empty-state">No devices registered yet</p>' :
                            devices.map(d => `
                                <div class="device-item ${d.deviceId === thisDeviceId ? 'current' : ''} ${d.status !== 'active' ? 'inactive' : ''}">
                                    <div class="device-info">
                                        <strong>${d.name}</strong>
                                        ${d.deviceId === thisDeviceId ? '<span class="current-badge">📍 This Device</span>' : ''}
                                        <small>${d.deviceId}</small>
                                        <small>Registered: ${new Date(d.registeredAt).toLocaleDateString()}</small>
                                    </div>
                                    <div class="device-actions">
                                        ${d.status === 'active' ? 
                                            `<button class="btn btn-sm btn-warning" onclick="Admin.deactivateDevice('${d.id}')">Deactivate</button>` :
                                            `<button class="btn btn-sm btn-success" onclick="Admin.activateDevice('${d.id}')">Activate</button>`
                                        }
                                        <button class="btn btn-sm btn-danger" onclick="Admin.deleteDevice('${d.id}')">🗑️</button>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            `,
            hideFooter: true,
            customFooter: `
                <div style="text-align:center;padding:15px;">
                    <button class="btn btn-primary" onclick="Modal.close()">Done</button>
                </div>
            `
        });
    },
    
    async toggleDeviceRestriction(enabled) {
        try {
            // Use set() to create document if it doesn't exist
            await DB.set('settings', 'pos', { deviceRestrictionEnabled: enabled });
            Auth.deviceRestrictionEnabled = enabled;
            Toast.success(enabled ? 'Device restriction ENABLED' : 'Device restriction DISABLED');
        } catch (error) {
            console.error('Error toggling device restriction:', error);
            Toast.error('Failed to update setting');
        }
    },
    
    async registerThisDevice() {
        const name = prompt('Enter a name for this device (e.g., "Store Tablet 1"):');
        if (!name) return;
        
        const success = await Auth.registerDevice(name);
        if (success) {
            this.showDeviceManagement(); // Refresh
        }
    },
    
    async deactivateDevice(deviceId) {
        if (!confirm('Deactivate this device? It will no longer be able to access the POS.')) return;
        
        try {
            await DB.update('authorizedDevices', deviceId, { status: 'inactive' });
            Toast.success('Device deactivated');
            this.showDeviceManagement();
        } catch (error) {
            Toast.error('Failed to deactivate device');
        }
    },
    
    async activateDevice(deviceId) {
        try {
            await DB.update('authorizedDevices', deviceId, { status: 'active' });
            Toast.success('Device activated');
            this.showDeviceManagement();
        } catch (error) {
            Toast.error('Failed to activate device');
        }
    },
    
    async deleteDevice(deviceId) {
        if (!confirm('Permanently delete this device? This cannot be undone.')) return;
        
        try {
            await DB.delete('authorizedDevices', deviceId);
            Toast.success('Device deleted');
            this.showDeviceManagement();
        } catch (error) {
            Toast.error('Failed to delete device');
        }
    },
    
    // ========== FEATURE TOGGLES ==========
    
    async loadFeatureToggles() {
        try {
            const settings = await DB.get('settings', 'pos');
            
            // Default to enabled if not set
            const discountIdCapture = settings?.discountIdCapture !== false;
            const gcashCapture = settings?.gcashCapture !== false;
            
            // Update checkboxes
            const discountToggle = document.getElementById('toggleDiscountIdCapture');
            const gcashToggle = document.getElementById('toggleGcashCapture');
            
            if (discountToggle) discountToggle.checked = discountIdCapture;
            if (gcashToggle) gcashToggle.checked = gcashCapture;
            
            // Also update POS settings
            if (typeof POS !== 'undefined') {
                POS.discountIdCaptureEnabled = discountIdCapture;
                POS.gcashCaptureEnabled = gcashCapture;
            }
            
        } catch (error) {
            console.log('Using default feature settings');
        }
    },
    
    async toggleFeature(feature, enabled) {
        try {
            // Get current settings
            let settings = await DB.get('settings', 'pos') || {};
            
            // Update the specific feature
            settings[feature] = enabled;
            
            // Save to Firebase
            await DB.set('settings', 'pos', settings);
            
            // Update POS in real-time
            if (typeof POS !== 'undefined') {
                if (feature === 'discountIdCapture') {
                    POS.discountIdCaptureEnabled = enabled;
                } else if (feature === 'gcashCapture') {
                    POS.gcashCaptureEnabled = enabled;
                }
            }
            
            Toast.success(`${enabled ? 'Enabled' : 'Disabled'}: ${feature === 'discountIdCapture' ? 'Discount ID Capture' : 'GCash Photo Capture'}`);
            
        } catch (error) {
            console.error('Error toggling feature:', error);
            Toast.error('Failed to update setting');
        }
    },
    
    // ===== REPAIR INVENTORY DEDUCTIONS =====
    async repairInventoryDeductions(targetDate) {
        if (!targetDate) {
            targetDate = prompt('Enter date to fix (YYYY-MM-DD):', Utils.getTodayKey());
            if (!targetDate) return;
        }
        
        console.log(`🔧 Repairing inventory for ${targetDate}...`);
        Toast.info(`Analyzing ${targetDate}...`);
        
        try {
            // Step 1: Get all sales for the target date
            const salesSnapshot = await db.collection('sales')
                .where('dateKey', '==', targetDate)
                .get();
            
            console.log(`Found ${salesSnapshot.size} sales records`);
            
            // Calculate sold qty per product from sales
            const soldFromSales = {};
            
            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                const items = sale.items || [];
                
                items.forEach(item => {
                    const productId = item.productId;
                    const qty = item.quantity || 1;
                    
                    if (!soldFromSales[productId]) {
                        soldFromSales[productId] = {
                            productId,
                            productName: item.productName || productId,
                            totalSold: 0
                        };
                    }
                    soldFromSales[productId].totalSold += qty;
                });
            });
            
            console.log(`Found ${Object.keys(soldFromSales).length} unique products in sales`);
            
            // Step 2: Get current dailyInventory for target date
            const invSnapshot = await db.collection('dailyInventory')
                .where('date', '==', targetDate)
                .get();
            
            console.log(`Found ${invSnapshot.size} inventory records`);
            
            const inventoryData = {};
            invSnapshot.forEach(doc => {
                const data = doc.data();
                inventoryData[data.productId] = {
                    docId: doc.id,
                    ...data
                };
            });
            
            // Step 3: Find and fix discrepancies
            let fixed = 0;
            let skipped = 0;
            const results = [];
            
            for (const [productId, salesData] of Object.entries(soldFromSales)) {
                const inv = inventoryData[productId];
                const currentSoldQty = inv ? (inv.soldQty || 0) : 0;
                const expectedSoldQty = salesData.totalSold;
                const difference = expectedSoldQty - currentSoldQty;
                
                if (difference > 0 && inv) {
                    // Fix it
                    await db.collection('dailyInventory').doc(inv.docId).update({
                        soldQty: expectedSoldQty,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        fixedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        fixNote: `Auto-fixed: was ${currentSoldQty}, should be ${expectedSoldQty}`
                    });
                    
                    results.push(`✅ ${salesData.productName}: ${currentSoldQty} → ${expectedSoldQty}`);
                    fixed++;
                } else if (difference > 0 && !inv) {
                    results.push(`⚠️ ${salesData.productName}: No inventory record`);
                    skipped++;
                }
            }
            
            // Show results
            if (fixed === 0 && skipped === 0) {
                Toast.success('No discrepancies found!');
                console.log('✅ Inventory matches sales - no fixes needed');
            } else {
                Toast.success(`Fixed ${fixed} products, skipped ${skipped}`);
                console.log('📊 Repair Results:');
                results.forEach(r => console.log(r));
            }
            
            return { fixed, skipped, results };
            
        } catch (error) {
            console.error('Repair failed:', error);
            Toast.error('Repair failed: ' + error.message);
        }
    }
};
