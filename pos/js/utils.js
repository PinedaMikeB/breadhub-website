/**
 * BreadHub POS - Utility Functions
 */

const Utils = {
    formatCurrency(amount) {
        return `₱${(amount || 0).toFixed(2)}`;
    },
    
    formatDate(date) {
        if (!date) return '-';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('en-PH', { 
            year: 'numeric', month: 'short', day: 'numeric' 
        });
    },
    
    formatDateTime(date) {
        if (!date) return '-';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleString('en-PH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    },
    
    formatTime(date) {
        if (!date) return '-';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleTimeString('en-PH', {
            hour: '2-digit', minute: '2-digit'
        });
    },
    
    getTodayKey() {
        return new Date().toISOString().split('T')[0];
    },
    
    getMonthKey(date) {
        const d = date ? new Date(date) : new Date();
        return d.toISOString().slice(0, 7); // YYYY-MM
    }
};

// Toast notifications
const Toast = {
    container: null,
    
    init() {
        this.container = document.getElementById('toastContainer');
    },
    
    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        this.container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 4000); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};
