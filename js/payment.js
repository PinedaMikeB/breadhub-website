/**
 * BreadHub Payment System
 * Manual GCash/Bank Transfer with Screenshot Upload
 * No COD - Serious Buyers Only
 */

const Payment = {
    // Payment account details
    accounts: {
        gcash: {
            name: 'GCash',
            icon: '📱',
            number: '0976 622 0592',
            accountName: 'Mike Pineda',
            // QR Code as data URL (GCash QR for 09766220592)
            qrCode: null // Will generate dynamically
        },
        bank: {
            name: 'China Bank',
            icon: '🏦',
            number: '1448 0000 5169',
            accountName: 'Breadhub OPC'
        }
    },

    currentOrder: null,
    uploadedImage: null,

    // Generate GCash QR Code URL
    getGCashQR() {
        // Using QR code API to generate GCash number QR
        const gcashNumber = '09766220592';
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gcashNumber)}`;
    },

    // Show payment modal after order is placed
    showPaymentModal(order) {
        this.currentOrder = order;
        this.uploadedImage = null;

        // Create modal if doesn't exist
        let modal = document.getElementById('paymentModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'paymentModal';
            modal.className = 'modal-overlay payment-modal';
            document.body.appendChild(modal);
        }

        const totalAmount = order.total || 0;

        modal.innerHTML = `
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header" style="background: linear-gradient(135deg, #1565C0, #0D47A1);">
                    <h2>💳 Complete Payment</h2>
                </div>
                <div class="modal-body" style="padding: 0;">
                    <!-- Amount Section -->
                    <div class="payment-amount">
                        <span>Amount to Pay</span>
                        <strong>₱${totalAmount.toFixed(2)}</strong>
                    </div>

                    <!-- Payment Methods Tabs -->
                    <div class="payment-tabs">
                        <button class="payment-tab active" onclick="Payment.showMethod('gcash')">
                            📱 GCash
                        </button>
                        <button class="payment-tab" onclick="Payment.showMethod('bank')">
                            🏦 Bank Transfer
                        </button>
                    </div>

                    <!-- GCash Section -->
                    <div id="gcashSection" class="payment-section active">
                        <div class="payment-qr">
                            <img src="${this.getGCashQR()}" alt="GCash QR Code" />
                            <p>Scan QR or send to number below</p>
                        </div>
                        <div class="payment-details">
                            <div class="detail-row">
                                <span>GCash Number</span>
                                <strong id="gcashNumber">0976 622 0592</strong>
                                <button class="copy-btn" onclick="Payment.copyText('0976 622 0592', this)">📋 Copy</button>
                            </div>
                            <div class="detail-row">
                                <span>Account Name</span>
                                <strong>Mike Pineda</strong>
                            </div>
                            <div class="detail-row">
                                <span>Amount</span>
                                <strong>₱${totalAmount.toFixed(2)}</strong>
                                <button class="copy-btn" onclick="Payment.copyText('${totalAmount.toFixed(2)}', this)">📋 Copy</button>
                            </div>
                        </div>
                        <a href="https://gcash.com" target="_blank" class="open-app-btn">
                            📱 Open GCash App
                        </a>
                    </div>

                    <!-- Bank Section -->
                    <div id="bankSection" class="payment-section">
                        <div class="payment-details">
                            <div class="bank-logo">🏦 China Bank</div>
                            <div class="detail-row">
                                <span>Account Number</span>
                                <strong>1448 0000 5169</strong>
                                <button class="copy-btn" onclick="Payment.copyText('144800005169', this)">📋 Copy</button>
                            </div>
                            <div class="detail-row">
                                <span>Account Name</span>
                                <strong>Breadhub OPC</strong>
                            </div>
                            <div class="detail-row">
                                <span>Amount</span>
                                <strong>₱${totalAmount.toFixed(2)}</strong>
                                <button class="copy-btn" onclick="Payment.copyText('${totalAmount.toFixed(2)}', this)">📋 Copy</button>
                            </div>
                        </div>
                    </div>

                    <!-- Upload Section -->
                    <div class="upload-section">
                        <h4>📷 Upload Payment Screenshot</h4>
                        <p>After sending payment, upload your screenshot as proof</p>
                        
                        <div class="upload-preview" id="uploadPreview">
                            <span>No image selected</span>
                        </div>
                        
                        <div class="upload-buttons">
                            <label class="upload-btn camera">
                                📷 Take Photo
                                <input type="file" accept="image/*" capture="environment" onchange="Payment.handleUpload(event)" style="display:none;">
                            </label>
                            <label class="upload-btn gallery">
                                🖼️ Choose from Gallery
                                <input type="file" accept="image/*" onchange="Payment.handleUpload(event)" style="display:none;">
                            </label>
                        </div>
                    </div>

                    <!-- Submit Button -->
                    <div class="payment-actions">
                        <button class="submit-payment-btn" id="submitPaymentBtn" onclick="Payment.submitProof()" disabled>
                            ✅ Submit Payment Proof
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('open');
        this.addStyles();
    },

    // Switch payment method tab
    showMethod(method) {
        document.querySelectorAll('.payment-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.payment-section').forEach(sec => sec.classList.remove('active'));
        
        event.target.classList.add('active');
        document.getElementById(`${method}Section`).classList.add('active');
    },

    // Copy text to clipboard
    async copyText(text, btn) {
        try {
            await navigator.clipboard.writeText(text.replace(/\s/g, ''));
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            btn.style.background = '#4CAF50';
            btn.style.color = 'white';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text.replace(/\s/g, '');
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            btn.innerHTML = '✅ Copied!';
            setTimeout(() => btn.innerHTML = '📋 Copy', 2000);
        }
    },

    // Handle image upload
    handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('Image too large. Please select a smaller image.');
            return;
        }

        // Preview image
        const reader = new FileReader();
        reader.onload = (e) => {
            this.uploadedImage = e.target.result;
            const preview = document.getElementById('uploadPreview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Payment Screenshot">`;
            preview.classList.add('has-image');
            
            // Enable submit button
            document.getElementById('submitPaymentBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    },

    // Submit payment proof
    async submitProof() {
        if (!this.uploadedImage || !this.currentOrder) {
            showToast('Please upload a payment screenshot');
            return;
        }

        const btn = document.getElementById('submitPaymentBtn');
        btn.disabled = true;
        btn.innerHTML = '⏳ Uploading...';

        try {
            // Determine which payment method was selected
            const isGcash = document.getElementById('gcashSection').classList.contains('active');
            const paymentMethod = isGcash ? 'gcash' : 'bank_transfer';

            // Save payment proof to Firebase
            // We'll store the base64 image directly in Firestore (for small images)
            // For production, you'd want to use Firebase Storage
            
            await db.collection('orders').doc(this.currentOrder.id).update({
                paymentMethod: paymentMethod,
                paymentStatus: 'pending_verification',
                paymentProof: this.uploadedImage,
                paymentSubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Also create a payment record for easier tracking
            await db.collection('payments').add({
                orderId: this.currentOrder.id,
                orderNumber: this.currentOrder.orderNumber,
                customerId: this.currentOrder.customerId,
                customerName: this.currentOrder.customerName,
                amount: this.currentOrder.total,
                method: paymentMethod,
                proof: this.uploadedImage,
                status: 'pending_verification',
                submittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Close payment modal and show confirmation
            this.closeModal();
            this.showConfirmation(this.currentOrder);

            showToast('Payment proof submitted! We\'ll verify it shortly.');

        } catch (error) {
            console.error('Error submitting payment:', error);
            showToast('Failed to submit. Please try again.');
            btn.disabled = false;
            btn.innerHTML = '✅ Submit Payment Proof';
        }
    },

    // Close payment modal
    closeModal() {
        const modal = document.getElementById('paymentModal');
        if (modal) modal.classList.remove('open');
    },

    // Show order confirmation after payment submitted
    showConfirmation(order) {
        document.getElementById('confirmOrderNumber').textContent = order.orderNumber;
        document.getElementById('confirmationModal').classList.add('open');
        
        // Update confirmation modal to show payment status
        const modal = document.getElementById('confirmationModal');
        const body = modal.querySelector('.modal-body');
        
        // Add payment status indicator
        let paymentIndicator = modal.querySelector('.payment-indicator');
        if (!paymentIndicator) {
            paymentIndicator = document.createElement('div');
            paymentIndicator.className = 'payment-indicator';
            body.insertBefore(paymentIndicator, body.querySelector('.confirmation-message'));
        }
        paymentIndicator.innerHTML = `
            <div style="background:#FFF3E0;color:#E65100;padding:10px 15px;border-radius:8px;margin:10px 0;font-size:0.9rem;">
                ⏳ Payment: Waiting for verification
            </div>
        `;
    },

    // Add CSS styles
    addStyles() {
        if (document.getElementById('paymentStyles')) return;

        const styles = document.createElement('style');
        styles.id = 'paymentStyles';
        styles.textContent = `
            .payment-modal .modal {
                max-width: 420px;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .payment-amount {
                background: linear-gradient(135deg, #1565C0, #0D47A1);
                color: white;
                padding: 20px;
                text-align: center;
            }
            .payment-amount span {
                display: block;
                font-size: 0.9rem;
                opacity: 0.9;
            }
            .payment-amount strong {
                display: block;
                font-size: 2rem;
                font-weight: 700;
                margin-top: 5px;
            }
            
            .payment-tabs {
                display: flex;
                border-bottom: 2px solid #eee;
            }
            .payment-tab {
                flex: 1;
                padding: 12px;
                border: none;
                background: #f5f5f5;
                font-size: 0.95rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .payment-tab.active {
                background: white;
                color: #1565C0;
                border-bottom: 2px solid #1565C0;
                margin-bottom: -2px;
            }
            
            .payment-section {
                display: none;
                padding: 20px;
            }
            .payment-section.active {
                display: block;
            }
            
            .payment-qr {
                text-align: center;
                margin-bottom: 20px;
            }
            .payment-qr img {
                width: 150px;
                height: 150px;
                border: 3px solid #1565C0;
                border-radius: 12px;
                padding: 5px;
                background: white;
            }
            .payment-qr p {
                margin-top: 8px;
                font-size: 0.85rem;
                color: #666;
            }
            
            .payment-details {
                background: #f9f9f9;
                border-radius: 12px;
                padding: 15px;
            }
            .bank-logo {
                text-align: center;
                font-size: 1.2rem;
                font-weight: 600;
                margin-bottom: 15px;
                color: #1565C0;
            }
            .detail-row {
                display: flex;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #eee;
            }
            .detail-row:last-child {
                border-bottom: none;
            }
            .detail-row span {
                flex: 1;
                font-size: 0.85rem;
                color: #666;
            }
            .detail-row strong {
                font-size: 0.95rem;
                margin-right: 10px;
            }
            .copy-btn {
                padding: 5px 10px;
                font-size: 0.75rem;
                background: #e3f2fd;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .copy-btn:hover {
                background: #1565C0;
                color: white;
            }
            
            .open-app-btn {
                display: block;
                text-align: center;
                padding: 12px;
                background: #007bff;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                margin-top: 15px;
                font-weight: 600;
            }
            
            .upload-section {
                padding: 20px;
                border-top: 1px solid #eee;
            }
            .upload-section h4 {
                margin: 0 0 5px;
                color: #333;
            }
            .upload-section p {
                margin: 0 0 15px;
                font-size: 0.85rem;
                color: #666;
            }
            
            .upload-preview {
                border: 2px dashed #ddd;
                border-radius: 12px;
                height: 120px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 15px;
                background: #fafafa;
                overflow: hidden;
            }
            .upload-preview span {
                color: #999;
            }
            .upload-preview.has-image {
                border-style: solid;
                border-color: #4CAF50;
            }
            .upload-preview img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            
            .upload-buttons {
                display: flex;
                gap: 10px;
            }
            .upload-btn {
                flex: 1;
                padding: 12px;
                text-align: center;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                font-size: 0.9rem;
                transition: all 0.2s;
            }
            .upload-btn.camera {
                background: #E65100;
                color: white;
            }
            .upload-btn.gallery {
                background: #f5f5f5;
                color: #333;
                border: 2px solid #ddd;
            }
            .upload-btn:hover {
                transform: scale(1.02);
            }
            
            .payment-actions {
                padding: 15px 20px 20px;
            }
            .submit-payment-btn {
                width: 100%;
                padding: 15px;
                font-size: 1rem;
                font-weight: 600;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .submit-payment-btn:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .submit-payment-btn:not(:disabled):hover {
                background: #43A047;
            }
        `;
        document.head.appendChild(styles);
    }
};
