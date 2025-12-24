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
    
    // Discount presets (like Loyverse)
    discountPresets: [
        { id: 'senior', name: 'Senior Citizen', percent: 20, icon: '👴' },
        { id: 'pwd', name: 'PWD', percent: 20, icon: '♿' },
        { id: 'employee', name: 'Employee', percent: 10, icon: '👷' },
        { id: 'promo', name: 'Promo', percent: 15, icon: '🎉' }
    ],
    
    // Active discount for new items
    activeDiscount: null,
    
    currentCategory: 'all',
    
    async init() {
        await this.loadProducts();
        await this.loadDiscountPresets();
        this.renderCategories();
        this.renderProducts();
        this.renderDiscountBar();
    },
    
    async loadProducts() {
        try {
            this.products = await DB.getAll('products');
            this.products.sort((a, b) => a.name.localeCompare(b.name));
            
            const cats = new Set();
            this.products.forEach(p => {
                if (p.category) cats.add(p.category);
            });
            this.categories = Array.from(cats).sort();
            
            console.log(`Loaded ${this.products.length} products`);
        } catch (error) {
            console.error('Error loading products:', error);
            Toast.error('Failed to load products');
        }
    },
    
    async loadDiscountPresets() {
        try {
            const stored = await DB.getAll('discountPresets');
            if (stored.length > 0) {
                this.discountPresets = stored;
            }
        } catch (error) {
            console.log('Using default discount presets');
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
        if (this.activeDiscount?.id === discountId) {
            // Turn off
            this.activeDiscount = null;
            this.discountIdPhoto = null;
            this.renderDiscountBar();
            Toast.info('Discount disabled');
        } else {
            // For Senior/PWD, require ID photo
            const discount = this.discountPresets.find(d => d.id === discountId);
            if (discount && (discountId === 'senior' || discountId === 'pwd' || discount.requiresId)) {
                this.showIdCaptureModal(discount);
            } else {
                this.activeDiscount = discount;
                this.discountIdPhoto = null;
                this.renderDiscountBar();
                Toast.info(`${this.activeDiscount.name} discount active`);
            }
        }
    },
    
    // ========== ID CAPTURE FOR DISCOUNTS ==========
    
    showIdCaptureModal(discount) {
        Modal.open({
            title: `📸 Capture ${discount.name} ID`,
            width: '95vw',
            content: `
                <div class="id-capture-modal">
                    <div class="id-capture-instructions">
                        <p>📋 Please capture the customer's <strong>${discount.name} ID</strong> for verification.</p>
                    </div>
                    
                    <div class="camera-container" id="cameraContainer">
                        <video id="cameraPreview" autoplay playsinline></video>
                        <canvas id="photoCanvas" style="display:none;"></canvas>
                        <img id="capturedPhoto" style="display:none;">
                    </div>
                    
                    <div class="camera-controls" id="cameraControls">
                        <button type="button" class="btn btn-primary btn-lg" id="captureBtn" onclick="POS.captureIdPhoto()">
                            📸 Take Photo
                        </button>
                    </div>
                    
                    <div class="photo-controls" id="photoControls" style="display:none;">
                        <button type="button" class="btn btn-outline" onclick="POS.retakePhoto()">
                            🔄 Retake
                        </button>
                        <button type="button" class="btn btn-success btn-lg" onclick="POS.confirmIdPhoto('${discount.id}')">
                            ✅ Confirm & Apply Discount
                        </button>
                    </div>
                </div>
            `,
            customFooter: `
                <div style="text-align:center;padding:10px;">
                    <button class="btn btn-outline" onclick="POS.skipIdCapture('${discount.id}')">Skip (No ID)</button>
                    <button class="btn btn-outline" onclick="POS.cancelIdCapture()">Cancel</button>
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
        const capturedImg = document.getElementById('capturedPhoto');
        
        if (!video || !canvas) return;
        
        // Set canvas size to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to data URL
        this.capturedIdPhotoData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Show captured image
        capturedImg.src = this.capturedIdPhotoData;
        capturedImg.style.display = 'block';
        video.style.display = 'none';
        
        // Show confirm controls
        document.getElementById('cameraControls').style.display = 'none';
        document.getElementById('photoControls').style.display = 'flex';
        
        Toast.success('Photo captured!');
    },
    
    retakePhoto() {
        const video = document.getElementById('cameraPreview');
        const capturedImg = document.getElementById('capturedPhoto');
        
        capturedImg.style.display = 'none';
        video.style.display = 'block';
        
        document.getElementById('cameraControls').style.display = 'block';
        document.getElementById('photoControls').style.display = 'none';
        
        this.capturedIdPhotoData = null;
    },
    
    confirmIdPhoto(discountId) {
        const discount = this.discountPresets.find(d => d.id === discountId);
        
        // Store the photo for this transaction
        this.discountIdPhoto = {
            discountId: discountId,
            discountName: discount?.name || 'Unknown',
            photoData: this.capturedIdPhotoData,
            capturedAt: new Date().toISOString()
        };
        
        this.activeDiscount = discount;
        
        this.stopCamera();
        Modal.close();
        
        this.renderDiscountBar();
        Toast.success(`${discount.name} discount applied with ID verification`);
    },
    
    skipIdCapture(discountId) {
        const discount = this.discountPresets.find(d => d.id === discountId);
        
        // Log that ID was skipped
        this.discountIdPhoto = {
            discountId: discountId,
            discountName: discount?.name || 'Unknown',
            photoData: null,
            skipped: true,
            skippedAt: new Date().toISOString()
        };
        
        this.activeDiscount = discount;
        
        this.stopCamera();
        Modal.close();
        
        this.renderDiscountBar();
        Toast.warning(`${discount.name} discount applied WITHOUT ID photo`);
    },
    
    cancelIdCapture() {
        this.stopCamera();
        Modal.close();
    },
    
    clearActiveDiscount() {
        this.activeDiscount = null;
        this.renderDiscountBar();
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
        
        // Select which categories to show based on main category filter
        let catsToShow = [];
        if (this.currentMainCategory === 'breads') {
            catsToShow = breadCats;
        } else if (this.currentMainCategory === 'drinks') {
            catsToShow = drinkCats;
        } else {
            catsToShow = [...breadCats, ...drinkCats]; // All
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
            // Main category filter (breads vs drinks)
            if (this.currentMainCategory !== 'all') {
                const category = (p.category || '').toLowerCase();
                const mainCat = (p.mainCategory || '').toLowerCase();
                
                // Drinks categories
                const drinkCategories = ['coffee', 'non-coffee', 'drinks', 'beverages'];
                const isDrink = mainCat === 'drinks' || drinkCategories.some(c => category.includes(c));
                
                if (this.currentMainCategory === 'drinks' && !isDrink) return false;
                if (this.currentMainCategory === 'breads' && isDrink) return false;
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
            
            return `
                <div class="product-card" onclick="POS.addToCart('${p.id}')">
                    <div class="product-image">
                        ${p.shop?.imageUrl 
                            ? `<img src="${p.shop.imageUrl}" alt="${p.name}">` 
                            : '<span class="no-image">🍞</span>'}
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
    
    // ========== CART MANAGEMENT ==========
    
    addToCart(productId, variantIndex = null) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        // If product has variants and no variant specified, show selector
        if (product.hasVariants && product.variants?.length > 0 && variantIndex === null) {
            this.showVariantSelector(product);
            return;
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
                
                <form id="checkoutForm">
                    <div class="form-group">
                        <label>Payment Method</label>
                        <div class="payment-methods">
                            <label class="payment-option">
                                <input type="radio" name="paymentMethod" value="cash" checked>
                                <span>💵 Cash</span>
                            </label>
                            <label class="payment-option">
                                <input type="radio" name="paymentMethod" value="gcash">
                                <span>📱 GCash</span>
                            </label>
                            <label class="payment-option">
                                <input type="radio" name="paymentMethod" value="card">
                                <span>💳 Card</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="form-group" id="cashReceivedGroup">
                        <label>Cash Received</label>
                        <input type="number" name="cashReceived" id="cashReceived" 
                               class="form-input" value="${Math.ceil(total / 10) * 10}" min="${total}" step="1"
                               oninput="POS.updateChange(${total})">
                        <div class="quick-cash">
                            ${[50, 100, 200, 500, 1000].filter(v => v >= total).slice(0, 4).map(v => 
                                `<button type="button" class="quick-cash-btn" onclick="document.getElementById('cashReceived').value=${v}; POS.updateChange(${total})">${Utils.formatCurrency(v)}</button>`
                            ).join('')}
                        </div>
                    </div>
                    
                    <div class="change-display" id="changeDisplay">
                        Change: <strong>${Utils.formatCurrency(Math.ceil(total / 10) * 10 - total)}</strong>
                    </div>
                </form>
            `,
            saveText: '✅ Complete Sale',
            onSave: () => this.completeSale(total, totalDiscount)
        });
        
        // Add payment method change listener
        setTimeout(() => {
            document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const cashGroup = document.getElementById('cashReceivedGroup');
                    const changeDisplay = document.getElementById('changeDisplay');
                    if (e.target.value === 'cash') {
                        cashGroup.style.display = 'block';
                        changeDisplay.style.display = 'block';
                    } else {
                        cashGroup.style.display = 'none';
                        changeDisplay.style.display = 'none';
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
        
        try {
            const today = Utils.getTodayKey();
            const saleNum = await DB.getNextSaleNumber();
            const saleId = `S-${today.replace(/-/g, '')}-${String(saleNum).padStart(3, '0')}`;
            
            const originalSubtotal = this.cart.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
            
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
                
                source: 'pos',
                createdBy: Auth.userData?.id || 'unknown',
                createdByName: Auth.userData?.name || 'Unknown'
            };
            
            await DB.add('sales', saleRecord);
            
            // Deduct inventory (async, don't block sale)
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
            
            // Clear cart
            this.cart = [];
            this.renderCart();
            
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
    }
};
