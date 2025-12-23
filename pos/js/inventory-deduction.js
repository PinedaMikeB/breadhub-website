/**
 * BreadHub POS - Inventory Deduction Module
 * 
 * Deducts ingredients and packaging materials when sales are made
 * Uses product recipes from ProofMaster
 */

const InventoryDeduction = {
    // Cache for recipes and products
    products: {},
    ingredients: {},
    packaging: {},
    doughs: {},
    fillings: {},
    toppings: {},
    
    // Initialize - load all required data
    async init() {
        try {
            await Promise.all([
                this.loadProducts(),
                this.loadIngredients(),
                this.loadPackaging(),
                this.loadDoughs(),
                this.loadFillings(),
                this.loadToppings()
            ]);
            console.log('InventoryDeduction initialized');
            return true;
        } catch (error) {
            console.error('Failed to init InventoryDeduction:', error);
            return false;
        }
    },
    
    async loadProducts() {
        const snapshot = await db.collection('products').get();
        snapshot.forEach(doc => {
            this.products[doc.id] = { id: doc.id, ...doc.data() };
        });
    },
    
    async loadIngredients() {
        const snapshot = await db.collection('ingredients').get();
        snapshot.forEach(doc => {
            this.ingredients[doc.id] = { id: doc.id, ...doc.data() };
        });
    },
    
    async loadPackaging() {
        const snapshot = await db.collection('packagingMaterials').get();
        snapshot.forEach(doc => {
            this.packaging[doc.id] = { id: doc.id, ...doc.data() };
        });
    },

    async loadDoughs() {
        const snapshot = await db.collection('doughs').get();
        snapshot.forEach(doc => {
            this.doughs[doc.id] = { id: doc.id, ...doc.data() };
        });
    },
    
    async loadFillings() {
        const snapshot = await db.collection('fillings').get();
        snapshot.forEach(doc => {
            this.fillings[doc.id] = { id: doc.id, ...doc.data() };
        });
    },
    
    async loadToppings() {
        const snapshot = await db.collection('toppings').get();
        snapshot.forEach(doc => {
            this.toppings[doc.id] = { id: doc.id, ...doc.data() };
        });
    },
    
    /**
     * Deduct inventory for a sale
     * @param {Object} sale - The sale record with items
     * @returns {Object} - Deduction summary
     */
    async deductForSale(sale) {
        const deductions = {
            ingredients: {},
            packaging: {},
            errors: [],
            success: true
        };
        
        try {
            // Calculate total deductions needed
            for (const item of sale.items) {
                const product = this.products[item.productId];
                if (!product) {
                    deductions.errors.push(`Product not found: ${item.productId}`);
                    continue;
                }
                
                // Get deductions for this product * quantity
                const itemDeductions = this.calculateProductDeductions(product, item.quantity);
                
                // Merge ingredient deductions
                for (const [id, amount] of Object.entries(itemDeductions.ingredients)) {
                    deductions.ingredients[id] = (deductions.ingredients[id] || 0) + amount;
                }
                
                // Merge packaging deductions
                for (const [id, amount] of Object.entries(itemDeductions.packaging)) {
                    deductions.packaging[id] = (deductions.packaging[id] || 0) + amount;
                }
            }

            // Apply deductions to Firebase
            await this.applyDeductions(deductions);
            
            // Log the deduction
            await this.logDeduction(sale.saleId, deductions);
            
            return deductions;
            
        } catch (error) {
            console.error('Error in deductForSale:', error);
            deductions.errors.push(error.message);
            deductions.success = false;
            return deductions;
        }
    },
    
    /**
     * Calculate deductions for a single product
     */
    calculateProductDeductions(product, quantity) {
        const deductions = { ingredients: {}, packaging: {} };
        
        // Get recipe if exists
        const recipe = product.recipe;
        if (!recipe) return deductions;
        
        // Process dough (has its own ingredients)
        if (recipe.doughId && this.doughs[recipe.doughId]) {
            const dough = this.doughs[recipe.doughId];
            const doughWeight = recipe.doughWeight || 0;
            
            if (dough.ingredients) {
                for (const ing of dough.ingredients) {
                    const ratio = doughWeight / (dough.batchWeight || 1);
                    const amount = ing.quantity * ratio * quantity;
                    deductions.ingredients[ing.ingredientId] = 
                        (deductions.ingredients[ing.ingredientId] || 0) + amount;
                }
            }
        }
        
        // Process filling
        if (recipe.fillingId && this.fillings[recipe.fillingId]) {
            const filling = this.fillings[recipe.fillingId];
            const fillingWeight = recipe.fillingWeight || 0;
            
            if (filling.ingredients) {
                for (const ing of filling.ingredients) {
                    const ratio = fillingWeight / (filling.batchWeight || 1);
                    const amount = ing.quantity * ratio * quantity;
                    deductions.ingredients[ing.ingredientId] = 
                        (deductions.ingredients[ing.ingredientId] || 0) + amount;
                }
            }
        }

        // Process toppings
        if (recipe.toppings && recipe.toppings.length > 0) {
            for (const toppingRef of recipe.toppings) {
                const topping = this.toppings[toppingRef.toppingId];
                if (!topping || !topping.ingredients) continue;
                
                const toppingWeight = toppingRef.weight || 0;
                for (const ing of topping.ingredients) {
                    const ratio = toppingWeight / (topping.batchWeight || 1);
                    const amount = ing.quantity * ratio * quantity;
                    deductions.ingredients[ing.ingredientId] = 
                        (deductions.ingredients[ing.ingredientId] || 0) + amount;
                }
            }
        }
        
        // Process direct ingredients
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            for (const ing of recipe.ingredients) {
                const amount = ing.quantity * quantity;
                deductions.ingredients[ing.ingredientId] = 
                    (deductions.ingredients[ing.ingredientId] || 0) + amount;
            }
        }
        
        // Process packaging
        if (recipe.packaging && recipe.packaging.length > 0) {
            for (const pkg of recipe.packaging) {
                const amount = (pkg.quantity || 1) * quantity;
                deductions.packaging[pkg.packagingId] = 
                    (deductions.packaging[pkg.packagingId] || 0) + amount;
            }
        }
        
        return deductions;
    },
    
    /**
     * Apply deductions to Firebase
     */
    async applyDeductions(deductions) {
        const batch = db.batch();
        
        // Deduct ingredients
        for (const [id, amount] of Object.entries(deductions.ingredients)) {
            if (amount > 0) {
                const ref = db.collection('ingredients').doc(id);
                batch.update(ref, {
                    currentStock: firebase.firestore.FieldValue.increment(-amount),
                    lastDeductedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        // Deduct packaging
        for (const [id, amount] of Object.entries(deductions.packaging)) {
            if (amount > 0) {
                const ref = db.collection('packagingMaterials').doc(id);
                batch.update(ref, {
                    currentStock: firebase.firestore.FieldValue.increment(-amount),
                    lastDeductedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        await batch.commit();
    },
    
    /**
     * Log deduction for audit trail
     */
    async logDeduction(saleId, deductions) {
        await db.collection('inventoryDeductions').add({
            saleId,
            ingredients: deductions.ingredients,
            packaging: deductions.packaging,
            errors: deductions.errors,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },
    
    /**
     * Check low stock and return alerts
     */
    async checkLowStock() {
        const alerts = [];
        
        // Reload fresh data
        await Promise.all([this.loadIngredients(), this.loadPackaging()]);
        
        // Check ingredients
        for (const ing of Object.values(this.ingredients)) {
            const current = ing.currentStock || 0;
            const reorder = ing.reorderLevel || 0;
            if (current <= reorder) {
                alerts.push({
                    type: 'ingredient',
                    id: ing.id,
                    name: ing.name,
                    current,
                    reorderLevel: reorder,
                    unit: ing.unit
                });
            }
        }
        
        // Check packaging
        for (const pkg of Object.values(this.packaging)) {
            const current = pkg.currentStock || 0;
            const reorder = pkg.reorderLevel || 0;
            if (current <= reorder) {
                alerts.push({
                    type: 'packaging',
                    id: pkg.id,
                    name: pkg.name,
                    current,
                    reorderLevel: reorder,
                    unit: pkg.unit || 'pcs'
                });
            }
        }
        
        return alerts;
    }
};
