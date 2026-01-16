/**
 * BreadHub Chat System
 * Real-time customer ↔ cashier messaging
 * Persistent notifications until acknowledged
 */

const Chat = {
    messages: [],
    unsubscribe: null,
    unreadCount: 0,
    isOpen: false,
    notificationSound: null,

    // Initialize chat system
    async init() {
        if (!Customer.data?.id) return;
        
        // Create notification sound
        this.createNotificationSound();
        
        // Start listening for messages
        this.startListening();
        
        // Add chat button to page
        this.renderChatButton();
    },

    // Create notification sound
    createNotificationSound() {
        try {
            this.notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQIAJI/Z7cCJCgAWft3xvIsOABJ3+vLAjQ8AEn/98L2OEQA=');
            this.notificationSound.volume = 0.5;
        } catch (e) {
            console.log('Could not create notification sound');
        }
    },

    // Play notification sound
    playSound() {
        if (this.notificationSound) {
            this.notificationSound.currentTime = 0;
            this.notificationSound.play().catch(() => {});
        }
    },

    // Start real-time listener
    startListening() {
        if (!Customer.data?.id) return;
        if (this.unsubscribe) this.unsubscribe();

        const chatRef = db.collection('chats')
            .doc(Customer.data.id)
            .collection('messages')
            .orderBy('timestamp', 'asc');

        this.unsubscribe = chatRef.onSnapshot(snapshot => {
            const oldCount = this.messages.length;
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

            // Update chat UI if open
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
        
        // Also update in header if exists
        const headerBadge = document.getElementById('chatHeaderBadge');
        if (headerBadge) {
            headerBadge.textContent = this.unreadCount;
            headerBadge.style.display = this.unreadCount > 0 ? 'inline' : 'none';
        }
    },

    // Show browser notification
    showNotification(text) {
        // Show toast
        showToast(`💬 New message: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        
        // Try browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('BreadHub', {
                body: text,
                icon: '🍞'
            });
        }
    },

    // Request notification permission
    async requestPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    },

    // Render chat button
    renderChatButton() {
        // Remove existing chat elements
        const existing = document.getElementById('chatWidget');
        if (existing) existing.remove();

        const widget = document.createElement('div');
        widget.id = 'chatWidget';
        widget.innerHTML = `
            <!-- Chat Button -->
            <div id="chatButton" class="chat-button" onclick="Chat.toggle()">
                💬
                <span id="chatBadge" class="chat-badge" style="display:none;">0</span>
            </div>
            
            <!-- Chat Window -->
            <div id="chatWindow" class="chat-window" style="display:none;">
                <div class="chat-header">
                    <span>💬 Chat with BreadHub</span>
                    <button onclick="Chat.toggle()" class="chat-close">&times;</button>
                </div>
                <div id="chatMessages" class="chat-messages"></div>
                <div class="chat-input-area">
                    <input type="text" id="chatInput" placeholder="Type a message..." 
                           onkeypress="if(event.key==='Enter')Chat.send()">
                    <button onclick="Chat.send()" class="chat-send">Send</button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        // Add styles
        this.addStyles();
        
        // Request notification permission
        this.requestPermission();
        
        // Load unread count
        this.loadUnreadCount();
    },

    // Load initial unread count
    async loadUnreadCount() {
        if (!Customer.data?.id) return;
        
        try {
            const snapshot = await db.collection('chats')
                .doc(Customer.data.id)
                .collection('messages')
                .where('from', '==', 'cashier')
                .where('readByCustomer', '==', false)
                .get();
            
            this.unreadCount = snapshot.size;
            this.updateBadge();
        } catch (error) {
            // Index might not exist, that's ok
            console.log('Could not load unread count');
        }
    },

    // Toggle chat window
    toggle() {
        const window = document.getElementById('chatWindow');
        const button = document.getElementById('chatButton');
        
        this.isOpen = !this.isOpen;
        
        if (this.isOpen) {
            window.style.display = 'flex';
            button.style.display = 'none';
            this.renderMessages();
            this.markAsRead();
            document.getElementById('chatInput').focus();
        } else {
            window.style.display = 'none';
            button.style.display = 'flex';
        }
    },

    // Render messages
    renderMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="chat-empty">
                    <div style="font-size:2rem;margin-bottom:0.5rem;">👋</div>
                    <p>Hi ${Customer.data?.name?.split(' ')[0] || 'there'}!</p>
                    <p style="font-size:0.85rem;color:#666;">Send us a message about your order or any questions.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.messages.map(msg => `
            <div class="chat-message ${msg.from === 'customer' ? 'sent' : 'received'}">
                <div class="message-bubble">
                    ${msg.text}
                </div>
                <div class="message-time">
                    ${this.formatTime(msg.timestamp)}
                    ${msg.from === 'customer' && msg.readByCashier ? ' ✓✓' : ''}
                </div>
            </div>
        `).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    },

    // Format timestamp
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    },

    // Send message
    async send() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        
        if (!text || !Customer.data?.id) return;

        input.value = '';
        input.focus();

        try {
            // Add message to chat
            await db.collection('chats')
                .doc(Customer.data.id)
                .collection('messages')
                .add({
                    text: text,
                    from: 'customer',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    readByCashier: false,
                    readByCustomer: true
                });

            // Update chat metadata for POS to see
            await db.collection('chats').doc(Customer.data.id).set({
                customerId: Customer.data.id,
                customerName: Customer.data.name,
                customerPhone: Customer.data.phone,
                lastMessage: text,
                lastMessageFrom: 'customer',
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                unreadByCashier: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });

        } catch (error) {
            console.error('Error sending message:', error);
            showToast('Failed to send message. Please try again.');
        }
    },

    // Mark messages as read
    async markAsRead() {
        if (!Customer.data?.id || this.unreadCount === 0) return;

        try {
            // Get unread messages
            const snapshot = await db.collection('chats')
                .doc(Customer.data.id)
                .collection('messages')
                .where('from', '==', 'cashier')
                .where('readByCustomer', '==', false)
                .get();

            // Mark each as read
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { readByCustomer: true });
            });
            await batch.commit();

            // Reset unread count
            this.unreadCount = 0;
            this.updateBadge();

            // Update chat metadata
            await db.collection('chats').doc(Customer.data.id).update({
                unreadByCustomer: 0
            });

        } catch (error) {
            console.log('Could not mark as read:', error);
        }
    },

    // Add CSS styles
    addStyles() {
        if (document.getElementById('chatStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'chatStyles';
        styles.textContent = `
            .chat-button {
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
                z-index: 1000;
                transition: transform 0.3s, box-shadow 0.3s;
            }
            .chat-button:hover {
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
            .chat-window {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 350px;
                height: 500px;
                max-height: 70vh;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                display: flex;
                flex-direction: column;
                z-index: 1001;
                overflow: hidden;
            }
            @media (max-width: 480px) {
                .chat-window {
                    width: calc(100% - 20px);
                    height: calc(100vh - 100px);
                    max-height: none;
                    bottom: 10px;
                    right: 10px;
                }
            }
            .chat-header {
                background: linear-gradient(135deg, #5D4037, #3E2723);
                color: white;
                padding: 1rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: 600;
            }
            .chat-close {
                background: none;
                border: none;
                color: white;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0;
                line-height: 1;
            }
            .chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
                background: #f5f5f5;
            }
            .chat-empty {
                text-align: center;
                padding: 2rem;
                color: #666;
            }
            .chat-message {
                margin-bottom: 1rem;
                display: flex;
                flex-direction: column;
            }
            .chat-message.sent {
                align-items: flex-end;
            }
            .chat-message.received {
                align-items: flex-start;
            }
            .message-bubble {
                max-width: 80%;
                padding: 0.75rem 1rem;
                border-radius: 18px;
                word-wrap: break-word;
            }
            .chat-message.sent .message-bubble {
                background: linear-gradient(135deg, #E65100, #FF8A50);
                color: white;
                border-bottom-right-radius: 4px;
            }
            .chat-message.received .message-bubble {
                background: white;
                color: #333;
                border-bottom-left-radius: 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .message-time {
                font-size: 0.7rem;
                color: #999;
                margin-top: 4px;
                padding: 0 4px;
            }
            .chat-input-area {
                display: flex;
                padding: 0.75rem;
                background: white;
                border-top: 1px solid #eee;
                gap: 0.5rem;
            }
            .chat-input-area input {
                flex: 1;
                padding: 0.75rem 1rem;
                border: 2px solid #eee;
                border-radius: 25px;
                font-size: 0.95rem;
                outline: none;
                transition: border-color 0.3s;
            }
            .chat-input-area input:focus {
                border-color: #E65100;
            }
            .chat-send {
                padding: 0.75rem 1.25rem;
                background: #E65100;
                color: white;
                border: none;
                border-radius: 25px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.3s;
            }
            .chat-send:hover {
                background: #FF8A50;
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
        const widget = document.getElementById('chatWidget');
        if (widget) widget.remove();
    }
};

// Initialize chat when customer is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for customer to be loaded, then init chat
    const checkCustomer = setInterval(() => {
        if (Customer.data?.id) {
            clearInterval(checkCustomer);
            Chat.init();
        }
    }, 500);
    
    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkCustomer), 10000);
});
