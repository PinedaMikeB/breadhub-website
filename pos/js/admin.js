/**
 * BreadHub POS - Admin Panel v4
 * - Added delete shifts, delete purchases
 * - Added staff setup modal
 * - Added permission-based visibility
 */

const Admin = {
    async init() {
        this.loadTodayStats();
        this.loadLowStockAlerts();
        this.loadActiveShifts();
        this.loadProductAvailability();
        this.loadDiscountPresets();
        this.loadStaffList();
        this.updateChangeFundDisplay();
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
    }
};
