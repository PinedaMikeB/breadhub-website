/**
 * BreadHub POS - Admin Panel v2 - Added delete sales
 * Manager-only features: shifts, stock alerts, product availability
 */

const Admin = {
    async init() {
        this.loadTodayStats();
        this.loadLowStockAlerts();
        this.loadActiveShifts();
        this.loadProductAvailability();
        this.loadDiscountPresets();
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
            const shifts = await DB.query('shifts', 'dateKey', '==', today);
            
            if (shifts.length === 0) {
                container.innerHTML = '<p class="empty-state">No shifts today</p>';
                return;
            }
            
            // Get sales for each shift
            const sales = await DB.query('sales', 'dateKey', '==', today);
            
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
            // Get shift
            const shifts = await DB.getAll('shifts');
            const shift = shifts.find(s => s.id === shiftId);
            if (!shift) {
                Toast.error('Shift not found');
                return;
            }
            
            // Get sales for this shift
            const allSales = await DB.getAll('sales');
            const shiftSales = allSales.filter(s => s.shiftId === shiftId);
            const totalSales = shiftSales.reduce((sum, s) => sum + (s.total || 0), 0);
            
            Modal.open({
                title: `📋 Shift #${shift.shiftNumber} Details`,
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
                                <span class="value">${shift.endingCash ? Utils.formatCurrency(shift.endingCash) : '-'}</span>
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
                        
                        <h4>Transactions</h4>
                        <div class="shift-transactions">
                            ${shiftSales.length === 0 ? '<p>No transactions in this shift</p>' : 
                                shiftSales.map(s => `
                                    <div class="txn-item">
                                        <span class="txn-id">${s.saleId}</span>
                                        <span class="txn-time">${Utils.formatTime(s.timestamp)}</span>
                                        <span class="txn-items">${s.items?.length || 0} items</span>
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
        
        container.innerHTML = POS.discountPresets.map(d => `
            <div class="preset-item">
                <span class="preset-icon">${d.icon}</span>
                <span class="preset-name">${d.name}</span>
                <span class="preset-percent">${d.percent}%</span>
                <button class="btn btn-icon btn-sm" onclick="Admin.editDiscountPreset('${d.id}')">✏️</button>
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
                
                preset.name = data.get('name');
                preset.icon = data.get('icon') || '🏷️';
                preset.percent = parseInt(data.get('percent')) || 10;
                
                // Update in Firebase if it's a custom preset
                if (preset.id.startsWith('custom_')) {
                    try {
                        await DB.update('discountPresets', preset.id, preset);
                    } catch (error) {
                        console.error('Error updating preset:', error);
                    }
                }
                
                POS.renderDiscountBar();
                this.loadDiscountPresets();
                Toast.success('Discount preset updated');
            }
        });
    },
    
    // ========== MANAGE POS SALES ==========
    
    async showDeleteSales() {
        const container = document.getElementById('salesManageList');
        if (!container) return;
        
        container.innerHTML = '<p class="loading">Loading sales...</p>';
        
        try {
            const sales = await DB.getAll('sales');
            sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            if (sales.length === 0) {
                container.innerHTML = '<p class="empty-state">No POS sales to manage</p>';
                return;
            }
            
            container.innerHTML = `
                <div class="sales-manage-header">
                    <span>${sales.length} total transactions</span>
                    <button class="btn btn-danger btn-sm" onclick="Admin.deleteAllSales()">🗑️ Delete ALL</button>
                </div>
                <div class="sales-manage-list">
                    ${sales.slice(0, 20).map(s => `
                        <div class="sale-item">
                            <div class="sale-info">
                                <strong>${Utils.formatCurrency(s.total || 0)}</strong>
                                <span>${s.items?.length || 0} items</span>
                                <small>${new Date(s.timestamp).toLocaleString()}</small>
                            </div>
                            <button class="btn btn-danger btn-xs" onclick="Admin.deleteSale('${s.id}')">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                ${sales.length > 20 ? `<p class="text-muted">Showing first 20 of ${sales.length}</p>` : ''}
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
    }
};
