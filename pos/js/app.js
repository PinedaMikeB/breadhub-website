/**
 * BreadHub POS - Main Application Controller
 */

const App = {
    currentView: 'pos',
    
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
            
            Toast.success('POS Ready');
        } catch (error) {
            console.error('Error loading data:', error);
            Toast.error('Failed to load data');
        }
    },
    
    updateRoleBasedUI() {
        const isManager = Auth.hasRole('manager') || Auth.hasRole('admin');
        
        // Show/hide manager-only buttons
        document.querySelectorAll('.manager-only').forEach(el => {
            el.style.display = isManager ? '' : 'none';
        });
    },
    
    showView(viewName) {
        this.currentView = viewName;
        
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        const view = document.getElementById(`${viewName}View`);
        if (view) {
            view.classList.add('active');
        }
        
        // Load view-specific content
        switch (viewName) {
            case 'reports':
                Reports.showTab('daily');
                break;
            case 'import':
                SalesImport.renderHistory();
                break;
            case 'orders':
                Orders.render();
                break;
            case 'admin':
                if (!Auth.hasRole('manager')) {
                    Toast.error('Manager access required');
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
