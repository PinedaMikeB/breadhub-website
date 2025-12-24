/**
 * BreadHub POS - Main Application Controller v2
 * Added: Role-based UI visibility, cashier quick panel
 */

const App = {
    currentView: 'pos',
    quickPanelOpen: false,
    
    async init() {
        console.log('Initializing BreadHub POS...');
        
        if (!initFirebase()) {
            Toast.error('Failed to connect to database');
            return;
        }
        
        Modal.init();
        Toast.init();
        Auth.init();
        
        this.startClock();
        
        console.log('BreadHub POS initialized');
    },
    
    async loadData() {
        try {
            await POS.init();
            await Orders.init();
            await SalesImport.init();
            
            // Initialize inventory deduction (async, non-blocking)
            if (typeof InventoryDeduction !== 'undefined') {
                InventoryDeduction.init().then(() => {
                    console.log('Inventory deduction ready');
                }).catch(err => {
                    console.warn('Inventory deduction init failed:', err);
                });
            }
            
            // Check user role for admin access
            this.updateRoleBasedUI();
            
            // Load cashier quick panel data
            this.loadCashierQuickPanel();
            
            Toast.success('POS Ready');
        } catch (error) {
            console.error('Error loading data:', error);
            Toast.error('Failed to load data');
        }
    },
    
    updateRoleBasedUI() {
        // Check if user has admin permission (isAdmin flag or owner/manager role)
        const userData = Auth.userData;
        const isAdmin = userData?.isAdmin || 
                        userData?.role === 'owner' || 
                        userData?.role === 'manager' ||
                        userData?.role === 'admin';
        
        // Show/hide admin-only buttons (Reports, Import, Admin)
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
        
        // Legacy manager-only class
        document.querySelectorAll('.manager-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
    },
    
    // ========== CASHIER QUICK PANEL ==========
    
    toggleQuickPanel() {
        this.quickPanelOpen = !this.quickPanelOpen;
        const content = document.getElementById('quickPanelContent');
        if (content) {
            content.style.display = this.quickPanelOpen ? 'block' : 'none';
            if (this.quickPanelOpen) {
                this.loadCashierQuickPanel();
            }
        }
    },
    
    async loadCashierQuickPanel() {
        // Load low stock for cashier view
        const lowStockEl = document.getElementById('cashierLowStock');
        if (lowStockEl) {
            try {
                const ingredients = await DB.getAll('ingredients');
                const packaging = await DB.getAll('packagingMaterials');
                
                const lowItems = [
                    ...ingredients.filter(i => i.currentStock <= (i.reorderLevel || 0)),
                    ...packaging.filter(p => p.currentStock <= (p.reorderLevel || 0))
                ];
                
                if (lowItems.length === 0) {
                    lowStockEl.innerHTML = '<p class="success-text">✅ All stock OK</p>';
                } else {
                    lowStockEl.innerHTML = lowItems.slice(0, 5).map(i => `
                        <div class="quick-item ${i.currentStock === 0 ? 'critical' : 'warning'}">
                            <span>${i.currentStock === 0 ? '🔴' : '🟡'} ${i.name}</span>
                            <span>${i.currentStock} left</span>
                        </div>
                    `).join('');
                }
            } catch (error) {
                lowStockEl.innerHTML = '<p class="error-text">Failed to load</p>';
            }
        }
        
        // Load product availability for cashier view
        const availEl = document.getElementById('cashierAvailability');
        if (availEl) {
            try {
                const products = await DB.getAll('products');
                const unavailable = products.filter(p => p.shop?.published && p.shop?.available === false);
                
                if (unavailable.length === 0) {
                    availEl.innerHTML = '<p class="success-text">✅ All products available</p>';
                } else {
                    availEl.innerHTML = unavailable.map(p => `
                        <div class="quick-item unavailable">
                            <span>❌ ${p.name}</span>
                            <span>Unavailable online</span>
                        </div>
                    `).join('');
                }
            } catch (error) {
                availEl.innerHTML = '<p class="error-text">Failed to load</p>';
            }
        }
    },
    
    showView(viewName) {
        this.currentView = viewName;
        
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        const view = document.getElementById(`${viewName}View`);
        if (view) {
            view.classList.add('active');
        }
        
        // Check admin permission for restricted views
        const userData = Auth.userData;
        const isAdmin = userData?.isAdmin || 
                        userData?.role === 'owner' || 
                        userData?.role === 'manager';
        
        // Load view-specific content
        switch (viewName) {
            case 'reports':
                if (!isAdmin) {
                    Toast.error('Admin access required');
                    this.showView('pos');
                    return;
                }
                Reports.showTab('daily');
                break;
            case 'import':
                if (!isAdmin) {
                    Toast.error('Admin access required');
                    this.showView('pos');
                    return;
                }
                SalesImport.renderHistory();
                break;
            case 'orders':
                Orders.render();
                break;
            case 'admin':
                if (!isAdmin) {
                    Toast.error('Admin access required');
                    this.showView('pos');
                    return;
                }
                Admin.init();
                break;
        }
    },
    
    startClock() {
        const updateClock = () => {
            const now = new Date();
            
            const dateEl = document.getElementById('currentDate');
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('en-PH', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
            }
            
            const timeEl = document.getElementById('currentTime');
            if (timeEl) {
                timeEl.textContent = now.toLocaleTimeString('en-PH', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
            }
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
