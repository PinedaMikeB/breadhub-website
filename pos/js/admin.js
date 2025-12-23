/**
 * BreadHub POS - Admin Panel
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
            
            container.innerHTML = shifts.map(shift => `
                <div class="shift-item ${shift.endTime ? 'ended' : 'active'}">
                    <div class="shift-user">
                        <strong>${shift.userName}</strong>
                        <span class="shift-status">${shift.endTime ? '✅ Ended' : '🟢 Active'}</span>
                    </div>
                    <div class="shift-times">
                        <span>In: ${Utils.formatTime(shift.startTime)}</span>
                        ${shift.endTime ? `<span>Out: ${Utils.formatTime(shift.endTime)}</span>` : ''}
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading shifts:', error);
        }
    },
    
    async startShift() {
        if (!Auth.userData) {
            Toast.error('Please login first');
            return;
        }
        
        try {
            const today = Utils.getTodayKey();
            
            // Check if already has active shift
            const existing = await DB.query('shifts', 'userId', '==', Auth.userData.id);
            const activeShift = existing.find(s => s.dateKey === today && !s.endTime);
            
            if (activeShift) {
                Toast.warning('You already have an active shift');
                return;
            }
            
            await DB.add('shifts', {
                userId: Auth.userData.id,
                userName: Auth.userData.name,
                dateKey: today,
                startTime: new Date().toISOString(),
                endTime: null
            });
            
            Toast.success('Shift started!');
            this.loadActiveShifts();
            
        } catch (error) {
            console.error('Error starting shift:', error);
            Toast.error('Failed to start shift');
        }
    },
    
    async endShift() {
        if (!Auth.userData) return;
        
        try {
            const today = Utils.getTodayKey();
            const existing = await DB.query('shifts', 'userId', '==', Auth.userData.id);
            const activeShift = existing.find(s => s.dateKey === today && !s.endTime);
            
            if (!activeShift) {
                Toast.warning('No active shift to end');
                return;
            }
            
            await DB.update('shifts', activeShift.id, {
                endTime: new Date().toISOString()
            });
            
            Toast.success('Shift ended!');
            this.loadActiveShifts();
            
        } catch (error) {
            console.error('Error ending shift:', error);
            Toast.error('Failed to end shift');
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
    }
};
