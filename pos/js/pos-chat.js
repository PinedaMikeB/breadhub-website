/**
 * BreadHub POS - Chat System
 * Real-time messaging with customers
 * Persistent notifications until acknowledged
 */

const POSChat = {
    chats: [],
    currentChat: null,
    unsubscribeList: null,
    unsubscribeMessages: null,
    totalUnread: 0,
    notificationSound: null,

    // Initialize
    async init() {
        this.createNotificationSound();
        this.startListening();
        this.renderPanel();
    },

    // Create notification sound
    createNotificationSound() {
        try {
            this.notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQIAJI/Z7cCJCgAWft3xvIsOABJ3+vLAjQ8AEn/98L2OEQA=');
            this.notificationSound.volume = 0.6;
        } catch (e) {}
    },

    playSound() {
        if (this.notificationSound) {
            this.notificationSound.currentTime = 0;
            this.notificationSound.play().catch(() => {});
        }
    },

    // Listen to all chats
    startListening() {
        if (this.unsubscribeList) this.unsubscribeList();

        this.unsubscribeList = db.collection('chats')
            .orderBy('lastMessageAt', 'desc')
            .onSnapshot(snapshot => {
                const oldUnread = this.totalUnread;
                
                this.chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.totalUnread = this.chats.reduce((sum, chat) => sum + (chat.unreadByCashier || 0), 0);
                
                // Check for new messages
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        const chat = change.doc.data();
                        if (chat.lastMessageFrom === 'customer' && chat.unreadByCashier > 0) {
                            this.playSound();
                            Toast.info(`💬 New message from ${chat.customerName}`);
                        }
                    }
                });

                this.updateBadge();
                this.renderChatList();
            }, error => {
                console.error('Chat list error:', error);
            });
    },

    // Update badge
    updateBadge() {
        const badge = document.getElementById('chatsBadge');
        if (badge) {
            badge.textContent = this.totalUnread;
            badge.style.display = this.totalUnread > 0 ? 'inline' : 'none';
        }
    },

    // Render chat panel
    renderPanel() {
        // Check if panel already exists
        if (document.getElementById('posChatPanel')) return;

        const panel = document.createElement('div');
        panel.id = 'posChatPanel';
        panel.className = 'pos-chat-panel';
        panel.innerHTML = `
            <div class="chat-panel-header">
                <h3>💬 Customer Chats <span id="chatsBadge" class="badge" style="display:none;">0</span></h3>
                <button onclick="POSChat.togglePanel()" class="btn btn-sm">−</button>
            </div>
            <div class="chat-panel-body">
                <div id="chatListContainer" class="chat-list-container"></div>
                <div id="chatConversation" class="chat-conversation" style="display:none;">
                    <div class="conversation-header">
                        <button onclick="POSChat.backToList()" class="btn btn-sm">← Back</button>
                        <span id="conversationTitle">Customer</span>
                    </div>
                    <div id="conversationMessages" class="conversation-messages"></div>
                    <div class="conversation-input">
                        <input type="text" id="posChatInput" placeholder="Type a reply..." 
                               onkeypress="if(event.key==='Enter')POSChat.send()">
                        <button onclick="POSChat.send()" class="btn btn-primary">Send</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        this.addStyles();
    },

    // Toggle panel visibility
    togglePanel() {
        const panel = document.getElementById('posChatPanel');
        if (panel) {
            panel.classList.toggle('minimized');
        }
    },

    // Render chat list
    renderChatList() {
        const container = document.getElementById('chatListContainer');
        if (!container) return;

        if (this.chats.length === 0) {
            container.innerHTML = `
                <div class="empty-chats">
                    <p>No customer chats yet</p>
                    <p style="font-size:0.85rem;color:#999;">Messages from customers will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.chats.map(chat => `
            <div class="chat-item ${chat.unreadByCashier > 0 ? 'unread' : ''}" 
                 onclick="POSChat.openChat('${chat.id}')">
                <div class="chat-item-avatar">
                    ${chat.customerName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div class="chat-item-info">
                    <div class="chat-item-name">
                        ${chat.customerName || 'Customer'}
                        ${chat.unreadByCashier > 0 ? `<span class="unread-count">${chat.unreadByCashier}</span>` : ''}
                    </div>
                    <div class="chat-item-preview">${chat.lastMessage || 'No messages'}</div>
                    <div class="chat-item-time">${this.formatTime(chat.lastMessageAt)}</div>
                </div>
            </div>
        `).join('');
    },

    // Open specific chat
    async openChat(customerId) {
        this.currentChat = customerId;
        const chat = this.chats.find(c => c.id === customerId);
        
        document.getElementById('chatListContainer').style.display = 'none';
        document.getElementById('chatConversation').style.display = 'flex';
        document.getElementById('conversationTitle').textContent = chat?.customerName || 'Customer';
        
        // Start listening to messages
        this.listenToMessages(customerId);
        
        // Mark as read
        await this.markAsRead(customerId);
    },

    // Listen to messages in current chat
    listenToMessages(customerId) {
        if (this.unsubscribeMessages) this.unsubscribeMessages();

        this.unsubscribeMessages = db.collection('chats')
            .doc(customerId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.renderMessages(messages);
            });
    },

    // Render messages
    renderMessages(messages) {
        const container = document.getElementById('conversationMessages');
        if (!container) return;

        if (messages.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;padding:2rem;">No messages yet</p>';
            return;
        }

        container.innerHTML = messages.map(msg => `
            <div class="message ${msg.from === 'cashier' ? 'sent' : 'received'}">
                <div class="message-content">${msg.text}</div>
                <div class="message-meta">
                    ${this.formatTime(msg.timestamp)}
                    ${msg.from === 'cashier' && msg.readByCustomer ? ' ✓✓' : ''}
                </div>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    },

    // Send message
    async send() {
        const input = document.getElementById('posChatInput');
        const text = input.value.trim();
        
        if (!text || !this.currentChat) return;

        input.value = '';

        try {
            // Add message
            await db.collection('chats')
                .doc(this.currentChat)
                .collection('messages')
                .add({
                    text: text,
                    from: 'cashier',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    readByCashier: true,
                    readByCustomer: false
                });

            // Update chat metadata
            await db.collection('chats').doc(this.currentChat).update({
                lastMessage: text,
                lastMessageFrom: 'cashier',
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                unreadByCustomer: firebase.firestore.FieldValue.increment(1)
            });

        } catch (error) {
            console.error('Error sending:', error);
            Toast.error('Failed to send message');
        }
    },

    // Mark chat as read
    async markAsRead(customerId) {
        try {
            // Get unread messages
            const snapshot = await db.collection('chats')
                .doc(customerId)
                .collection('messages')
                .where('from', '==', 'customer')
                .where('readByCashier', '==', false)
                .get();

            if (snapshot.empty) return;

            // Mark each as read
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { readByCashier: true });
            });
            await batch.commit();

            // Reset unread count
            await db.collection('chats').doc(customerId).update({
                unreadByCashier: 0
            });

        } catch (error) {
            console.log('Mark as read error:', error);
        }
    },

    // Back to chat list
    backToList() {
        if (this.unsubscribeMessages) {
            this.unsubscribeMessages();
            this.unsubscribeMessages = null;
        }
        this.currentChat = null;
        document.getElementById('chatListContainer').style.display = 'block';
        document.getElementById('chatConversation').style.display = 'none';
    },

    // Format time
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
        if (diff < 86400000) return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
        return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    },

    // Add styles
    addStyles() {
        if (document.getElementById('posChatStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'posChatStyles';
        styles.textContent = `
            .pos-chat-panel {
                position: fixed;
                bottom: 0;
                right: 20px;
                width: 320px;
                background: white;
                border-radius: 12px 12px 0 0;
                box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
                z-index: 1000;
                overflow: hidden;
                transition: transform 0.3s;
            }
            .pos-chat-panel.minimized {
                transform: translateY(calc(100% - 50px));
            }
            .chat-panel-header {
                background: linear-gradient(135deg, #5D4037, #3E2723);
                color: white;
                padding: 0.75rem 1rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
            }
            .chat-panel-header h3 {
                margin: 0;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .chat-panel-header .badge {
                background: #f44336;
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 0.75rem;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            .chat-panel-body {
                height: 400px;
                display: flex;
                flex-direction: column;
            }
            .chat-list-container {
                flex: 1;
                overflow-y: auto;
            }
            .empty-chats {
                text-align: center;
                padding: 3rem 1rem;
                color: #666;
            }
            .chat-item {
                display: flex;
                padding: 0.75rem 1rem;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background 0.2s;
            }
            .chat-item:hover {
                background: #f5f5f5;
            }
            .chat-item.unread {
                background: #FFF3E0;
            }
            .chat-item-avatar {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #E65100, #FF8A50);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                margin-right: 0.75rem;
                flex-shrink: 0;
            }
            .chat-item-info {
                flex: 1;
                min-width: 0;
            }
            .chat-item-name {
                font-weight: 600;
                color: #333;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .unread-count {
                background: #f44336;
                color: white;
                font-size: 0.7rem;
                padding: 2px 6px;
                border-radius: 10px;
            }
            .chat-item-preview {
                font-size: 0.85rem;
                color: #666;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .chat-item-time {
                font-size: 0.75rem;
                color: #999;
            }
            .chat-conversation {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .conversation-header {
                padding: 0.5rem 1rem;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                gap: 0.75rem;
                background: #f9f9f9;
            }
            .conversation-header span {
                font-weight: 600;
            }
            .conversation-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
                background: #f5f5f5;
            }
            .message {
                margin-bottom: 0.75rem;
                display: flex;
                flex-direction: column;
            }
            .message.sent {
                align-items: flex-end;
            }
            .message.received {
                align-items: flex-start;
            }
            .message-content {
                max-width: 80%;
                padding: 0.6rem 1rem;
                border-radius: 16px;
                word-wrap: break-word;
            }
            .message.sent .message-content {
                background: #E65100;
                color: white;
                border-bottom-right-radius: 4px;
            }
            .message.received .message-content {
                background: white;
                color: #333;
                border-bottom-left-radius: 4px;
            }
            .message-meta {
                font-size: 0.65rem;
                color: #999;
                margin-top: 2px;
            }
            .conversation-input {
                display: flex;
                padding: 0.5rem;
                gap: 0.5rem;
                border-top: 1px solid #eee;
                background: white;
            }
            .conversation-input input {
                flex: 1;
                padding: 0.5rem 1rem;
                border: 1px solid #ddd;
                border-radius: 20px;
                outline: none;
            }
            .conversation-input input:focus {
                border-color: #E65100;
            }
        `;
        document.head.appendChild(styles);
    }
};

// Auto-initialize when POS loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Auth to be ready (user logged in with shift)
    const initChat = setInterval(() => {
        if (Auth && Auth.userData && Auth.currentShift) {
            clearInterval(initChat);
            POSChat.init();
        }
    }, 1000);
    // Stop checking after 60 seconds
    setTimeout(() => clearInterval(initChat), 60000);
});
