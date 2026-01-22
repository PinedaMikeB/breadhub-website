/**
 * BreadHub POS - Point of Sale System v2 - Added main category filter
 * 
 * Uses products from ProofMaster (shared database)
 * Saves sales to 'sales' collection
 * 
 * Features:
 * - Per-item discount toggle (like Loyverse)
 * - Multiple discount types (Senior, PWD, Custom)
 */

const POS = {
    products: [],
    categories: [],
    cart: [],
    
    // Main category filter (breads vs drinks)
    currentMainCategory: 'all',
    
    // Discount presets - loaded from Firebase (no defaults)
    discountPresets: [],
    
    // Active discount for new items
    activeDiscount: null,
    
    // GCash payment verification
    gcashPaymentData: null,
    gcashPhotoStream: null,
    
    // Feature toggles (can be disabled by admin)
    discountIdCaptureEnabled: true,
    gcashCaptureEnabled: true,
    
    currentCategory: 'all',
    
    async init() {
        await this.loadProducts();
        await this.loadDiscountPresets();
        await this.loadFeatureSettings();
        
        // Initialize stock manager
        if (typeof StockManager !== 'undefined') {
            await StockManager.init();
        }
        
        this.renderCategories();
        this.renderProducts();
        this.renderDiscountBar();
    },
    
    async loadFeatureSettings() {
        try {
            const settings = await DB.get('settings', 'pos');
            // Default to enabled if not set
            this.discountIdCaptureEnabled = settings?.discountIdCapture !== false;
            this.gcashCaptureEnabled = settings?.gcashCapture !== false;
            console.log('Feature settings loaded:', {
                discountIdCapture: this.discountIdCaptureEnabled,
                gcashCapture: this.gcashCaptureEnabled
            });
        } catch (error) {
            console.log('Using default feature settings');
        }
    },
    
    async loadProducts() {
        try {
            const allProducts = await DB.getAll('products');
            
            // Filter out disabled products (isEnabled === false)
            this.products = allProducts.filter(p => p.isEnabled !== false);
            this.products.sort((a, b) => a.name.localeCompare(b.name));
            
            const cats = new Set();
            this.products.forEach(p => {
                if (p.category) cats.add(p.category);
            });
            this.categories = Array.from(cats).sort();
            
            console.log(`Loaded ${this.products.length} products (${allProducts.length - this.products.length} disabled)`);
        } catch (error) {
            console.error('Error loading products:', error);
            Toast.error('Failed to load products');
        }
    },
    
    async loadDiscountPresets() {
        try {
            const stored = await DB.getAll('discountPresets');
            // Always use what's in Firebase - no defaults
            this.discountPresets = stored || [];
        } catch (error) {
            console.log('Error loading discount presets:', error);
            this.discountPresets = [];
        }
    },
    
    // ========== DISCOUNT BAR (Like Loyverse) ==========
    
    renderDiscountBar() {
        const container = document.getElementById('discountBar');
        if (!container) return;
        
        container.innerHTML = `
            <div class="discount-bar">
                <span class="discount-label">Quick Discount:</span>
                <div class="discount-toggles">
                    ${this.discountPresets.map(d => `
                        <button class="discount-toggle ${this.activeDiscount?.id === d.id ? 'active' : ''}" 
                                data-discount-id="${d.id}"
                                onclick="POS.toggleDiscount('${d.id}')">
                            ${d.icon} ${d.name} (${d.percent}%)
                        </button>
                    `).join('')}
                    <button class="discount-toggle" onclick="POS.showCustomDiscount()">
                        ✏️ Custom
                    </button>
                </div>
                ${this.activeDiscount ? `
                    <div class="active-discount-badge">
                        Active: ${this.activeDiscount.icon} ${this.activeDiscount.name}
                        <button onclick="POS.clearActiveDiscount()">×</button>
                    </div>
                ` : ''}
            </div>
        `;
    },
    
    toggleDiscount(discountId) {
        console.log('toggleDiscount called:', discountId);
        
        if (this.activeDiscount?.id === discountId) {
            // Turn off
            this.activeDiscount = null;
            this.discountIdPhoto = null;
            this.renderDiscountBar();
            Toast.info('Discount disabled');
        } else {
            // For Senior/PWD, require ID photo (if enabled)
            const discount = this.discountPresets.find(d => d.id === discountId);
            console.log('Discount found:', discount);
            
            // Check if this discount requires ID (by name or flag)
            const requiresId = discount && (
                discountId === 'senior' || 
                discountId === 'pwd' || 
                discount.requiresId ||
                discount.name?.toLowerCase().includes('senior') ||
                discount.name?.toLowerCase().includes('pwd')
            );
            
            // Only show camera if ID capture is ENABLED
            if (requiresId && this.discountIdCaptureEnabled) {
                console.log('Opening ID capture modal for:', discount.name);
                this.showIdCaptureModal(discount);
            } else {
                // Skip camera - apply discount directly
                this.activeDiscount = discount;
                this.discountIdPhoto = null;
                this.renderDiscountBar();
                if (requiresId && !this.discountIdCaptureEnabled) {
                    Toast.warning(`${discount?.name} discount active (ID capture disabled)`);
                } else {
                    Toast.info(`${discount?.name || 'Discount'} active`);
                }
            }
        }
    },
    
    // ========== ID CAPTURE FOR DISCOUNTS ==========
    
    showIdCaptureModal(discount) {
        // Initialize photos array for multiple ID capture
        this.capturedIdPhotos = [];
        
        Modal.open({
            title: `📸 Capture ${discount.name} ID`,
            width: '95vw',
            content: `
                <div class="id-capture-modal">
                    <div class="id-capture-instructions">
                        <p>📋 <strong>ID Required:</strong> Take a photo of the customer's ${discount.name} ID to apply discount.</p>
                        <p class="id-note">💡 You can capture multiple IDs if the customer has more than one.</p>
                    </div>
                    
                    <!-- Captured Photos Preview -->
                    <div class="captured-photos-list" id="capturedPhotosList" style="display:none;">
                        <h4>📸 Captured IDs (<span id="photosCount">0</span>)</h4>
                        <div class="photos-grid" id="photosGrid"></div>
                    </div>
                    
                    <div class="camera-container" id="cameraContainer">
                        <video id="cameraPreview" autoplay playsinline></video>
                        <canvas id="photoCanvas" style="display:none;"></canvas>
                    </div>
                    
                    <div class="camera-controls" id="cameraControls">
                        <button type="button" class="btn btn-primary btn-lg" id="captureBtn" onclick="POS.captureIdPhoto()">
                            📸 Take Photo
                        </button>
                    </div>
                    
                    <div class="photo-actions" id="photoActions" style="display:none;">
                        <button type="button" class="btn btn-secondary" onclick="POS.addAnotherPhoto()">
                            ➕ Add Another ID
                        </button>
                        <button type="button" class="btn btn-success btn-lg" onclick="POS.confirmIdPhotos('${discount.id}')">
                            ✅ Done - Apply Discount
                        </button>
                    </div>
                </div>
            `,
            customFooter: `
                <div style="text-align:center;padding:10px;">
                    <button class="btn btn-outline" onclick="POS.cancelIdCapture()">Cancel (No Discount)</button>
                </div>
            `,
            hideFooter: true,
            onClose: () => this.stopCamera()
        });
        
        // Start camera
        setTimeout(() => this.startCamera(), 100);
    },
    
    async startCamera() {
        try {
            const video = document.getElementById('cameraPreview');
            if (!video) return;
            
            // Try back camera first (for ID capture)
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = this.cameraStream;
            
        } catch (err) {
            console.error('Camera error:', err);
            Toast.error('Could not access camera. Check permissions.');
            
            // Show fallback - allow skipping
            const container = document.getElementById('cameraContainer');
            if (container) {
                container.innerHTML = `
                    <div class="camera-error">
                        <p>📵 Camera not available</p>
                        <p>Please ensure camera permissions are granted.</p>
                    </div>
                `;
            }
        }
    },
    
    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
    },
    
    captureIdPhoto() {
        const video = document.getElementById('cameraPreview');
        const canvas = document.getElementById('photoCanvas');
        
        if (!video || !canvas) return;
        
        // Set canvas size to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to data URL (compressed)
        const photoData = canvas.toDataURL('image/jpeg', 0.7);
        
        // Add to photos array
        this.capturedIdPhotos.push({
            photoData: photoData,
            capturedAt: new Date().toISOString()
        });
        
        // Update UI
        this.updatePhotosDisplay();
        
        Toast.success(`Photo ${this.capturedIdPhotos.length} captured!`);
    },
    
    updatePhotosDisplay() {
        const listContainer = document.getElementById('capturedPhotosList');
        const gridContainer = document.getElementById('photosGrid');
        const countEl = document.getElementById('photosCount');
        const cameraControls = document.getElementById('cameraControls');
        const photoActions = document.getElementById('photoActions');
        
        if (this.capturedIdPhotos.length > 0) {
            listContainer.style.display = 'block';
            countEl.textContent = this.capturedIdPhotos.length;
            
            // Show thumbnails
            gridContainer.innerHTML = this.capturedIdPhotos.map((photo, idx) => `
                <div class="photo-thumbnail">
                    <img src="${photo.photoData}" alt="ID ${idx + 1}">
                    <button type="button" class="remove-photo-btn" onclick="POS.removePhoto(${idx})">✕</button>
                    <span class="photo-num">${idx + 1}</span>
                </div>
            `).join('');
            
            // Show photo actions (add more / done)
            cameraControls.style.display = 'none';
            photoActions.style.display = 'flex';
        } else {
            listContainer.style.display = 'none';
            cameraControls.style.display = 'block';
            photoActions.style.display = 'none';
        }
    },
    
    removePhoto(index) {
        this.capturedIdPhotos.splice(index, 1);
        this.updatePhotosDisplay();
        Toast.info('Photo removed');
    },
    
    addAnotherPhoto() {
        // Show camera again for another photo
        document.getElementById('cameraControls').style.display = 'block';
        document.getElementById('photoActions').style.display = 'none';
    },
    
    confirmIdPhotos(discountId) {
        if (this.capturedIdPhotos.length === 0) {
            Toast.error('Please capture at least one ID photo');
            return;
        }
        
        const discount = this.discountPresets.find(d => d.id === discountId);
        
        // Store all photos for this transaction
        this.discountIdPhoto = {
            discountId: discountId,
            discountName: discount?.name || 'Unknown',
            photos: this.capturedIdPhotos,
            photoCount: this.capturedIdPhotos.length,
            capturedAt: new Date().toISOString()
        };
        
        this.activeDiscount = discount;
        
        this.stopCamera();
        Modal.close();
        
        this.renderDiscountBar();
        Toast.success(`${discount.name} discount applied with ${this.capturedIdPhotos.length} ID photo(s)`);
    },
    
    cancelIdCapture() {
        this.stopCamera();
        this.capturedIdPhotos = [];
        Modal.close();
        Toast.info('Discount cancelled - ID required');
    },
    
    clearActiveDiscount() {
        this.activeDiscount = null;
        this.discountIdPhoto = null;
        this.capturedIdPhotos = [];
        this.renderDiscountBar();
    },
    
    // ========== GCASH PAYMENT VERIFICATION ==========
    
    showGcashVerificationModal(total, totalDiscount) {
        this.gcashPaymentData = null;
        
        Modal.open({
            title: '📱 GCash Payment Verification',
            width: '95vw',
            content: `
                <div class="gcash-verification">
                    <div class="gcash-amount-display">
                        <span>Amount to Receive:</span>
                        <strong style="font-size: 1.5rem; color: #007bff;">₱${total.toLocaleString()}</strong>
                    </div>
                    
                    <div class="gcash-camera-section">
                        <p style="text-align: center; margin-bottom: 10px; color: #666;">
                            📸 Take a photo of the customer's GCash payment confirmation
                        </p>
                        <div class="camera-container" style="position: relative; background: #000; border-radius: 12px; overflow: hidden;">
                            <video id="gcashCameraPreview" autoplay playsinline style="width: 100%; display: block;"></video>
                            <canvas id="gcashPhotoCanvas" style="display: none;"></canvas>
                        </div>
                        
                        <div id="gcashCameraControls" class="camera-controls" style="text-align: center; margin-top: 12px;">
                            <button type="button" class="btn btn-primary btn-lg" onclick="POS.captureGcashPhoto()">
                                📸 Capture Photo
                            </button>
                        </div>
                        
                        <div id="gcashCapturedPhoto" style="display: none; margin-top: 12px;">
                            <img id="gcashPhotoPreview" style="width: 100%; border-radius: 8px; border: 3px solid #28a745;">
                            <div style="display: flex; gap: 10px; margin-top: 10px;">
                                <button type="button" class="btn btn-secondary" onclick="POS.retakeGcashPhoto()">🔄 Retake</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="gcash-details-form" style="margin-top: 16px;">
                        <div class="form-group">
                            <label>📋 Reference Number *</label>
                            <input type="text" id="gcashRefNo" class="form-input" placeholder="e.g., 3036128587755" required
                                   style="font-size: 1.1rem; letter-spacing: 1px;">
                        </div>
                        <div class="form-group">
                            <label>📱 Customer Mobile (optional)</label>
                            <input type="tel" id="gcashCustomerMobile" class="form-input" placeholder="e.g., 09602965868">
                            <small style="color: #666;">For sending thank you message</small>
                        </div>
                        <div class="form-group">
                            <label>👤 Sender Name (from screen)</label>
                            <input type="text" id="gcashSenderName" class="form-input" placeholder="e.g., JE****O B.">
                        </div>
                    </div>
                </div>
            `,
            customFooter: `
                <div style="display: flex; gap: 10px; padding: 15px;">
                    <button class="btn btn-secondary btn-lg" style="flex: 1;" onclick="POS.cancelGcashVerification()">Cancel</button>
                    <button class="btn btn-success btn-lg" style="flex: 2;" onclick="POS.confirmGcashPayment(${total}, ${totalDiscount})">
                        ✅ Confirm Payment
                    </button>
                </div>
            `,
            hideFooter: true
        });
        
        // Start camera
        setTimeout(() => this.startGcashCamera(), 200);
    },
    
    async startGcashCamera() {
        try {
            const video = document.getElementById('gcashCameraPreview');
            if (!video) return;
            
            this.gcashPhotoStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            
            video.srcObject = this.gcashPhotoStream;
        } catch (error) {
            console.error('Camera error:', error);
            Toast.error('Could not access camera');
        }
    },
    
    stopGcashCamera() {
        if (this.gcashPhotoStream) {
            this.gcashPhotoStream.getTracks().forEach(track => track.stop());
            this.gcashPhotoStream = null;
        }
    },
    
    captureGcashPhoto() {
        const video = document.getElementById('gcashCameraPreview');
        const canvas = document.getElementById('gcashPhotoCanvas');
        const preview = document.getElementById('gcashPhotoPreview');
        const capturedDiv = document.getElementById('gcashCapturedPhoto');
        const controlsDiv = document.getElementById('gcashCameraControls');
        
        if (!video || !canvas) return;
        
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to data URL
        const photoData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Store temporarily
        this.gcashCapturedPhoto = photoData;
        
        // Show preview
        preview.src = photoData;
        capturedDiv.style.display = 'block';
        video.style.display = 'none';
        controlsDiv.style.display = 'none';
        
        // Stop camera to save battery
        this.stopGcashCamera();
        
        Toast.success('Photo captured!');
    },
    
    retakeGcashPhoto() {
        const video = document.getElementById('gcashCameraPreview');
        const capturedDiv = document.getElementById('gcashCapturedPhoto');
        const controlsDiv = document.getElementById('gcashCameraControls');
        
        this.gcashCapturedPhoto = null;
        capturedDiv.style.display = 'none';
        video.style.display = 'block';
        controlsDiv.style.display = 'block';
        
        // Restart camera
        this.startGcashCamera();
    },
    
    confirmGcashPayment(total, totalDiscount) {
        const refNo = document.getElementById('gcashRefNo')?.value?.trim();
        const customerMobile = document.getElementById('gcashCustomerMobile')?.value?.trim();
        const senderName = document.getElementById('gcashSenderName')?.value?.trim();
        
        // Validate
        if (!this.gcashCapturedPhoto) {
            Toast.error('Please capture a photo of the payment');
            return;
        }
        
        if (!refNo) {
            Toast.error('Please enter the reference number');
            document.getElementById('gcashRefNo')?.focus();
            return;
        }
        
        // Store GCash payment data
        this.gcashPaymentData = {
            photoData: this.gcashCapturedPhoto,
            refNo: refNo,
            amount: total,
            customerMobile: customerMobile || null,
            senderName: senderName || null,
            verifiedAt: new Date().toISOString()
        };
        
        this.stopGcashCamera();
        Modal.close();
        
        Toast.success('GCash payment verified!');
        
        // Reopen checkout modal with GCash already verified
        setTimeout(() => {
            this.showCheckoutModal();
        }, 150);
    },
    
    cancelGcashVerification() {
        this.stopGcashCamera();
        this.gcashCapturedPhoto = null;
        this.gcashPaymentData = null;
        Modal.close();
        this.updateGcashVerificationDisplay();
        Toast.info('GCash verification cancelled - you can try again or switch to Cash');
    },
    
    clearGcashVerification(total, totalDiscount) {
        this.gcashPaymentData = null;
        this.gcashCapturedPhoto = null;
        this.updateGcashVerificationDisplay();
        // Re-open verification modal
        setTimeout(() => this.showGcashVerificationModal(total, totalDiscount), 100);
    },
    
    updateGcashVerificationDisplay() {
        const notVerifiedDiv = document.getElementById('gcashNotVerified');
        const verifiedDiv = document.getElementById('gcashVerified');
        const refDisplay = document.getElementById('gcashRefDisplay');
        
        if (!notVerifiedDiv || !verifiedDiv) return;
        
        if (this.gcashPaymentData) {
            notVerifiedDiv.style.display = 'none';
            verifiedDiv.style.display = 'block';
            if (refDisplay) refDisplay.textContent = this.gcashPaymentData.refNo;
        } else {
            notVerifiedDiv.style.display = 'block';
            verifiedDiv.style.display = 'none';
        }
    },

    showCustomDiscount() {
        Modal.open({
            title: '✏️ Custom Discount',
            content: `
                <div class="form-group">
                    <label>Discount Name</label>
                    <input type="text" id="customDiscountName" class="form-input" placeholder="e.g., Birthday Special">
                </div>
                <div class="form-group">
                    <label>Discount Percentage</label>
                    <input type="number" id="customDiscountPercent" class="form-input" value="10" min="1" max="100">
                </div>
            `,
            saveText: 'Apply',
            onSave: () => {
                const name = document.getElementById('customDiscountName').value || 'Custom';
                const percent = parseInt(document.getElementById('customDiscountPercent').value) || 10;
                this.activeDiscount = { id: 'custom', name, percent, icon: '🏷️' };
                this.renderDiscountBar();
                Toast.success(`${name} (${percent}%) discount active`);
            }
        });
    },

    // ========== CATEGORY TABS ==========
    
    renderCategories() {
        const container = document.getElementById('categoryTabs');
        if (!container) return;
        
        // Bread sub-categories
        const breadCats = [
            { value: 'donut', label: 'Donuts', emoji: '🍩' },
            { value: 'savory', label: 'Savory', emoji: '🥐' },
            { value: 'cinnamon-rolls', label: 'Cinnamon', emoji: '🥮' },
            { value: 'classic-filipino', label: 'Classic', emoji: '🥖' },
            { value: 'pandesal', label: 'Pandesal', emoji: '🥯' },
            { value: 'cookies', label: 'Cookies', emoji: '🍪' }
        ];
        
        // Drink sub-categories
        const drinkCats = [
            { value: 'coffee', label: 'Coffee', emoji: '☕' },
            { value: 'non-coffee', label: 'Non-Coffee', emoji: '🧃' }
        ];
        
        // Add-on sub-categories
        const addonCats = [
            { value: 'box', label: 'Boxes', emoji: '📦' },
            { value: 'creamer', label: 'Creamers', emoji: '🥛' },
            { value: 'sugar', label: 'Sugar', emoji: '🍬' },
            { value: 'extras', label: 'Extras', emoji: '➕' }
        ];
        
        // Select which categories to show based on main category filter
        let catsToShow = [];
        if (this.currentMainCategory === 'breads') {
            catsToShow = breadCats;
        } else if (this.currentMainCategory === 'drinks') {
            catsToShow = drinkCats;
        } else if (this.currentMainCategory === 'addons') {
            catsToShow = addonCats;
        } else {
            catsToShow = [...breadCats, ...drinkCats]; // All (excluding addons from default view)
        }
        
        let html = '<button class="category-tab active" data-category="all" onclick="POS.filterByCategory(\'all\')">All</button>';
        
        catsToShow.forEach(cat => {
            if (this.categories.includes(cat.value)) {
                html += `<button class="category-tab" data-category="${cat.value}" 
                         onclick="POS.filterByCategory('${cat.value}')">${cat.emoji} ${cat.label}</button>`;
            }
        });
        
        container.innerHTML = html;
    },
    
    // ========== MAIN CATEGORY FILTER (Breads vs Drinks) ==========
    
    filterByMainCategory(mainCat) {
        this.currentMainCategory = mainCat;
        this.currentCategory = 'all'; // Reset sub-category
        
        // Update button states
        document.querySelectorAll('.main-cat-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.main === mainCat);
        });
        
        // Update sub-category tabs based on main category
        this.renderCategories();
        this.renderProducts();
    },
    
    filterByCategory(category) {
        this.currentCategory = category;
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === category);
        });
        this.renderProducts();
    },
    
    filterProducts() {
        this.renderProducts();
    },
    
    // ========== PRODUCT GRID ==========
    
    renderProducts() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        
        const search = document.getElementById('productSearch')?.value.toLowerCase() || '';
        
        let filtered = this.products.filter(p => {
            // Main category filter (breads vs drinks vs addons)
            if (this.currentMainCategory !== 'all') {
                const category = (p.category || '').toLowerCase();
                const mainCat = (p.mainCategory || '').toLowerCase();
                
                // Drinks categories
                const drinkCategories = ['coffee', 'non-coffee', 'drinks', 'beverages'];
                const isDrink = mainCat === 'drinks' || drinkCategories.some(c => category.includes(c));
                
                // Add-on categories
                const addonCategories = ['box', 'creamer', 'sugar', 'extras', 'addon', 'add-on', 'addons', 'add-ons'];
                const isAddon = mainCat === 'addons' || mainCat === 'add-ons' || addonCategories.some(c => category.includes(c));
                
                if (this.currentMainCategory === 'drinks' && !isDrink) return false;
                if (this.currentMainCategory === 'breads' && (isDrink || isAddon)) return false;
                if (this.currentMainCategory === 'addons' && !isAddon) return false;
                
                // Exclude addons from 'all' view by default (only show breads & drinks)
                // Uncomment next line if you want addons hidden from 'All' view
                // if (this.currentMainCategory === 'all' && isAddon) return false;
            }
            
            // Sub-category filter
            if (this.currentCategory !== 'all' && p.category !== this.currentCategory) return false;
            
            // Search filter
            if (search && !p.name.toLowerCase().includes(search)) return false;
            return true;
        });
        
        if (filtered.length === 0) {
            grid.innerHTML = '<p class="empty-state">No products found</p>';
            return;
        }
        
        grid.innerHTML = filtered.map(p => {
            const price = p.hasVariants && p.variants?.length > 0 
                ? p.variants[0].price 
                : (p.finalSRP || 0);
            
            const priceDisplay = p.hasVariants && p.variants?.length > 1
                ? `₱${Math.min(...p.variants.map(v => v.price))} - ₱${Math.max(...p.variants.map(v => v.price))}`
                : Utils.formatCurrency(price);
            
            // Get stock status
            let stockBadge = '';
            let cardClass = 'product-card';
            let isBlocked = false;
            if (typeof StockManager !== 'undefined') {
                const stockStatus = StockManager.getStockStatusText(p.id);
                if (stockStatus.class === 'stock-out') {
                    stockBadge = `<div class="stock-badge sold-out">SOLD OUT</div>`;
                    cardClass += ' out-of-stock blocked';
                    isBlocked = true;
                } else if (stockStatus.class === 'stock-none') {
                    stockBadge = `<div class="stock-badge no-record">NO STOCK</div>`;
                    cardClass += ' no-stock-record blocked';
                    isBlocked = true;
                } else if (stockStatus.class === 'stock-low') {
                    stockBadge = `<div class="stock-badge low-stock">${stockStatus.qty} left</div>`;
                } else if (stockStatus.class === 'stock-ok') {
                    stockBadge = `<div class="stock-badge in-stock">${stockStatus.qty}</div>`;
                } else {
                    stockBadge = `<div class="stock-badge no-record">NO STOCK</div>`;
                    cardClass += ' no-stock-record blocked';
                    isBlocked = true;
                }
            }
            
            return `
                <div class="${cardClass}" onclick="${isBlocked ? 'POS.showBlockedMessage()' : `POS.addToCart('${p.id}')`}">
                    <div class="product-image">
                        ${p.shop?.imageUrl 
                            ? `<img src="${p.shop.imageUrl}" alt="${p.name}">` 
                            : '<span class="no-image">🍞</span>'}
                        ${stockBadge}
                    </div>
                    <div class="product-info">
                        <div class="product-name">${p.name}</div>
                        <div class="product-price">${priceDisplay}</div>
                        ${p.hasVariants ? '<div class="product-variants">Has variants</div>' : ''}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Show message when clicking blocked (out of stock) product
    showBlockedMessage() {
        Toast.error('❌ Cannot sell - no stock available');
    },
    
    // ========== CART MANAGEMENT ==========
    
    addToCart(productId, variantIndex = null) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        // If product has variants and no variant specified, show selector
        if (product.hasVariants && product.variants?.length > 0 && variantIndex === null) {
            this.showVariantSelector(product);
            return;
        }
        
        // Check stock before adding
        if (typeof StockManager !== 'undefined') {
            const currentCartQty = this.cart
                .filter(item => item.productId === productId)
                .reduce((sum, item) => sum + item.quantity, 0);
            
            const stockCheck = StockManager.canAddToCart(productId, 1, currentCartQty);
            
            if (!stockCheck.allowed) {
                Toast.error(stockCheck.warning || 'Out of stock');
                return;
            }
            
            if (stockCheck.warning && stockCheck.available !== null) {
                Toast.warning(stockCheck.warning);
            }
        }
        
        // Get price
        let price, variantName = null;
        if (product.hasVariants && variantIndex !== null && product.variants[variantIndex]) {
            price = product.variants[variantIndex].price;
            variantName = product.variants[variantIndex].name;
        } else {
            price = product.finalSRP || 0;
        }
        
        // Check if already in cart (same product + variant + discount status)
        const discountId = this.activeDiscount?.id || null;
        const existingIndex = this.cart.findIndex(item => 
            item.productId === productId && 
            item.variantIndex === variantIndex &&
            item.discountId === discountId
        );
        
        if (existingIndex >= 0) {
            this.cart[existingIndex].quantity++;
        } else {
            // Apply active discount to new item
            const discountPercent = this.activeDiscount?.percent || 0;
            const discountAmount = price * (discountPercent / 100);
            const finalPrice = price - discountAmount;
            
            this.cart.push({
                productId,
                productName: product.name,
                category: product.category,
                mainCategory: product.mainCategory,
                variantIndex,
                variantName,
                originalPrice: price,
                discountId: discountId,
                discountName: this.activeDiscount?.name || null,
                discountPercent: discountPercent,
                discountAmount: discountAmount,
                price: finalPrice,
                quantity: 1
            });
        }
        
        this.renderCart();
        const discountText = this.activeDiscount ? ` (${this.activeDiscount.percent}% off)` : '';
        Toast.success(`Added ${product.name}${variantName ? ` (${variantName})` : ''}${discountText}`);
    },
    
    showVariantSelector(product) {
        Modal.open({
            title: `Select Size: ${product.name}`,
            content: `
                <div class="variant-selector">
                    ${product.variants.map((v, idx) => `
                        <button class="variant-option" onclick="POS.addToCart('${product.id}', ${idx}); Modal.close();">
                            <span class="variant-name">${v.name}</span>
                            <span class="variant-price">${Utils.formatCurrency(v.price)}</span>
                            ${this.activeDiscount ? `<span class="variant-discount">-${this.activeDiscount.percent}%</span>` : ''}
                        </button>
                    `).join('')}
                </div>
            `,
            showFooter: false
        });
    },

    updateQuantity(index, change) {
        if (index < 0 || index >= this.cart.length) return;
        
        this.cart[index].quantity += change;
        if (this.cart[index].quantity <= 0) {
            this.cart.splice(index, 1);
        }
        
        this.renderCart();
    },
    
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
    },
    
    // Toggle discount on/off for specific cart item
    toggleItemDiscount(index) {
        const item = this.cart[index];
        if (!item) return;
        
        if (item.discountId) {
            // Remove discount
            item.price = item.originalPrice;
            item.discountId = null;
            item.discountName = null;
            item.discountPercent = 0;
            item.discountAmount = 0;
            Toast.info(`Discount removed from ${item.productName}`);
        } else if (this.activeDiscount) {
            // Apply active discount
            item.discountId = this.activeDiscount.id;
            item.discountName = this.activeDiscount.name;
            item.discountPercent = this.activeDiscount.percent;
            item.discountAmount = item.originalPrice * (this.activeDiscount.percent / 100);
            item.price = item.originalPrice - item.discountAmount;
            Toast.success(`${this.activeDiscount.name} applied to ${item.productName}`);
        } else {
            Toast.warning('Select a discount first from the discount bar');
            return;
        }
        
        this.renderCart();
    },
    
    // Apply active discount to all items
    applyDiscountToAll() {
        if (!this.activeDiscount) {
            Toast.warning('Select a discount first');
            return;
        }
        
        let applied = 0;
        this.cart.forEach(item => {
            if (!item.discountId) {
                item.discountId = this.activeDiscount.id;
                item.discountName = this.activeDiscount.name;
                item.discountPercent = this.activeDiscount.percent;
                item.discountAmount = item.originalPrice * (this.activeDiscount.percent / 100);
                item.price = item.originalPrice - item.discountAmount;
                applied++;
            }
        });
        
        this.renderCart();
        Toast.success(`${this.activeDiscount.name} applied to ${applied} items`);
    },
    
    // Remove discount from all items
    removeAllDiscounts() {
        this.cart.forEach(item => {
            item.price = item.originalPrice;
            item.discountId = null;
            item.discountName = null;
            item.discountPercent = 0;
            item.discountAmount = 0;
        });
        
        this.renderCart();
        Toast.info('All discounts removed');
    },
    
    clearCart() {
        if (this.cart.length === 0) return;
        if (!confirm('Clear all items from cart?')) return;
        
        this.cart = [];
        this.renderCart();
    },
    
    renderCart() {
        const container = document.getElementById('cartItems');
        const subtotalEl = document.getElementById('cartSubtotal');
        const discountRow = document.getElementById('discountRow');
        const discountEl = document.getElementById('cartDiscount');
        const totalEl = document.getElementById('cartTotal');
        const clearBtn = document.getElementById('clearCartBtn');
        const checkoutBtn = document.getElementById('checkoutBtn');
        
        if (this.cart.length === 0) {
            container.innerHTML = '<p class="empty-state">No items in cart</p>';
            subtotalEl.textContent = '₱0.00';
            totalEl.textContent = '₱0.00';
            discountRow.style.display = 'none';
            clearBtn.disabled = true;
            checkoutBtn.disabled = true;
            return;
        }
        
        // Render items with per-item discount toggle
        container.innerHTML = this.cart.map((item, idx) => `
            <div class="cart-item ${item.discountId ? 'has-discount' : ''}">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.productName}</div>
                    ${item.variantName ? `<div class="cart-item-variant">${item.variantName}</div>` : ''}
                    <div class="cart-item-price">
                        ${item.discountId 
                            ? `<span class="original-price">${Utils.formatCurrency(item.originalPrice)}</span> 
                               <span class="discounted-price">${Utils.formatCurrency(item.price)}</span>`
                            : Utils.formatCurrency(item.price)
                        }
                    </div>
                    ${item.discountName 
                        ? `<div class="cart-item-discount-badge">${item.discountName} -${item.discountPercent}%</div>` 
                        : ''
                    }
                </div>
                <div class="cart-item-actions">
                    <button class="discount-item-toggle ${item.discountId ? 'active' : ''}" 
                            onclick="POS.toggleItemDiscount(${idx})" 
                            title="${item.discountId ? 'Remove discount' : 'Apply discount'}">
                        🏷️
                    </button>
                </div>
                <div class="cart-item-qty">
                    <button class="qty-btn" onclick="POS.updateQuantity(${idx}, -1)">−</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" onclick="POS.updateQuantity(${idx}, 1)">+</button>
                </div>
                <div class="cart-item-total">
                    ${Utils.formatCurrency(item.price * item.quantity)}
                </div>
                <button class="cart-item-remove" onclick="POS.removeFromCart(${idx})">×</button>
            </div>
        `).join('');
        
        // Calculate totals
        const originalSubtotal = this.cart.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
        const totalDiscount = this.cart.reduce((sum, item) => sum + (item.discountAmount * item.quantity), 0);
        const finalTotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        subtotalEl.textContent = Utils.formatCurrency(originalSubtotal);
        
        if (totalDiscount > 0) {
            discountRow.style.display = 'flex';
            discountEl.textContent = `-${Utils.formatCurrency(totalDiscount)}`;
        } else {
            discountRow.style.display = 'none';
        }
        
        totalEl.textContent = Utils.formatCurrency(finalTotal);
        
        clearBtn.disabled = false;
        checkoutBtn.disabled = false;
    },

    // ========== CHECKOUT ==========
    
    showCheckoutModal() {
        if (this.cart.length === 0) return;
        
        // Block checkout in view-only mode
        if (Auth.currentShift?.isViewOnly) {
            Toast.warning('View-only mode. Start a shift to process sales.');
            return;
        }
        
        const originalSubtotal = this.cart.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
        const totalDiscount = this.cart.reduce((sum, item) => sum + (item.discountAmount * item.quantity), 0);
        const total = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Store totals for GCash verification modal (before building HTML)
        this.checkoutTotal = total;
        this.checkoutTotalDiscount = totalDiscount;
        
        // Group discounts by type
        const discountsByType = {};
        this.cart.forEach(item => {
            if (item.discountId) {
                if (!discountsByType[item.discountId]) {
                    discountsByType[item.discountId] = {
                        name: item.discountName,
                        percent: item.discountPercent,
                        amount: 0
                    };
                }
                discountsByType[item.discountId].amount += item.discountAmount * item.quantity;
            }
        });
        
        Modal.open({
            title: '💳 Checkout',
            content: `
                <div class="checkout-summary">
                    <div class="checkout-items">
                        ${this.cart.map(item => `
                            <div class="checkout-item ${item.discountId ? 'has-discount' : ''}">
                                <span>
                                    ${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}
                                    ${item.discountName ? `<small class="discount-tag">-${item.discountPercent}%</small>` : ''}
                                </span>
                                <span>${Utils.formatCurrency(item.price * item.quantity)}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="checkout-totals">
                        <div class="checkout-row">
                            <span>Subtotal</span>
                            <span>${Utils.formatCurrency(originalSubtotal)}</span>
                        </div>
                        ${Object.entries(discountsByType).map(([id, d]) => `
                            <div class="checkout-row discount">
                                <span>${d.name} (${d.percent}%)</span>
                                <span>-${Utils.formatCurrency(d.amount)}</span>
                            </div>
                        `).join('')}
                        ${totalDiscount > 0 ? `
                            <div class="checkout-row discount total-discount">
                                <span>Total Savings</span>
                                <span>-${Utils.formatCurrency(totalDiscount)}</span>
                            </div>
                        ` : ''}
                        <div class="checkout-row total">
                            <span>TOTAL</span>
                            <span>${Utils.formatCurrency(total)}</span>
                        </div>
                    </div>
                </div>
                
                <form id="checkoutForm" onsubmit="return false;">
                    <div class="form-group">
                        <label>Payment Method</label>
                        <div class="payment-methods">
                            <label class="payment-option">
                                <input type="radio" name="paymentMethod" value="cash" ${!this.gcashPaymentData ? 'checked' : ''}>
                                <span>💵 Cash</span>
                            </label>
                            <label class="payment-option">
                                <input type="radio" name="paymentMethod" value="gcash" ${this.gcashPaymentData ? 'checked' : ''}>
                                <span>📱 GCash</span>
                            </label>
                            <label class="payment-option">
                                <input type="radio" name="paymentMethod" value="card">
                                <span>💳 Card</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="form-group" id="cashReceivedGroup" style="${this.gcashPaymentData ? 'display:none;' : ''}">
                        <label>Cash Received</label>
                        <input type="number" name="cashReceived" id="cashReceived" 
                               class="form-input" value="${Math.ceil(total / 10) * 10}" min="${total}" step="1"
                               inputmode="numeric"
                               oninput="POS.updateChange(${total})"
                               onkeydown="if(event.key==='Enter'){event.preventDefault(); return false;}">
                        <div class="quick-cash">
                            ${[50, 100, 200, 500, 1000].filter(v => v >= total).slice(0, 4).map(v => 
                                `<button type="button" class="quick-cash-btn" onclick="document.getElementById('cashReceived').value=${v}; POS.updateChange(${total})">${Utils.formatCurrency(v)}</button>`
                            ).join('')}
                        </div>
                    </div>
                    
                    <!-- GCash Verification Status -->
                    <div id="gcashVerificationGroup" style="display: ${this.gcashPaymentData ? 'block' : 'none'};">
                        <div id="gcashNotVerified" class="gcash-status not-verified" style="display: ${this.gcashPaymentData ? 'none' : 'block'}; padding: 15px; background: #FFF3E0; border-radius: 8px; text-align: center;">
                            <p style="margin: 0 0 10px; color: #E65100;">📱 GCash payment requires verification</p>
                            <button type="button" class="btn btn-primary" onclick="POS.showGcashVerificationModal(POS.checkoutTotal, POS.checkoutTotalDiscount)">
                                📸 Verify GCash Payment
                            </button>
                        </div>
                        <div id="gcashVerified" class="gcash-status verified" style="display: ${this.gcashPaymentData ? 'block' : 'none'}; padding: 15px; background: #E8F5E9; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 2rem;">✅</span>
                                <div style="flex: 1;">
                                    <strong style="color: #2E7D32;">GCash Payment Verified!</strong>
                                    <div style="font-size: 0.85rem; color: #666;">
                                        Ref: <span id="gcashRefDisplay">${this.gcashPaymentData?.refNo || '-'}</span>
                                    </div>
                                </div>
                                <button type="button" class="btn btn-secondary btn-sm" onclick="POS.clearGcashVerification(POS.checkoutTotal, POS.checkoutTotalDiscount)">
                                    Change
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="change-display" id="changeDisplay" style="display: ${this.gcashPaymentData ? 'none' : 'block'};">
                        Change: <strong>${Utils.formatCurrency(Math.ceil(total / 10) * 10 - total)}</strong>
                    </div>
                </form>
            `,
            saveText: '✅ Complete Sale',
            onSave: () => this.completeSale(total, totalDiscount)
        });
        
        // Add payment method change listener - trigger GCash verification immediately
        setTimeout(() => {
            document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const cashGroup = document.getElementById('cashReceivedGroup');
                    const changeDisplay = document.getElementById('changeDisplay');
                    const gcashGroup = document.getElementById('gcashVerificationGroup');
                    
                    if (e.target.value === 'cash') {
                        cashGroup.style.display = 'block';
                        changeDisplay.style.display = 'block';
                        gcashGroup.style.display = 'none';
                    } else if (e.target.value === 'gcash') {
                        cashGroup.style.display = 'none';
                        changeDisplay.style.display = 'none';
                        
                        // Only show GCash verification if capture is ENABLED
                        if (POS.gcashCaptureEnabled) {
                            gcashGroup.style.display = 'block';
                            // IMMEDIATELY open camera if not yet verified
                            if (!POS.gcashPaymentData) {
                                POS.showGcashVerificationModal(POS.checkoutTotal, POS.checkoutTotalDiscount);
                            }
                        } else {
                            gcashGroup.style.display = 'none';
                        }
                    } else {
                        // Card or other
                        cashGroup.style.display = 'none';
                        changeDisplay.style.display = 'none';
                        gcashGroup.style.display = 'none';
                    }
                });
            });
        }, 100);
    },
    
    updateChange(total) {
        const cashReceived = parseFloat(document.getElementById('cashReceived')?.value) || 0;
        const change = Math.max(0, cashReceived - total);
        document.getElementById('changeDisplay').innerHTML = `Change: <strong>${Utils.formatCurrency(change)}</strong>`;
    },

    async completeSale(total, totalDiscount) {
        const form = document.getElementById('checkoutForm');
        const formData = new FormData(form);
        const paymentMethod = formData.get('paymentMethod') || 'cash';
        const cashReceived = parseFloat(formData.get('cashReceived')) || total;
        
        if (paymentMethod === 'cash' && cashReceived < total) {
            Toast.error('Cash received is less than total');
            return false;
        }
        
        // GCash payment requires photo verification (if enabled)
        if (paymentMethod === 'gcash' && !this.gcashPaymentData && this.gcashCaptureEnabled) {
            this.showGcashVerificationModal(total, totalDiscount);
            return false;
        }
        
        try {
            const today = Utils.getTodayKey();
            const saleNum = await DB.getNextSaleNumber();
            const saleId = `S-${today.replace(/-/g, '')}-${String(saleNum).padStart(3, '0')}`;
            
            const originalSubtotal = this.cart.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
            
            // Recalculate discounts by type for the record
            const discountsByType = {};
            this.cart.forEach(item => {
                if (item.discountId) {
                    if (!discountsByType[item.discountId]) {
                        discountsByType[item.discountId] = {
                            name: item.discountName,
                            percent: item.discountPercent,
                            amount: 0
                        };
                    }
                    discountsByType[item.discountId].amount += item.discountAmount * item.quantity;
                }
            });
            
            // Build sale record with per-item discounts
            const saleRecord = {
                saleId,
                dateKey: today,
                timestamp: new Date().toISOString(),
                
                // Link to shift
                shiftId: Auth.getShiftId(),
                shiftNumber: Auth.currentShift?.shiftNumber || null,
                cashierId: Auth.userData?.id || 'unknown',
                cashierName: Auth.userData?.name || 'Unknown',
                
                items: this.cart.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    category: item.category,
                    mainCategory: item.mainCategory,
                    variantIndex: item.variantIndex,
                    variantName: item.variantName,
                    quantity: item.quantity,
                    originalPrice: item.originalPrice,
                    discountId: item.discountId,
                    discountName: item.discountName,
                    discountPercent: item.discountPercent,
                    discountAmount: item.discountAmount,
                    unitPrice: item.price,
                    lineTotal: item.price * item.quantity
                })),
                
                subtotal: originalSubtotal,
                totalDiscount,
                total,
                
                // Discount tracking
                discountInfo: totalDiscount > 0 ? {
                    hasDiscount: true,
                    discountTypes: Object.keys(discountsByType),
                    details: discountsByType,
                    idPhoto: this.discountIdPhoto || null
                } : null,
                
                paymentMethod,
                cashReceived: paymentMethod === 'cash' ? cashReceived : null,
                change: paymentMethod === 'cash' ? cashReceived - total : null,
                
                // GCash payment verification data
                gcashPayment: paymentMethod === 'gcash' ? this.gcashPaymentData : null,
                
                source: 'pos',
                createdBy: Auth.userData?.id || 'unknown',
                createdByName: Auth.userData?.name || 'Unknown'
            };
            
            // Debug log for GCash
            if (paymentMethod === 'gcash') {
                console.log('GCash payment data being saved:', this.gcashPaymentData);
                console.log('Sale record gcashPayment:', saleRecord.gcashPayment);
            }
            
            await DB.add('sales', saleRecord);
            
            // Deduct product stock (dailyInventory)
            if (typeof StockManager !== 'undefined') {
                const stockItems = this.cart.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity
                }));
                StockManager.deductStock(stockItems, saleId)
                    .then(results => {
                        const failed = results.filter(r => !r.success);
                        if (failed.length > 0) {
                            console.warn('Stock deduction issues:', failed);
                        }
                    })
                    .catch(err => console.error('Stock deduction failed:', err));
            }
            
            // Deduct ingredient inventory (async, don't block sale)
            if (typeof InventoryDeduction !== 'undefined') {
                InventoryDeduction.deductForSale(saleRecord)
                    .then(result => {
                        if (!result.success) {
                            console.warn('Inventory deduction had errors:', result.errors);
                        }
                    })
                    .catch(err => console.error('Inventory deduction failed:', err));
            }
            
            Toast.success(`Sale ${saleId} completed!`);
            
            // Clear cart AND discount (important: prevent accidental reuse)
            this.cart = [];
            this.activeDiscount = null;
            this.discountIdPhoto = null;
            this.capturedIdPhotos = [];
            this.gcashPaymentData = null;  // Clear GCash data
            this.renderCart();
            this.renderDiscountBar();
            
            // Auto-print receipt if enabled
            await ReceiptPrinter.autoPrint(saleRecord);
            
            // Show receipt with print option
            this.showReceiptModal(saleRecord);
            
        } catch (error) {
            console.error('Error completing sale:', error);
            Toast.error('Failed to complete sale');
            return false;
        }
    },
    
    showReceiptModal(sale) {
        // Store sale for printing
        this.lastSale = sale;
        
        Modal.open({
            title: '🧾 Sale Complete',
            content: `
                <div class="receipt-preview">
                    <div class="receipt-header">
                        <h3>${CONFIG.pos.receiptHeader}</h3>
                        <p>${sale.saleId}</p>
                        <p>${new Date(sale.timestamp).toLocaleString('en-PH')}</p>
                    </div>
                    
                    <div class="receipt-items">
                        ${sale.items.map(item => `
                            <div class="receipt-item">
                                <span>
                                    ${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}
                                    ${item.discountName ? ` [${item.discountName}]` : ''}
                                </span>
                                <span>${Utils.formatCurrency(item.lineTotal)}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="receipt-totals">
                        ${sale.totalDiscount > 0 ? `
                            <div class="receipt-row">
                                <span>Subtotal</span>
                                <span>${Utils.formatCurrency(sale.subtotal)}</span>
                            </div>
                            <div class="receipt-row discount">
                                <span>Total Discount</span>
                                <span>-${Utils.formatCurrency(sale.totalDiscount)}</span>
                            </div>
                        ` : ''}
                        <div class="receipt-row total">
                            <span>TOTAL</span>
                            <span>${Utils.formatCurrency(sale.total)}</span>
                        </div>
                        ${sale.paymentMethod === 'cash' ? `
                            <div class="receipt-row">
                                <span>Cash</span>
                                <span>${Utils.formatCurrency(sale.cashReceived)}</span>
                            </div>
                            <div class="receipt-row">
                                <span>Change</span>
                                <span>${Utils.formatCurrency(sale.change)}</span>
                            </div>
                        ` : `
                            <div class="receipt-row">
                                <span>Payment</span>
                                <span>${sale.paymentMethod.toUpperCase()}</span>
                            </div>
                        `}
                    </div>
                    
                    ${sale.gcashPayment ? `
                        <div class="gcash-confirmation" style="margin-top: 12px; padding: 10px; background: #E8F5E9; border-radius: 8px; border-left: 4px solid #4CAF50;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-size: 1.2rem;">✅</span>
                                <strong style="color: #2E7D32;">GCash Verified</strong>
                            </div>
                            <div style="font-size: 0.85rem; color: #666;">
                                <div>Ref: <strong>${sale.gcashPayment.refNo}</strong></div>
                                ${sale.gcashPayment.customerMobile ? `<div>Mobile: ${sale.gcashPayment.customerMobile}</div>` : ''}
                            </div>
                            ${sale.gcashPayment.photoData ? `
                                <img src="${sale.gcashPayment.photoData}" alt="GCash Screenshot" 
                                     style="margin-top: 8px; max-width: 120px; border-radius: 6px; border: 2px solid #4CAF50; cursor: pointer;"
                                     onclick="window.open(this.src, '_blank')">
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="receipt-footer">
                        <p>${CONFIG.pos.receiptFooter}</p>
                    </div>
                </div>
                
                <div class="receipt-actions" style="display:flex;gap:10px;margin-top:15px;">
                    <button class="btn btn-secondary" onclick="POS.printReceipt()" style="flex:1;">
                        🖨️ Print Receipt
                    </button>
                </div>
            `,
            saveText: 'New Sale',
            showFooter: true,
            onSave: () => true
        });
    },
    
    // Print the last sale receipt
    printReceipt() {
        if (!this.lastSale) {
            Toast.error('No sale to print');
            return;
        }
        
        if (typeof ReceiptPrinter !== 'undefined') {
            ReceiptPrinter.printReceipt(this.lastSale);
        } else {
            Toast.error('Printer module not loaded');
        }
    },
    
    // ========== TRANSACTION HISTORY ==========
    
    async showTransactionHistory() {
        Toast.info('Loading transactions...');
        
        try {
            // Get today's sales for current shift - FRESH from server
            const shiftId = Auth.getShiftId();
            const today = Utils.getTodayKey();
            
            let sales = [];
            if (shiftId && shiftId !== 'admin') {
                // Get sales for this shift - fresh
                sales = await DB.queryFresh('sales', 'shiftId', '==', shiftId);
            } else {
                // Admin - get today's sales - fresh
                sales = await DB.queryFresh('sales', 'dateKey', '==', today);
            }
            
            console.log(`Transaction history: Found ${sales.length} sales for shift ${shiftId}`);
            
            // Sort by timestamp descending (newest first)
            sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Calculate totals
            const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
            const totalTransactions = sales.length;
            
            Modal.open({
                title: '📋 Transaction History',
                width: '95vw',
                content: `
                    <div class="transaction-history">
                        <div class="history-summary">
                            <div class="summary-stat">
                                <span class="stat-value">${totalTransactions}</span>
                                <span class="stat-label">Transactions</span>
                            </div>
                            <div class="summary-stat">
                                <span class="stat-value">${Utils.formatCurrency(totalSales)}</span>
                                <span class="stat-label">Total Sales</span>
                            </div>
                        </div>
                        
                        <div class="transaction-list">
                            ${sales.length === 0 ? `
                                <div class="empty-transactions">
                                    <p>📭 No transactions yet for this shift</p>
                                </div>
                            ` : sales.map(sale => `
                                <div class="transaction-row" onclick="POS.showTransactionDetails('${sale.id}')">
                                    <div class="tx-main">
                                        <div class="tx-id">${sale.saleId}</div>
                                        <div class="tx-time">${new Date(sale.timestamp).toLocaleTimeString('en-PH', {hour: '2-digit', minute: '2-digit'})}</div>
                                    </div>
                                    <div class="tx-items">
                                        ${sale.items.slice(0, 2).map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                                        ${sale.items.length > 2 ? `+${sale.items.length - 2} more` : ''}
                                    </div>
                                    <div class="tx-details">
                                        <span class="tx-method ${sale.paymentMethod}">${sale.paymentMethod === 'cash' ? '💵' : sale.paymentMethod === 'gcash' ? '📱' : '💳'}</span>
                                        <span class="tx-total">${Utils.formatCurrency(sale.total)}</span>
                                        ${sale.totalDiscount > 0 ? `<span class="tx-discount">-${Utils.formatCurrency(sale.totalDiscount)}</span>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `,
                customFooter: `
                    <div style="text-align:center;padding:15px;">
                        <button class="btn btn-primary" onclick="Modal.close()">Close</button>
                    </div>
                `,
                hideFooter: true
            });
            
            // Store sales for detail view
            this.transactionHistory = sales;
            
        } catch (error) {
            console.error('Error loading transactions:', error);
            Toast.error('Failed to load transactions');
        }
    },
    
    showTransactionDetails(saleId) {
        const sale = this.transactionHistory?.find(s => s.id === saleId);
        if (!sale) return;
        
        Modal.open({
            title: `🧾 ${sale.saleId}`,
            content: `
                <div class="transaction-detail">
                    <div class="detail-header">
                        <p><strong>Time:</strong> ${new Date(sale.timestamp).toLocaleString('en-PH')}</p>
                        <p><strong>Cashier:</strong> ${sale.cashierName}</p>
                        <p><strong>Payment:</strong> ${sale.paymentMethod.toUpperCase()}</p>
                    </div>
                    
                    <div class="detail-items">
                        <h4>Items</h4>
                        ${sale.items.map(item => `
                            <div class="detail-item">
                                <span>${item.quantity}x ${item.productName}${item.variantName ? ` (${item.variantName})` : ''}</span>
                                <span>${Utils.formatCurrency(item.lineTotal)}</span>
                            </div>
                            ${item.discountName ? `
                                <div class="detail-item discount">
                                    <span>↳ ${item.discountName} (-${item.discountPercent}%)</span>
                                    <span>-${Utils.formatCurrency(item.discountAmount * item.quantity)}</span>
                                </div>
                            ` : ''}
                        `).join('')}
                    </div>
                    
                    <div class="detail-totals">
                        ${sale.totalDiscount > 0 ? `
                            <div class="detail-row">
                                <span>Subtotal</span>
                                <span>${Utils.formatCurrency(sale.subtotal)}</span>
                            </div>
                            <div class="detail-row discount">
                                <span>Total Discounts</span>
                                <span>-${Utils.formatCurrency(sale.totalDiscount)}</span>
                            </div>
                        ` : ''}
                        <div class="detail-row total">
                            <span>TOTAL</span>
                            <span>${Utils.formatCurrency(sale.total)}</span>
                        </div>
                        ${sale.paymentMethod === 'cash' ? `
                            <div class="detail-row">
                                <span>Cash Received</span>
                                <span>${Utils.formatCurrency(sale.cashReceived)}</span>
                            </div>
                            <div class="detail-row">
                                <span>Change</span>
                                <span>${Utils.formatCurrency(sale.change)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${sale.discountInfo?.idPhoto ? `
                        <div class="detail-id-photo">
                            <h4>📸 ID Verification (${sale.discountInfo.idPhoto.photoCount || 1} photo${(sale.discountInfo.idPhoto.photoCount || 1) > 1 ? 's' : ''})</h4>
                            ${sale.discountInfo.idPhoto.photos ? `
                                <div class="id-photos-grid">
                                    ${sale.discountInfo.idPhoto.photos.map((p, i) => `
                                        <img src="${p.photoData}" alt="ID ${i+1}" class="id-photo-img" onclick="POS.showFullPhoto('${p.photoData.replace(/'/g, "\\'")}')">
                                    `).join('')}
                                </div>
                            ` : sale.discountInfo.idPhoto.photoData ? `
                                <img src="${sale.discountInfo.idPhoto.photoData}" alt="ID Photo" class="id-photo-img" onclick="POS.showFullPhoto('${sale.discountInfo.idPhoto.photoData.replace(/'/g, "\\'")}')">
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    ${sale.gcashPayment ? `
                        <div class="detail-gcash" style="margin-top: 15px; padding: 12px; background: #E3F2FD; border-radius: 8px;">
                            <h4 style="margin: 0 0 10px; color: #1565C0;">📱 GCash Payment Verification</h4>
                            <div style="display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; font-size: 0.9rem;">
                                <strong>Reference No:</strong>
                                <span style="font-family: monospace;">${sale.gcashPayment.refNo}</span>
                                <strong>Amount:</strong>
                                <span>₱${sale.gcashPayment.amount?.toLocaleString() || sale.total?.toLocaleString()}</span>
                                ${sale.gcashPayment.customerMobile ? `
                                    <strong>Customer Mobile:</strong>
                                    <span>${sale.gcashPayment.customerMobile}</span>
                                ` : ''}
                                ${sale.gcashPayment.senderName ? `
                                    <strong>Sender Name:</strong>
                                    <span>${sale.gcashPayment.senderName}</span>
                                ` : ''}
                            </div>
                            ${sale.gcashPayment.photoData ? `
                                <div style="margin-top: 10px;">
                                    <img src="${sale.gcashPayment.photoData}" alt="GCash Screenshot" 
                                         style="max-width: 200px; border-radius: 8px; border: 2px solid #1565C0; cursor: pointer;"
                                         onclick="POS.showFullPhoto('${sale.gcashPayment.photoData.replace(/'/g, "\\'")}')">
                                    <div style="font-size: 0.8rem; color: #666; margin-top: 4px;">Tap to enlarge</div>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `,
            saveText: '🖨️ Reprint Receipt',
            onSave: () => {
                this.lastSale = sale;
                this.printReceipt();
                return false; // Don't close modal
            }
        });
    },
    
    showFullPhoto(photoData) {
        Modal.open({
            title: '📸 ID Photo',
            content: `<img src="${photoData}" style="width:100%;border-radius:8px;">`,
            showFooter: true,
            saveText: 'Close',
            onSave: () => true
        });
    }
};
