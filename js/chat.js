/**
 * BreadHub Chat System v2
 * - Always available for inquiries (even without account)
 * - Opens in modal for better UX
 * - Integrated into order confirmation flow
 */

const Chat = {
    messages: [],
    unsubscribe: null,
    unreadCount: 0,
    isOpen: false,
    sessionId: null, // For non-logged-in users
    notificationSound: null,

    // Initialize chat system
    init() {
        this.createNotificationSound();
        this.getOrCreateSession();
        this.addStyles();
        this.renderChatButton();
        
        // Start listening if we have a session
        if (this.sessionId) {
            this.startListening();
        }
    },

    // Get or create chat session
    getOrCreateSession() {
        // If customer is logged in, use their ID
        if (Customer.data?.id) {
            this.sessionId = Customer.data.id;
            return;
        }
        
        // Otherwise use/create anonymous session
        let sessionId = localStorage.getItem('breadhub_chat_session');
        if (!sessionId) {
            sessionId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('breadhub_chat_session', sessionId);
        }
        this.sessionId = sessionId;
    },

    // Create notification sound
    createNotificationSound() {
        try {
            this.notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQIAJI/Z7cCJCgAWft3xvIsOABJ3+vLAjQ8AEn/98L2OEQA=');
            this.notificationSound.volume = 0.5;
        } catch (e) {}
    },

    playSound() {
        if (this.notificationSound) {
            this.notificationSound.currentTime = 0;
            this.notificationSound.play().catch(() => {});
        }
    },

    // Start real-time listener
    startListening() {
        if (!this.sessionId) return;
        if (this.unsubscribe) this.unsubscribe();

        const chatRef = db.collection('chats')
            .doc(this.sessionId)
            .collection('messages')
            .orderBy('timestamp', 'asc');

        this.unsubscribe = chatRef.onSnapshot(snapshot => {
            this.messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Check for new messages from cashier
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    if (msg.from === 'cashier' && !msg.readByCustomer) {
                        this.unreadCount++;
                        this.updateBadge();
                        if (!this.isOpen) {
                            this.playSound();
                            this.showNotification(msg.text);
                        }
                    }
                }
            });

            if (this.isOpen) {
                this.renderMessages();
                this.markAsRead();
            }
        }, error => {
            console.error('Chat listener error:', error);
        });
    },

    // Update unread badge
    updateBadge() {
        const badge = document.getElementById('chatBadge');
        if (badge) {
            badge.textContent = this.unreadCount;
            badge.style.display = this.unreadCount > 0 ? 'flex' : 'none';
        }
    },

    // Show notification
    showNotification(text) {
        showToast(`💬 New message: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('BreadHub', { body: text, icon: '🍞' });
        }
    },

    // Request notification permission
    async requestPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    },

    // Render floating chat button
    renderChatButton() {
        const existing = document.getElementById('chatButtonFloat');
        if (existing) existing.remove();

        const btn = document.createElement('div');
        btn.id = 'chatButtonFloat';
        btn.className = 'chat-button-float';
        btn.onclick = () => this.openModal();
        btn.innerHTML = `
            💬
            <span id="chatBadge" class="chat-badge" style="display:none;">0</span>
        `;
        document.body.appendChild(btn);
        
        this.requestPermission();
        this.loadUnreadCount();
    },

    // Load initial unread count
    async loadUnreadCount() {
        if (!this.sessionId) return;
        
        try {
            const snapshot = await db.collection('chats')
                .doc(this.sessionId)
                .collection('messages')
                .where('from', '==', 'cashier')
                .where('readByCustomer', '==', false)
                .get();
            
            this.unreadCount = snapshot.size;
            this.updateBadge();
        } catch (error) {
            console.log('Could not load unread count');
        }
    },

    // Open chat modal
    async openModal(context = null, orderId = null) {
        this.isOpen = true;
        
        // Create modal if doesn't exist
        let modal = document.getElementById('chatModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'chatModal';
            modal.className = 'chat-modal-overlay';
            modal.onclick = (e) => { if (e.target === modal) this.closeModal(); };
            document.body.appendChild(modal);
        }
        
        const customerName = Customer.data?.name?.split(' ')[0] || 'there';
        
        // Get order for tracking if customer is logged in
        let trackerHtml = '';
        if (Customer.data?.id && typeof OrderTracker !== 'undefined') {
            let order = null;
            if (orderId) {
                // Get specific order
                const doc = await db.collection('orders').doc(orderId).get();
                if (doc.exists) order = { id: doc.id, ...doc.data() };
            } else {
                // Get latest order
                order = await OrderTracker.getLatestOrder(Customer.data.id);
            }
            
            if (order && order.status !== 'delivered' && order.status !== 'cancelled') {
                trackerHtml = `<div id="chatOrderTracker">${OrderTracker.render(order)}</div>`;
                // Start listening for updates
                OrderTracker.listenToOrder(order.id, (updatedOrder) => {
                    const trackerContainer = document.getElementById('chatOrderTracker');
                    if (trackerContainer) {
                        trackerContainer.innerHTML = OrderTracker.render(updatedOrder);
                    }
                });
            }
        }
        
        modal.innerHTML = `
            <div class="chat-modal">
                <div class="chat-modal-header">
                    <span>💬 Chat with BreadHub</span>
                    <button onclick="Chat.closeModal()" class="chat-modal-close">&times;</button>
                </div>
                ${trackerHtml}
                <div id="chatModalMessages" class="chat-modal-messages"></div>
                <div class="chat-modal-input">
                    <input type="text" id="chatModalInput" placeholder="Type your message..." 
                           onkeypress="if(event.key==='Enter')Chat.send()">
                    <button onclick="Chat.send()" class="chat-send-btn">Send</button>
                </div>
            </div>
        `;
        
        modal.classList.add('open');
        this.renderMessages();
        this.markAsRead();
        
        setTimeout(() => document.getElementById('chatModalInput')?.focus(), 100);
    },

    // Close chat modal
    closeModal() {
        this.isOpen = false;
        const modal = document.getElementById('chatModal');
        if (modal) modal.classList.remove('open');
        
        // Stop order tracker listener
        if (typeof OrderTracker !== 'undefined') {
            OrderTracker.stopListening();
        }
    },

    // Render messages
    renderMessages() {
        const container = document.getElementById('chatModalMessages');
        if (!container) return;

        const customerName = Customer.data?.name?.split(' ')[0] || 'there';

        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="chat-welcome">
                    <div class="chat-welcome-icon">👋</div>
                    <h4>Hi ${customerName}!</h4>
                    <p>How can we help you today?</p>
                    <div class="chat-quick-actions">
                        <button onclick="Chat.sendQuick('What are your store hours?')">🕐 Store Hours</button>
                        <button onclick="Chat.sendQuick('Do you deliver to my area?')">🚗 Delivery Areas</button>
                        <button onclick="Chat.sendQuick('I have a question about my order')">📦 Order Question</button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.messages.map(msg => `
            <div class="chat-msg ${msg.from === 'customer' ? 'sent' : 'received'}">
                <div class="chat-msg-bubble">${this.escapeHtml(msg.text)}</div>
                <div class="chat-msg-time">
                    ${this.formatTime(msg.timestamp)}
                    ${msg.from === 'customer' && msg.readByCashier ? ' ✓✓' : ''}
                </div>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    },

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Format timestamp
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    },

    // Send quick message
    sendQuick(text) {
        document.getElementById('chatModalInput').value = text;
        this.send();
    },

    // Send message
    async send() {
        const input = document.getElementById('chatModalInput');
        const text = input?.value?.trim();
        
        if (!text) return;

        // Ensure we have a session
        if (!this.sessionId) {
            this.getOrCreateSession();
        }

        input.value = '';

        try {
            // Add message
            await db.collection('chats')
                .doc(this.sessionId)
                .collection('messages')
                .add({
                    text: text,
                    from: 'customer',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    readByCashier: false,
                    readByCustomer: true
                });

            // Update chat metadata
            const customerName = Customer.data?.name || 'Guest Visitor';
            const customerPhone = Customer.data?.phone || null;
            
            await db.collection('chats').doc(this.sessionId).set({
                customerId: this.sessionId,
                customerName: customerName,
                customerPhone: customerPhone,
                isGuest: !Customer.data?.id,
                lastMessage: text,
                lastMessageFrom: 'customer',
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                unreadByCashier: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });

            // Start listening if not already
            if (!this.unsubscribe) {
                this.startListening();
            }

        } catch (error) {
            console.error('Error sending message:', error);
            showToast('Failed to send message. Please try again.');
        }
    },

    // Mark messages as read
    async markAsRead() {
        if (!this.sessionId || this.unreadCount === 0) return;

        try {
            const snapshot = await db.collection('chats')
                .doc(this.sessionId)
                .collection('messages')
                .where('from', '==', 'cashier')
                .where('readByCustomer', '==', false)
                .get();

            if (snapshot.empty) return;

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { readByCustomer: true });
            });
            await batch.commit();

            this.unreadCount = 0;
            this.updateBadge();

            await db.collection('chats').doc(this.sessionId).update({
                unreadByCustomer: 0
            });
        } catch (error) {
            console.log('Mark as read error:', error);
        }
    },

    // Link guest session to customer account after login/order
    async linkToCustomer(customerId) {
        if (!this.sessionId || this.sessionId === customerId) return;
        if (!this.sessionId.startsWith('guest_')) return;

        try {
            // Get all messages from guest session
            const messagesSnapshot = await db.collection('chats')
                .doc(this.sessionId)
                .collection('messages')
                .get();

            if (!messagesSnapshot.empty) {
                // Copy messages to customer's chat
                const batch = db.batch();
                for (const doc of messagesSnapshot.docs) {
                    const newRef = db.collection('chats')
                        .doc(customerId)
                        .collection('messages')
                        .doc();
                    batch.set(newRef, doc.data());
                }
                await batch.commit();

                // Update customer chat metadata
                const guestChat = await db.collection('chats').doc(this.sessionId).get();
                if (guestChat.exists) {
                    await db.collection('chats').doc(customerId).set({
                        ...guestChat.data(),
                        customerId: customerId,
                        customerName: Customer.data?.name || 'Customer',
                        customerPhone: Customer.data?.phone || null,
                        isGuest: false
                    }, { merge: true });
                }
            }

            // Update session
            localStorage.removeItem('breadhub_chat_session');
            this.sessionId = customerId;
            
            // Restart listener
            if (this.unsubscribe) this.unsubscribe();
            this.startListening();

        } catch (error) {
            console.error('Error linking chat to customer:', error);
        }
    },

    // Add CSS styles
    addStyles() {
        if (document.getElementById('chatStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'chatStyles';
        styles.textContent = `
            /* Floating Chat Button */
            .chat-button-float {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                background: linear-gradient(135deg, #E65100, #FF8A50);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8rem;
                cursor: pointer;
                box-shadow: 0 4px 20px rgba(230, 81, 0, 0.4);
                z-index: 999;
                transition: transform 0.3s, box-shadow 0.3s;
            }
            .chat-button-float:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 25px rgba(230, 81, 0, 0.5);
            }
            .chat-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #f44336;
                color: white;
                font-size: 0.75rem;
                font-weight: bold;
                min-width: 22px;
                height: 22px;
                border-radius: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            /* Chat Modal Overlay */
            .chat-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 1001;
                padding: 20px;
            }
            .chat-modal-overlay.open {
                display: flex;
            }

            /* Chat Modal */
            .chat-modal {
                background: white;
                border-radius: 16px;
                width: 100%;
                max-width: 450px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            }
            .chat-modal-header {
                background: linear-gradient(135deg, #5D4037, #3E2723);
                color: white;
                padding: 1rem 1.25rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: 600;
                font-size: 1.1rem;
            }
            .chat-modal-close {
                background: none;
                border: none;
                color: white;
                font-size: 1.8rem;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                opacity: 0.8;
            }
            .chat-modal-close:hover { opacity: 1; }

            /* Chat Context (order info) */
            .chat-context {
                background: #FFF3E0;
                padding: 0.75rem 1rem;
                font-size: 0.9rem;
                color: #E65100;
                border-bottom: 1px solid #FFE0B2;
            }

            /* Messages Area */
            .chat-modal-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
                background: #f8f8f8;
                min-height: 300px;
            }

            /* Welcome Screen */
            .chat-welcome {
                text-align: center;
                padding: 2rem 1rem;
            }
            .chat-welcome-icon {
                font-size: 3rem;
                margin-bottom: 0.5rem;
            }
            .chat-welcome h4 {
                margin: 0 0 0.25rem;
                color: #333;
            }
            .chat-welcome p {
                color: #666;
                margin: 0 0 1.5rem;
            }
            .chat-quick-actions {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            .chat-quick-actions button {
                padding: 0.75rem 1rem;
                background: white;
                border: 2px solid #E65100;
                border-radius: 25px;
                color: #E65100;
                font-size: 0.9rem;
                cursor: pointer;
                transition: all 0.2s;
            }
            .chat-quick-actions button:hover {
                background: #E65100;
                color: white;
            }

            /* Messages */
            .chat-msg {
                margin-bottom: 0.75rem;
                display: flex;
                flex-direction: column;
            }
            .chat-msg.sent { align-items: flex-end; }
            .chat-msg.received { align-items: flex-start; }
            .chat-msg-bubble {
                max-width: 85%;
                padding: 0.75rem 1rem;
                border-radius: 18px;
                word-wrap: break-word;
                line-height: 1.4;
            }
            .chat-msg.sent .chat-msg-bubble {
                background: linear-gradient(135deg, #E65100, #FF8A50);
                color: white;
                border-bottom-right-radius: 4px;
            }
            .chat-msg.received .chat-msg-bubble {
                background: white;
                color: #333;
                border-bottom-left-radius: 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .chat-msg-time {
                font-size: 0.7rem;
                color: #999;
                margin-top: 4px;
                padding: 0 4px;
            }

            /* Input Area */
            .chat-modal-input {
                display: flex;
                padding: 0.75rem;
                gap: 0.5rem;
                border-top: 1px solid #eee;
                background: white;
            }
            .chat-modal-input input {
                flex: 1;
                padding: 0.85rem 1rem;
                border: 2px solid #eee;
                border-radius: 25px;
                font-size: 1rem;
                outline: none;
            }
            .chat-modal-input input:focus {
                border-color: #E65100;
            }
            .chat-send-btn {
                padding: 0.85rem 1.5rem;
                background: #E65100;
                color: white;
                border: none;
                border-radius: 25px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
            }
            .chat-send-btn:hover {
                background: #FF8A50;
            }

            /* Mobile adjustments */
            @media (max-width: 480px) {
                .chat-modal {
                    max-height: 90vh;
                    border-radius: 12px;
                }
                .chat-button-float {
                    bottom: 15px;
                    right: 15px;
                    width: 55px;
                    height: 55px;
                }
            }
        `;
        document.head.appendChild(styles);
    },

    // Cleanup
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
};

// Initialize chat on page load
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure Firebase is ready
    setTimeout(() => Chat.init(), 500);
});
