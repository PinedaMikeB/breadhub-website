/**
 * BreadHub Order Tracker Component
 * Visual progress tracker like Grab - shows order status with animations
 */

const OrderTracker = {
    currentOrder: null,
    unsubscribe: null,

    // Status configuration
    statuses: [
        { 
            key: 'pending', 
            label: 'Pending', 
            icon: '📋',
            message: 'Order received, waiting for confirmation',
            color: '#FFC107'
        },
        { 
            key: 'confirmed', 
            label: 'Confirmed', 
            icon: '👨‍🍳',
            message: 'We are now preparing your order',
            color: '#4CAF50'
        },
        { 
            key: 'ready', 
            label: 'Ready', 
            icon: '📦',
            message: 'Preparing to deliver your order',
            color: '#2196F3'
        },
        { 
            key: 'completed', 
            label: 'Out for Delivery', 
            icon: '🚗',
            message: 'On the way to you!',
            color: '#9C27B0'
        },
        { 
            key: 'delivered', 
            label: 'Delivered', 
            icon: '🏠',
            message: 'Order delivered. Enjoy your food!',
            color: '#4CAF50'
        }
    ],

    // Get status index
    getStatusIndex(status) {
        const idx = this.statuses.findIndex(s => s.key === status);
        return idx >= 0 ? idx : 0;
    },

    // Get status info
    getStatusInfo(status) {
        return this.statuses.find(s => s.key === status) || this.statuses[0];
    },

    // Render tracker HTML
    render(order) {
        if (!order) return '';
        
        const currentIdx = this.getStatusIndex(order.status);
        const statusInfo = this.getStatusInfo(order.status);
        const isCancelled = order.status === 'cancelled';
        
        if (isCancelled) {
            return `
                <div class="order-tracker cancelled">
                    <div class="tracker-status-banner" style="background: #f44336;">
                        <span class="status-icon">❌</span>
                        <div class="status-text">
                            <strong>Order Cancelled</strong>
                            <span>This order has been cancelled</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // If delivered, show success message
        if (order.status === 'delivered') {
            return `
                <div class="order-tracker delivered">
                    <div class="tracker-status-banner" style="background: linear-gradient(135deg, #4CAF50, #2E7D32);">
                        <span class="status-icon">✅</span>
                        <div class="status-text">
                            <strong>Delivered!</strong>
                            <span>Thank you for ordering from BreadHub!</span>
                        </div>
                    </div>
                    <div class="tracker-progress all-complete">
                        <div class="tracker-step completed"><div class="step-icon">📋</div><div class="step-label">Ordered</div></div>
                        <div class="step-connector completed"></div>
                        <div class="tracker-step completed"><div class="step-icon">👨‍🍳</div><div class="step-label">Prepared</div></div>
                        <div class="step-connector completed"></div>
                        <div class="tracker-step completed"><div class="step-icon">📦</div><div class="step-label">Ready</div></div>
                        <div class="step-connector completed"></div>
                        <div class="tracker-step completed"><div class="step-icon">🚗</div><div class="step-label">Delivered</div></div>
                    </div>
                    <div class="tracker-order-info">
                        <div class="order-number">Order #${order.orderNumber || order.id?.slice(-8).toUpperCase()}</div>
                        <div class="order-items">${(order.items || []).map(i => `${i.quantity}x ${i.productName}`).join(', ')}</div>
                        <div class="order-total">Total: ₱${(order.total || 0).toFixed(2)}</div>
                    </div>
                </div>
            `;
        }

        // Build progress steps for active orders
        const steps = [
            { key: 'pending', icon: '📋', label: 'Pending' },
            { key: 'confirmed', icon: '👨‍🍳', label: 'Confirmed' },
            { key: 'ready', icon: '📦', label: 'Ready' },
            { key: 'completed', icon: '🚗', label: 'Delivery' }
        ];
        
        const stepsHtml = steps.map((step, idx) => {
            const stepStatusIdx = this.getStatusIndex(step.key);
            const isCompleted = currentIdx > stepStatusIdx;
            const isCurrent = currentIdx === stepStatusIdx;
            
            let stepClass = 'upcoming';
            if (isCompleted) stepClass = 'completed';
            if (isCurrent) stepClass = 'current';
            
            return `
                <div class="tracker-step ${stepClass}">
                    <div class="step-icon">${step.icon}</div>
                    <div class="step-label">${step.label}</div>
                </div>
                ${idx < steps.length - 1 ? `<div class="step-connector ${isCompleted ? 'completed' : ''}"></div>` : ''}
            `;
        }).join('');

        return `
            <div class="order-tracker">
                <div class="tracker-status-banner" style="background: ${statusInfo.color};">
                    <span class="status-icon">${statusInfo.icon}</span>
                    <div class="status-text">
                        <strong>${statusInfo.label}</strong>
                        <span>${statusInfo.message}</span>
                    </div>
                </div>
                <div class="tracker-progress">
                    ${stepsHtml}
                </div>
                <div class="tracker-order-info">
                    <div class="order-number">Order #${order.orderNumber || order.id?.slice(-8).toUpperCase()}</div>
                    <div class="order-items">${(order.items || []).map(i => `${i.quantity}x ${i.productName}`).join(', ')}</div>
                    <div class="order-total">Total: ₱${(order.total || 0).toFixed(2)}</div>
                </div>
            </div>
        `;
    },

    // Start listening to order updates
    listenToOrder(orderId, callback) {
        if (this.unsubscribe) this.unsubscribe();
        
        this.unsubscribe = db.collection('orders').doc(orderId)
            .onSnapshot(doc => {
                if (doc.exists) {
                    this.currentOrder = { id: doc.id, ...doc.data() };
                    if (callback) callback(this.currentOrder);
                }
            }, error => {
                console.error('Order listener error:', error);
            });
    },

    // Stop listening
    stopListening() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    },

    // Get customer's latest order
    async getLatestOrder(customerId) {
        try {
            // Try with ordering first
            let snapshot = await db.collection('orders')
                .where('customerId', '==', customerId)
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();
            
            if (snapshot.empty) {
                // Fallback without ordering
                snapshot = await db.collection('orders')
                    .where('customerId', '==', customerId)
                    .limit(10)
                    .get();
                
                if (snapshot.empty) return null;
                
                // Sort client-side
                const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                orders.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                    const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                    return dateB - dateA;
                });
                return orders[0];
            }
            
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error('Error getting latest order:', error);
            return null;
        }
    },

    // Add CSS styles
    addStyles() {
        if (document.getElementById('orderTrackerStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'orderTrackerStyles';
        styles.textContent = `
            .order-tracker {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                margin-bottom: 1rem;
            }
            .order-tracker.cancelled {
                opacity: 0.8;
            }
            .order-tracker.delivered {
                border: 2px solid #4CAF50;
            }
            .order-tracker.delivered .tracker-progress.all-complete {
                background: #E8F5E9;
            }
            
            /* Status Banner */
            .tracker-status-banner {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                color: white;
            }
            .tracker-status-banner .status-icon {
                font-size: 1.5rem;
            }
            .tracker-status-banner .status-text {
                display: flex;
                flex-direction: column;
            }
            .tracker-status-banner .status-text strong {
                font-size: 1rem;
            }
            .tracker-status-banner .status-text span {
                font-size: 0.85rem;
                opacity: 0.9;
            }
            
            /* Progress Steps */
            .tracker-progress {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 20px 16px;
                background: #f9f9f9;
            }
            .tracker-step {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                flex: 0 0 auto;
            }
            .step-icon {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
                background: #e0e0e0;
                transition: all 0.3s ease;
            }
            .tracker-step.completed .step-icon {
                background: #4CAF50;
            }
            .tracker-step.current .step-icon {
                background: #E65100;
                animation: pulse-icon 2s infinite;
                box-shadow: 0 0 0 4px rgba(230, 81, 0, 0.2);
            }
            .tracker-step.upcoming .step-icon {
                background: #e0e0e0;
                filter: grayscale(100%);
                opacity: 0.5;
            }
            @keyframes pulse-icon {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            .step-label {
                font-size: 0.7rem;
                font-weight: 600;
                color: #666;
                text-align: center;
                max-width: 60px;
            }
            .tracker-step.completed .step-label {
                color: #4CAF50;
            }
            .tracker-step.current .step-label {
                color: #E65100;
            }
            .tracker-step.upcoming .step-label {
                color: #999;
            }
            
            /* Connector Lines */
            .step-connector {
                flex: 1;
                height: 3px;
                background: #e0e0e0;
                margin: 0 4px;
                margin-bottom: 20px;
                border-radius: 2px;
                transition: background 0.3s ease;
            }
            .step-connector.completed {
                background: #4CAF50;
            }
            
            /* Order Info */
            .tracker-order-info {
                padding: 12px 16px;
                border-top: 1px solid #eee;
            }
            .order-number {
                font-weight: 600;
                color: #333;
                margin-bottom: 4px;
            }
            .order-items {
                font-size: 0.85rem;
                color: #666;
                margin-bottom: 4px;
            }
            .order-total {
                font-weight: 600;
                color: #E65100;
            }
            
            /* Mobile adjustments */
            @media (max-width: 400px) {
                .tracker-progress {
                    padding: 16px 10px;
                }
                .step-icon {
                    width: 36px;
                    height: 36px;
                    font-size: 1rem;
                }
                .step-label {
                    font-size: 0.65rem;
                    max-width: 50px;
                }
            }
        `;
        document.head.appendChild(styles);
    }
};

// Initialize styles on load
document.addEventListener('DOMContentLoaded', () => {
    OrderTracker.addStyles();
});
