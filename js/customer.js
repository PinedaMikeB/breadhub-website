/**
 * BreadHub Customer Account System
 * Auto-creates accounts, remembers customers, tracks orders
 */

const Customer = {
    data: null,
    isLoaded: false,

    // Initialize customer system
    async init() {
        const customerId = localStorage.getItem('breadhub_customer_id');
        if (customerId) {
            await this.loadCustomer(customerId);
        }
        this.updateUI();
        
        // Initialize chat if customer is logged in
        if (this.data?.id && typeof Chat !== 'undefined') {
            Chat.init();
        }
        
        return this.data;
    },

    // Load customer from Firebase
    async loadCustomer(customerId) {
        try {
            const doc = await db.collection('customers').doc(customerId).get();
            if (doc.exists) {
                this.data = { id: doc.id, ...doc.data() };
                this.isLoaded = true;
                console.log('Customer loaded:', this.data.name);
            } else {
                // Customer not found, clear localStorage
                localStorage.removeItem('breadhub_customer_id');
                this.data = null;
            }
        } catch (error) {
            console.error('Error loading customer:', error);
        }
    },

    // Find customer by phone number
    async findByPhone(phone) {
        const normalized = this.normalizePhone(phone);
        try {
            const snapshot = await db.collection('customers')
                .where('phone', '==', normalized)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                this.data = { id: doc.id, ...doc.data() };
                localStorage.setItem('breadhub_customer_id', doc.id);
                this.isLoaded = true;
                return this.data;
            }
            return null;
        } catch (error) {
            console.error('Error finding customer:', error);
            return null;
        }
    },

    // Create new customer account
    async create(customerData) {
        const normalized = this.normalizePhone(customerData.phone);
        
        // Check if phone already exists
        const existing = await this.findByPhone(normalized);
        if (existing) {
            // Update existing customer
            await this.update({
                name: customerData.name,
                address: customerData.address,
                lastVisit: new Date().toISOString()
            });
            return this.data;
        }

        try {
            const docRef = await db.collection('customers').add({
                name: customerData.name,
                phone: normalized,
                address: customerData.address,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastVisit: new Date().toISOString(),
                orderCount: 0,
                totalSpent: 0
            });
            
            this.data = {
                id: docRef.id,
                name: customerData.name,
                phone: normalized,
                address: customerData.address,
                orderCount: 0,
                totalSpent: 0
            };
            
            localStorage.setItem('breadhub_customer_id', docRef.id);
            this.isLoaded = true;
            console.log('New customer created:', this.data.name);
            
            // Initialize chat for new customer
            if (typeof Chat !== 'undefined') {
                Chat.init();
            }
            
            return this.data;
        } catch (error) {
            console.error('Error creating customer:', error);
            return null;
        }
    },

    // Update customer data
    async update(updates) {
        if (!this.data?.id) return;
        
        try {
            await db.collection('customers').doc(this.data.id).update(updates);
            this.data = { ...this.data, ...updates };
        } catch (error) {
            console.error('Error updating customer:', error);
        }
    },

    // Increment order stats
    async addOrderStats(orderTotal) {
        if (!this.data?.id) return;
        
        try {
            await db.collection('customers').doc(this.data.id).update({
                orderCount: firebase.firestore.FieldValue.increment(1),
                totalSpent: firebase.firestore.FieldValue.increment(orderTotal),
                lastOrderAt: new Date().toISOString()
            });
            this.data.orderCount = (this.data.orderCount || 0) + 1;
            this.data.totalSpent = (this.data.totalSpent || 0) + orderTotal;
        } catch (error) {
            console.error('Error updating order stats:', error);
        }
    },

    // Normalize phone number (remove spaces, dashes, +63 prefix)
    normalizePhone(phone) {
        let cleaned = phone.replace(/[\s\-\(\)]/g, '');
        if (cleaned.startsWith('+63')) {
            cleaned = '0' + cleaned.substring(3);
        } else if (cleaned.startsWith('63')) {
            cleaned = '0' + cleaned.substring(2);
        }
        return cleaned;
    },

    // Validate Philippine mobile number
    validatePhone(phone) {
        const normalized = this.normalizePhone(phone);
        // Philippine mobile: 09XX XXX XXXX (11 digits starting with 09)
        return /^09\d{9}$/.test(normalized);
    },

    // Get customer orders
    async getOrders() {
        if (!this.data?.id) return [];
        
        try {
            const snapshot = await db.collection('orders')
                .where('customerId', '==', this.data.id)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Error fetching orders:', error);
            // Try without ordering if index doesn't exist
            try {
                const snapshot = await db.collection('orders')
                    .where('customerId', '==', this.data.id)
                    .get();
                const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                return orders.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
                    const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
                    return dateB - dateA;
                });
            } catch (e) {
                return [];
            }
        }
    },

    // Logout customer
    logout() {
        localStorage.removeItem('breadhub_customer_id');
        this.data = null;
        this.isLoaded = false;
        this.updateUI();
    },

    // Update UI based on customer state
    updateUI() {
        const welcomeEl = document.getElementById('customerWelcome');
        const accountBtn = document.getElementById('accountBtn');
        
        if (this.data) {
            // Returning customer
            if (welcomeEl) {
                welcomeEl.innerHTML = `👋 Welcome back, <strong>${this.data.name.split(' ')[0]}</strong>!`;
                welcomeEl.style.display = 'block';
            }
            if (accountBtn) {
                accountBtn.innerHTML = '👤 My Orders';
                accountBtn.onclick = () => this.showOrdersModal();
            }
            
            // Auto-fill checkout form if exists
            this.autoFillCheckout();
        } else {
            if (welcomeEl) {
                welcomeEl.style.display = 'none';
            }
            if (accountBtn) {
                accountBtn.innerHTML = '👤 Account';
                accountBtn.onclick = () => this.showLoginModal();
            }
        }
    },

    // Auto-fill checkout form with customer data
    autoFillCheckout() {
        if (!this.data) return;
        
        const nameInput = document.getElementById('customerName');
        const phoneInput = document.getElementById('customerPhone');
        const addressInput = document.getElementById('customerAddress');
        
        if (nameInput && !nameInput.value) nameInput.value = this.data.name || '';
        if (phoneInput && !phoneInput.value) phoneInput.value = this.data.phone || '';
        if (addressInput && !addressInput.value) addressInput.value = this.data.address || '';
    },

    // Show login modal for returning customers
    showLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) modal.classList.add('open');
    },

    // Show orders modal
    async showOrdersModal() {
        const modal = document.getElementById('ordersModal');
        const container = document.getElementById('ordersContainer');
        
        if (!modal || !container) return;
        
        container.innerHTML = '<p style="text-align:center;padding:2rem;">Loading orders...</p>';
        modal.classList.add('open');
        
        const orders = await this.getOrders();
        
        if (orders.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem;">
                    <div style="font-size:3rem;margin-bottom:1rem;">📦</div>
                    <p>No orders yet</p>
                    <p style="color:#666;margin-top:0.5rem;">Your order history will appear here</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = orders.map(order => `
            <div class="order-card" style="background:#fff;border-radius:12px;padding:1rem;margin-bottom:1rem;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <strong style="color:var(--brown);">#${order.orderNumber || order.id.slice(-8).toUpperCase()}</strong>
                    <span class="status-badge" style="padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;${this.getStatusStyle(order.status)}">
                        ${this.getStatusEmoji(order.status)} ${order.status}
                    </span>
                </div>
                <div style="font-size:0.9rem;color:#666;margin-bottom:0.5rem;">
                    ${this.formatDate(order.createdAt)}
                </div>
                <div style="font-size:0.85rem;color:#555;">
                    ${(order.items || []).map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                </div>
                <div style="margin-top:0.5rem;font-weight:600;color:var(--orange);">
                    Total: ₱${(order.total || 0).toFixed(2)}
                </div>
            </div>
        `).join('');
    },

    getStatusEmoji(status) {
        const emojis = {
            'pending': '🟡',
            'confirmed': '🟢',
            'preparing': '👨‍🍳',
            'ready': '📦',
            'completed': '✅',
            'cancelled': '❌'
        };
        return emojis[status] || '⚪';
    },

    getStatusStyle(status) {
        const styles = {
            'pending': 'background:#FFF3CD;color:#856404;',
            'confirmed': 'background:#D4EDDA;color:#155724;',
            'preparing': 'background:#CCE5FF;color:#004085;',
            'ready': 'background:#D1ECF1;color:#0C5460;',
            'completed': 'background:#D4EDDA;color:#155724;',
            'cancelled': 'background:#F8D7DA;color:#721C24;'
        };
        return styles[status] || 'background:#E9ECEF;color:#495057;';
    },

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-PH', { 
            month: 'short', 
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }
};

// Phone verification for returning customers
async function verifyPhone() {
    const phoneInput = document.getElementById('loginPhone');
    const phone = phoneInput?.value?.trim();
    
    if (!phone) {
        showToast('Please enter your phone number');
        return;
    }
    
    if (!Customer.validatePhone(phone)) {
        showToast('Please enter a valid PH mobile number (09XX XXX XXXX)');
        return;
    }
    
    const customer = await Customer.findByPhone(phone);
    
    if (customer) {
        showToast(`Welcome back, ${customer.name}! 🎉`);
        closeLoginModal();
        Customer.updateUI();
    } else {
        showToast('Phone not found. Place your first order to create an account!');
    }
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.remove('open');
}

function closeOrdersModal() {
    const modal = document.getElementById('ordersModal');
    if (modal) modal.classList.remove('open');
}
