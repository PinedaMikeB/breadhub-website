/**
 * BreadHub POS - Online Orders Management
 * Processes orders from breadhub.shop website
 */

const Orders = {
    orders: [],
    currentFilter: 'pending',
    unsubscribe: null,
    
    async init() {
        this.startListening();
    },
    
    // Real-time listener for new orders
    startListening() {
        if (this.unsubscribe) this.unsubscribe();
        
        this.unsubscribe = db.collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .onSnapshot(snapshot => {
                this.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.updateCounts();
                this.render();
                this.checkNewOrders(snapshot);
            }, error => {
                console.error('Error listening to orders:', error);
            });
    },
    
    checkNewOrders(snapshot) {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const order = change.doc.data();
                if (order.status === 'pending') {
                    // Play notification sound
                    this.playNotificationSound();
                    Toast.info(`🛍️ New order from ${order.customerName || 'Customer'}!`);
                    this.updateBadge();
                }
            }
        });
    },
    
    playNotificationSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQIAJI/Z7cCJCgAWft3xvIsOABJ3+vLAjQ8AEn/98L2OEQA=');
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (e) {}
    },
    
    updateBadge() {
        const pendingCount = this.orders.filter(o => o.status === 'pending').length;
        const badge = document.getElementById('ordersBadge');
        if (badge) {
            badge.textContent = pendingCount;
            badge.style.display = pendingCount > 0 ? 'inline' : 'none';
        }
    },
    
    updateCounts() {
        const counts = {
            pending: 0,
            confirmed: 0,
            ready: 0,
            completed: 0,
            delivered: 0,
            cancelled: 0
        };
        
        this.orders.forEach(o => {
            if (counts[o.status] !== undefined) {
                counts[o.status]++;
            }
        });
        
        Object.entries(counts).forEach(([status, count]) => {
            const el = document.getElementById(`${status}Count`);
            if (el) el.textContent = count;
        });
        
        this.updateBadge();
    },
    
    filterByStatus(status) {
        this.currentFilter = status;
        document.querySelectorAll('.order-filter').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });
        this.render();
    },
    
    async refresh() {
        Toast.info('Refreshing orders...');
        // The real-time listener will handle updates automatically
    },
    
    render() {
        const container = document.getElementById('ordersList');
        if (!container) return;
        
        const filtered = this.orders.filter(o => o.status === this.currentFilter);
        
        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty-state">No ${this.currentFilter} orders</p>`;
            return;
        }
        
        container.innerHTML = filtered.map(order => `
            <div class="order-card" data-order-id="${order.id}">
                <div class="order-header">
                    <div class="order-id">#${order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
                    <div class="order-status status-${order.status}">${this.getStatusEmoji(order.status)} ${order.status}</div>
                </div>
                
                <!-- Payment Status -->
                <div class="order-payment ${order.paymentStatus || 'unpaid'}">
                    ${this.getPaymentBadge(order)}
                </div>
                
                <div class="order-customer">
                    <strong>${order.customerName || 'Walk-in'}</strong>
                    ${order.customerPhone ? `<span>📱 ${order.customerPhone}</span>` : ''}
                    ${order.deliveryMethod === 'delivery' ? `<span>🚗 Delivery</span>` : `<span>🏪 Pickup</span>`}
                </div>
                
                <div class="order-items">
                    ${(order.items || []).map(item => `
                        <div class="order-item">
                            <span>${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}</span>
                            <span>${Utils.formatCurrency(item.lineTotal || item.price * item.quantity)}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="order-footer">
                    <div class="order-total">
                        <strong>Total: ${Utils.formatCurrency(order.total || 0)}</strong>
                    </div>
                    <div class="order-time">
                        ${Utils.formatDateTime(order.createdAt)}
                    </div>
                </div>
                
                <div class="order-actions">
                    ${this.getActionButtons(order)}
                </div>
                
                ${order.notes ? `<div class="order-notes">📝 ${order.notes}</div>` : ''}
            </div>
        `).join('');
    },
    
    getStatusEmoji(status) {
        const emojis = {
            pending: '🟡',
            confirmed: '🟢',
            preparing: '👨‍🍳',
            ready: '📦',
            completed: '🚗',
            delivered: '✅',
            cancelled: '❌'
        };
        return emojis[status] || '⚪';
    },
    
    getPaymentBadge(order) {
        const method = order.paymentMethod === 'gcash' ? '📱 GCash' : 
                       order.paymentMethod === 'bank_transfer' ? '🏦 Bank' : 
                       order.paymentMethod === 'pending' ? '⏳' : '💳';
        
        switch (order.paymentStatus) {
            case 'verified':
                return `<span class="payment-badge verified">✅ ${method} Paid</span>`;
            case 'pending_verification':
                return `
                    <span class="payment-badge pending">⏳ ${method} - Needs Verification</span>
                    <button class="btn btn-sm btn-info" onclick="Orders.viewPaymentProof('${order.id}')" style="margin-left:8px;">📷 View Proof</button>
                `;
            case 'unpaid':
            default:
                return `<span class="payment-badge unpaid">⚠️ Awaiting Payment</span>`;
        }
    },
    
    // View payment proof image
    viewPaymentProof(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) {
            Toast.error('Order not found');
            return;
        }
        
        if (!order.paymentProof) {
            Modal.open({
                title: `💳 Payment - #${order.orderNumber}`,
                content: `
                    <div style="text-align:center;padding:20px;">
                        <p style="font-size:3rem;">📷</p>
                        <p>No payment screenshot uploaded yet.</p>
                        <p style="color:#666;font-size:0.9rem;">Customer may still be processing payment.</p>
                        <hr style="margin:20px 0;">
                        <p><strong>Amount:</strong> ${Utils.formatCurrency(order.total)}</p>
                        <p><strong>Status:</strong> ${order.paymentStatus || 'unpaid'}</p>
                    </div>
                `,
                showCancel: false,
                confirmText: 'Close'
            });
            return;
        }
        
        Modal.open({
            title: `💳 Payment Proof - #${order.orderNumber}`,
            content: `
                <div style="text-align:center;">
                    <img src="${order.paymentProof}" style="max-width:100%;max-height:400px;border-radius:8px;border:2px solid #ddd;">
                    <div style="margin-top:15px;">
                        <p><strong>Amount:</strong> ${Utils.formatCurrency(order.total)}</p>
                        <p><strong>Method:</strong> ${order.paymentMethod === 'gcash' ? 'GCash' : 'Bank Transfer'}</p>
                        <p><strong>Customer:</strong> ${order.customerName}</p>
                    </div>
                </div>
            `,
            showCancel: true,
            cancelText: 'Close',
            confirmText: '✅ Verify Payment',
            onConfirm: () => this.verifyPayment(orderId)
        });
    },
    
    // Verify payment
    async verifyPayment(orderId) {
        try {
            await DB.update('orders', orderId, {
                paymentStatus: 'verified',
                paymentVerifiedAt: new Date().toISOString(),
                paymentVerifiedBy: Auth.userData?.id
            });
            Modal.close();
            Toast.success('Payment verified!');
        } catch (error) {
            console.error('Error verifying payment:', error);
            Toast.error('Failed to verify payment');
        }
    },
    
    getActionButtons(order) {
        switch (order.status) {
            case 'pending':
                return `
                    <button class="btn btn-success btn-sm" onclick="Orders.confirm('${order.id}')">✅ Confirm</button>
                    <button class="btn btn-danger btn-sm" onclick="Orders.cancel('${order.id}')">❌ Reject</button>
                `;
            case 'confirmed':
                return `
                    <button class="btn btn-primary btn-sm" onclick="Orders.markReady('${order.id}')">📦 Ready for Delivery</button>
                `;
            case 'ready':
                return `
                    <button class="btn btn-success btn-sm" onclick="Orders.markOutForDelivery('${order.id}')">🚗 Out for Delivery</button>
                `;
            case 'completed':
                return `
                    <button class="btn btn-success btn-sm" onclick="Orders.markDelivered('${order.id}')">🏠 Mark Delivered</button>
                `;
            default:
                return '';
        }
    },
    
    async confirm(orderId) {
        try {
            await DB.update('orders', orderId, { 
                status: 'confirmed',
                confirmedAt: new Date().toISOString(),
                confirmedBy: Auth.userData?.id
            });
            Toast.success('Order confirmed!');
        } catch (error) {
            console.error('Error confirming order:', error);
            Toast.error('Failed to confirm order');
        }
    },
    
    async markReady(orderId) {
        try {
            await DB.update('orders', orderId, { 
                status: 'ready',
                readyAt: new Date().toISOString()
            });
            Toast.success('Order ready for delivery!');
        } catch (error) {
            console.error('Error:', error);
            Toast.error('Failed to update order');
        }
    },
    
    async markOutForDelivery(orderId) {
        try {
            await DB.update('orders', orderId, { 
                status: 'completed',
                outForDeliveryAt: new Date().toISOString()
            });
            Toast.success('Order out for delivery!');
        } catch (error) {
            console.error('Error:', error);
            Toast.error('Failed to update order');
        }
    },
    
    async markDelivered(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        try {
            // Update order status to delivered
            await DB.update('orders', orderId, { 
                status: 'delivered',
                deliveredAt: new Date().toISOString(),
                completedBy: Auth.userData?.id
            });
            
            // Create a sale record from this order
            const today = Utils.getTodayKey();
            const saleNum = await DB.getNextSaleNumber();
            const saleId = `S-${today.replace(/-/g, '')}-${String(saleNum).padStart(3, '0')}`;
            
            await DB.add('sales', {
                saleId,
                dateKey: today,
                timestamp: new Date().toISOString(),
                items: order.items,
                subtotal: order.subtotal || order.total,
                totalDiscount: order.discount || 0,
                total: order.total,
                paymentMethod: order.paymentMethod || 'online',
                source: 'online',
                orderId: orderId,
                customerName: order.customerName,
                createdBy: Auth.userData?.id
            });
            
            Toast.success('Order delivered and recorded!');
        } catch (error) {
            console.error('Error:', error);
            Toast.error('Failed to complete order');
        }
    },
    
    async cancel(orderId) {
        const reason = prompt('Reason for cancellation (optional):');
        
        try {
            await DB.update('orders', orderId, { 
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
                cancelledBy: Auth.userData?.id,
                cancelReason: reason || null
            });
            Toast.info('Order cancelled');
        } catch (error) {
            console.error('Error:', error);
            Toast.error('Failed to cancel order');
        }
    }
};
