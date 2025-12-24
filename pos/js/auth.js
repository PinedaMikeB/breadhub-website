/**
 * BreadHub POS - Authentication v2
 * PIN-based login for cashiers with shift management
 */

const Auth = {
    currentUser: null,      // Firebase auth user (for admins)
    userData: null,         // Current staff member data
    currentShift: null,     // Active shift
    
    init() {
        // Check if there's a saved session
        const savedStaff = localStorage.getItem('pos_staff');
        const savedShift = localStorage.getItem('pos_shift');
        
        if (savedStaff && savedShift) {
            this.userData = JSON.parse(savedStaff);
            this.currentShift = JSON.parse(savedShift);
            this.showPOS();
        } else {
            this.showLogin();
        }
    },
    
    // ========== PIN LOGIN ==========
    
    async loginWithPIN(pin) {
        if (!pin || pin.length < 4) {
            Toast.error('Please enter a valid PIN');
            return false;
        }
        
        try {
            // Query staff by PIN
            const staffMembers = await DB.getAll('staff');
            const staff = staffMembers.find(s => s.pin === pin && s.status === 'active');
            
            if (!staff) {
                Toast.error('Invalid PIN or account inactive');
                return false;
            }
            
            // Check if has POS access
            if (!staff.canUsePOS) {
                Toast.error('You do not have POS access');
                return false;
            }
            
            this.userData = staff;
            localStorage.setItem('pos_staff', JSON.stringify(staff));
            
            Toast.success(`Welcome, ${staff.name}!`);
            
            // Owners/Managers can skip shift, others must start shift
            if (staff.role === 'owner' || staff.role === 'manager') {
                this.showOwnerOptions();
            } else {
                this.showShiftStartModal();
            }
            
            return true;
            
        } catch (error) {
            console.error('Login error:', error);
            Toast.error('Login failed. Please try again.');
            return false;
        }
    },
    
    // ========== OWNER OPTIONS ==========
    
    showOwnerOptions() {
        Modal.open({
            title: '👋 Welcome, ' + this.userData.name,
            content: `
                <div class="owner-options">
                    <p style="text-align: center; color: var(--text-secondary); margin-bottom: 25px;">
                        What would you like to do?
                    </p>
                    <div class="owner-option-buttons">
                        <button class="owner-option-btn" onclick="Auth.startShiftAsOwner()">
                            <span class="option-icon">💰</span>
                            <span class="option-label">Start Shift</span>
                            <span class="option-desc">Process sales at the counter</span>
                        </button>
                        <button class="owner-option-btn" onclick="Auth.enterViewOnlyMode()">
                            <span class="option-icon">📊</span>
                            <span class="option-label">View Only</span>
                            <span class="option-desc">Check reports, no shift needed</span>
                        </button>
                    </div>
                </div>
            `,
            hideFooter: true
        });
    },
    
    startShiftAsOwner() {
        Modal.close();
        this.showShiftStartModal();
    },
    
    enterViewOnlyMode() {
        Modal.close();
        
        // Create a view-only session (no shift)
        this.currentShift = {
            id: 'view-only',
            staffName: this.userData.name,
            isViewOnly: true,
            isOwner: true
        };
        localStorage.setItem('pos_shift', JSON.stringify(this.currentShift));
        
        Toast.info('View-only mode - sales disabled');
        this.showPOS();
    },
    
    // ========== SHIFT MANAGEMENT ==========
    
    showShiftStartModal() {
        Modal.open({
            title: '🕐 Start Your Shift',
            content: `
                <div class="shift-start-info">
                    <div class="staff-welcome">
                        <div class="staff-avatar">${this.userData.name.charAt(0).toUpperCase()}</div>
                        <div>
                            <h3>${this.userData.name}</h3>
                            <span class="role-badge">${this.userData.role}</span>
                        </div>
                    </div>
                    <div class="shift-details">
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleTimeString('en-PH')}</p>
                    </div>
                    <div class="form-group">
                        <label>Starting Cash (Optional)</label>
                        <input type="number" id="startingCash" class="form-input" placeholder="0.00" step="0.01">
                    </div>
                </div>
            `,
            saveText: '▶️ Start Shift',
            cancelText: 'Cancel',
            onSave: async () => {
                await this.startShift();
            },
            onCancel: () => {
                this.logout();
            }
        });
    },
    
    async startShift() {
        const today = Utils.getTodayKey();
        const startingCash = parseFloat(document.getElementById('startingCash')?.value) || 0;
        
        try {
            // Get shift number for today
            const todayShifts = await DB.query('shifts', 'dateKey', '==', today);
            const shiftNumber = todayShifts.length + 1;
            
            const shiftData = {
                staffId: this.userData.id,
                staffName: this.userData.name,
                staffRole: this.userData.role,
                dateKey: today,
                shiftNumber: shiftNumber,
                startTime: new Date().toISOString(),
                startingCash: startingCash,
                endTime: null,
                endingCash: null,
                totalSales: 0,
                transactionCount: 0,
                status: 'active'
            };
            
            const shiftId = await DB.add('shifts', shiftData);
            this.currentShift = { id: shiftId, ...shiftData };
            localStorage.setItem('pos_shift', JSON.stringify(this.currentShift));
            
            Toast.success(`Shift #${shiftNumber} started!`);
            this.showPOS();
            
        } catch (error) {
            console.error('Error starting shift:', error);
            Toast.error('Failed to start shift');
        }
    },
    
    async endShift() {
        if (!this.currentShift) {
            Toast.error('No active shift');
            return;
        }
        
        // Get shift sales and separate by payment method
        const sales = await DB.query('sales', 'shiftId', '==', this.currentShift.id);
        const cashSales = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
        const gcashSales = sales.filter(s => s.paymentMethod === 'gcash').reduce((sum, s) => sum + (s.total || 0), 0);
        const otherSales = sales.filter(s => s.paymentMethod !== 'cash' && s.paymentMethod !== 'gcash').reduce((sum, s) => sum + (s.total || 0), 0);
        const totalSales = cashSales + gcashSales + otherSales;
        const transactionCount = sales.length;
        
        // Expected cash = starting cash + cash sales only (GCash goes to app, not drawer)
        const expectedCash = (this.currentShift.startingCash || 0) + cashSales;
        
        // Store for later use in PDF
        this.endShiftData = {
            shift: this.currentShift,
            sales,
            cashSales,
            gcashSales,
            otherSales,
            totalSales,
            transactionCount,
            expectedCash
        };
        
        Modal.open({
            title: '🏁 End Shift',
            content: `
                <div class="shift-end-info">
                    <h3>Shift #${this.currentShift.shiftNumber} Summary</h3>
                    
                    <div class="shift-summary-grid">
                        <div class="summary-item">
                            <span class="label">Cashier</span>
                            <span class="value">${this.currentShift.staffName}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Start Time</span>
                            <span class="value">${Utils.formatTime(this.currentShift.startTime)}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Starting Cash</span>
                            <span class="value">${Utils.formatCurrency(this.currentShift.startingCash || 0)}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">Transactions</span>
                            <span class="value">${transactionCount}</span>
                        </div>
                    </div>
                    
                    <div class="sales-breakdown">
                        <h4>💰 Sales Breakdown</h4>
                        <div class="breakdown-row">
                            <span>💵 Cash Sales:</span>
                            <span class="amount">${Utils.formatCurrency(cashSales)}</span>
                        </div>
                        <div class="breakdown-row">
                            <span>📱 GCash Sales:</span>
                            <span class="amount">${Utils.formatCurrency(gcashSales)}</span>
                        </div>
                        ${otherSales > 0 ? `
                        <div class="breakdown-row">
                            <span>💳 Other:</span>
                            <span class="amount">${Utils.formatCurrency(otherSales)}</span>
                        </div>
                        ` : ''}
                        <div class="breakdown-row total">
                            <span>Total Sales:</span>
                            <span class="amount">${Utils.formatCurrency(totalSales)}</span>
                        </div>
                    </div>
                    
                    <div class="cash-section">
                        <h4>🧮 Cash Drawer</h4>
                        <div class="expected-cash">
                            Expected Cash in Drawer: <strong>${Utils.formatCurrency(expectedCash)}</strong>
                            <small>(Starting ₱${(this.currentShift.startingCash || 0).toLocaleString()} + Cash Sales ₱${cashSales.toLocaleString()})</small>
                        </div>
                        
                        <div class="form-group">
                            <label>Actual Cash Count</label>
                            <input type="number" id="actualCash" class="form-input" placeholder="Count your drawer" step="0.01" oninput="Auth.calculateVariance()">
                        </div>
                        
                        <div class="expenses-section">
                            <div class="expenses-header">
                                <h4>🛒 Emergency Stock Purchases</h4>
                                <button type="button" class="btn btn-sm btn-secondary" onclick="Auth.addExpenseRow()">+ Add Item</button>
                            </div>
                            <div id="expensesList">
                                <!-- Expense rows will be added here -->
                            </div>
                            <div class="expenses-total">
                                Total Expenses: <strong id="totalExpensesDisplay">₱0.00</strong>
                            </div>
                        </div>
                        
                        <div id="varianceDisplay" class="variance-display">
                            Enter actual cash count above
                        </div>
                    </div>
                </div>
            `,
            saveText: '✅ End Shift & Generate Report',
            onSave: async () => {
                await this.finalizeEndShift();
            }
        });
        
        // Initialize expenses array
        this.shiftExpenses = [];
    },
    
    addExpenseRow() {
        const expenseId = Date.now();
        const container = document.getElementById('expensesList');
        
        const row = document.createElement('div');
        row.className = 'expense-row';
        row.id = `expense-${expenseId}`;
        row.innerHTML = `
            <div class="expense-fields" id="expense-fields-${expenseId}">
                <!-- Fields will be loaded -->
            </div>
            <button type="button" class="btn btn-icon btn-danger btn-sm expense-delete" onclick="Auth.removeExpenseRow(${expenseId})">🗑️</button>
        `;
        
        container.appendChild(row);
        
        // Auto-load the stock purchase fields
        this.loadStockFields(expenseId);
    },
    
    async loadStockFields(expenseId) {
        const fieldsContainer = document.getElementById(`expense-fields-${expenseId}`);
        
        // Load ingredients, packaging, and suppliers
        if (!this.ingredientsList) {
            const [ingredients, packaging, suppliers] = await Promise.all([
                DB.getAll('ingredients'),
                DB.getAll('packagingMaterials'),
                DB.getAll('suppliers')
            ]);
            
            this.ingredientsList = ingredients.map(i => ({ 
                id: i.id, 
                name: i.name, 
                unit: i.unit,
                type: 'ingredient',
                category: i.category || 'Ingredient'
            }));
            this.packagingList = packaging.map(p => ({ 
                id: p.id, 
                name: p.name, 
                unit: p.unit,
                type: 'packaging',
                category: 'Packaging'
            }));
            this.suppliersList = suppliers.map(s => ({ 
                id: s.id, 
                name: s.name 
            }));
            
            // Combine items for searchable list
            this.allItems = [...this.ingredientsList, ...this.packagingList];
        }
        
        fieldsContainer.innerHTML = `
            <div class="expense-field-grid stock-grid">
                <div class="form-group searchable-field">
                    <label>Item (Ingredient/Packaging)</label>
                    <div class="search-input-wrapper">
                        <input type="text" class="form-input search-input" id="item-search-${expenseId}" 
                               placeholder="Type to search..." 
                               autocomplete="off"
                               oninput="Auth.filterItems(${expenseId}, this.value)"
                               onfocus="Auth.showItemDropdown(${expenseId})">
                        <input type="hidden" id="item-id-${expenseId}">
                        <input type="hidden" id="item-type-${expenseId}">
                        <div class="search-dropdown" id="item-dropdown-${expenseId}"></div>
                    </div>
                </div>
                <div class="form-group searchable-field">
                    <label>Supplier</label>
                    <div class="search-input-wrapper">
                        <input type="text" class="form-input search-input" id="supplier-search-${expenseId}" 
                               placeholder="Type to search..." 
                               autocomplete="off"
                               oninput="Auth.filterSuppliers(${expenseId}, this.value)"
                               onfocus="Auth.showSupplierDropdown(${expenseId})">
                        <input type="hidden" id="supplier-id-${expenseId}">
                        <div class="search-dropdown" id="supplier-dropdown-${expenseId}"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Quantity</label>
                    <div class="qty-with-unit">
                        <input type="number" class="form-input" id="qty-${expenseId}" placeholder="0" step="0.01">
                        <span class="unit-label" id="unit-${expenseId}">unit</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>Amount (₱)</label>
                    <input type="number" class="form-input" id="amount-${expenseId}" placeholder="0.00" step="0.01" oninput="Auth.updateTotalExpenses()">
                </div>
            </div>
        `;
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.searchable-field')) {
                document.querySelectorAll('.search-dropdown').forEach(d => d.classList.remove('show'));
            }
        });
    },
    
    showItemDropdown(expenseId) {
        const dropdown = document.getElementById(`item-dropdown-${expenseId}`);
        this.filterItems(expenseId, '');
        dropdown.classList.add('show');
    },
    
    filterItems(expenseId, query) {
        const dropdown = document.getElementById(`item-dropdown-${expenseId}`);
        const q = query.toLowerCase();
        
        const filtered = this.allItems.filter(item => 
            item.name.toLowerCase().includes(q)
        ).slice(0, 10); // Limit to 10 results
        
        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-empty">No items found</div>';
        } else {
            dropdown.innerHTML = filtered.map(item => `
                <div class="dropdown-item" onclick="Auth.selectItem(${expenseId}, '${item.id}', '${item.name.replace(/'/g, "\\'")}', '${item.type}', '${item.unit || 'unit'}')">
                    <span class="item-name">${item.name}</span>
                    <span class="item-category ${item.type}">${item.category}</span>
                </div>
            `).join('');
        }
        
        dropdown.classList.add('show');
    },
    
    selectItem(expenseId, itemId, itemName, itemType, unit) {
        document.getElementById(`item-search-${expenseId}`).value = itemName;
        document.getElementById(`item-id-${expenseId}`).value = itemId;
        document.getElementById(`item-type-${expenseId}`).value = itemType;
        document.getElementById(`unit-${expenseId}`).textContent = unit;
        document.getElementById(`item-dropdown-${expenseId}`).classList.remove('show');
    },
    
    showSupplierDropdown(expenseId) {
        const dropdown = document.getElementById(`supplier-dropdown-${expenseId}`);
        this.filterSuppliers(expenseId, '');
        dropdown.classList.add('show');
    },
    
    filterSuppliers(expenseId, query) {
        const dropdown = document.getElementById(`supplier-dropdown-${expenseId}`);
        const q = query.toLowerCase();
        
        const filtered = this.suppliersList.filter(s => 
            s.name.toLowerCase().includes(q)
        ).slice(0, 10);
        
        // Add option to add new supplier
        let html = '';
        if (filtered.length === 0) {
            html = `<div class="dropdown-item new-item" onclick="Auth.selectSupplier(${expenseId}, 'new', '${query.replace(/'/g, "\\'")}')">
                <span>➕ Add "${query}" as supplier</span>
            </div>`;
        } else {
            html = filtered.map(s => `
                <div class="dropdown-item" onclick="Auth.selectSupplier(${expenseId}, '${s.id}', '${s.name.replace(/'/g, "\\'")}')">
                    <span>${s.name}</span>
                </div>
            `).join('');
            
            // Add "new" option if query doesn't exactly match
            if (query && !filtered.some(s => s.name.toLowerCase() === q)) {
                html += `<div class="dropdown-item new-item" onclick="Auth.selectSupplier(${expenseId}, 'new', '${query.replace(/'/g, "\\'")}')">
                    <span>➕ Add "${query}" as new supplier</span>
                </div>`;
            }
        }
        
        dropdown.innerHTML = html;
        dropdown.classList.add('show');
    },
    
    selectSupplier(expenseId, supplierId, supplierName) {
        document.getElementById(`supplier-search-${expenseId}`).value = supplierName;
        document.getElementById(`supplier-id-${expenseId}`).value = supplierId;
        document.getElementById(`supplier-dropdown-${expenseId}`).classList.remove('show');
    },
    
    removeExpenseRow(expenseId) {
        const row = document.getElementById(`expense-${expenseId}`);
        if (row) row.remove();
        this.updateTotalExpenses();
    },
    
    updateTotalExpenses() {
        const rows = document.querySelectorAll('.expense-row');
        let total = 0;
        
        rows.forEach(row => {
            const expenseId = row.id.replace('expense-', '');
            const amountInput = document.getElementById(`amount-${expenseId}`);
            if (amountInput) {
                total += parseFloat(amountInput.value) || 0;
            }
        });
        
        document.getElementById('totalExpensesDisplay').textContent = Utils.formatCurrency(total);
        this.calculateVariance();
    },
    
    getExpensesData() {
        const rows = document.querySelectorAll('.expense-row');
        const expenses = [];
        
        rows.forEach(row => {
            const expenseId = row.id.replace('expense-', '');
            
            const amount = parseFloat(document.getElementById(`amount-${expenseId}`)?.value) || 0;
            if (amount <= 0) return;
            
            const itemName = document.getElementById(`item-search-${expenseId}`)?.value || '';
            const itemId = document.getElementById(`item-id-${expenseId}`)?.value || '';
            const itemType = document.getElementById(`item-type-${expenseId}`)?.value || '';
            const supplierName = document.getElementById(`supplier-search-${expenseId}`)?.value || '';
            const supplierId = document.getElementById(`supplier-id-${expenseId}`)?.value || '';
            const qty = parseFloat(document.getElementById(`qty-${expenseId}`)?.value) || 0;
            const unit = document.getElementById(`unit-${expenseId}`)?.textContent || 'unit';
            
            expenses.push({
                type: 'stock',
                itemId: itemId,
                itemName: itemName,
                itemType: itemType, // 'ingredient' or 'packaging'
                supplierId: supplierId,
                supplierName: supplierName,
                qty: qty,
                unit: unit,
                amount: amount
            });
        });
        
        return expenses;
    },
    
    calculateVariance() {
        const actualCash = parseFloat(document.getElementById('actualCash')?.value) || 0;
        
        // Get total expenses from all rows
        const rows = document.querySelectorAll('.expense-row');
        let expenses = 0;
        rows.forEach(row => {
            const expenseId = row.id.replace('expense-', '');
            const amountInput = document.getElementById(`amount-${expenseId}`);
            if (amountInput) {
                expenses += parseFloat(amountInput.value) || 0;
            }
        });
        
        const expectedCash = this.endShiftData.expectedCash;
        
        // Adjusted expected = expected - expenses
        const adjustedExpected = expectedCash - expenses;
        const variance = actualCash - adjustedExpected;
        
        const display = document.getElementById('varianceDisplay');
        
        let status, statusClass;
        if (Math.abs(variance) < 1) {
            status = '✅ BALANCED';
            statusClass = 'balanced';
        } else if (variance > 0) {
            status = `⬆️ OVER by ${Utils.formatCurrency(variance)}`;
            statusClass = 'over';
        } else {
            status = `⬇️ SHORT by ${Utils.formatCurrency(Math.abs(variance))}`;
            statusClass = 'short';
        }
        
        display.innerHTML = `
            <div class="variance-calc">
                <div class="calc-row">
                    <span>Expected Cash:</span>
                    <span>${Utils.formatCurrency(expectedCash)}</span>
                </div>
                ${expenses > 0 ? `
                <div class="calc-row expense">
                    <span>Less Expenses:</span>
                    <span>- ${Utils.formatCurrency(expenses)}</span>
                </div>
                <div class="calc-row">
                    <span>Adjusted Expected:</span>
                    <span>${Utils.formatCurrency(adjustedExpected)}</span>
                </div>
                ` : ''}
                <div class="calc-row">
                    <span>Actual Cash:</span>
                    <span>${Utils.formatCurrency(actualCash)}</span>
                </div>
            </div>
            <div class="variance-status ${statusClass}">${status}</div>
        `;
    },
    
    async finalizeEndShift() {
        const actualCash = parseFloat(document.getElementById('actualCash')?.value) || 0;
        
        // Get structured expenses data
        const expensesData = this.getExpensesData();
        const totalExpenses = expensesData.reduce((sum, e) => sum + e.amount, 0);
        
        const { shift, sales, cashSales, gcashSales, otherSales, totalSales, transactionCount, expectedCash } = this.endShiftData;
        
        const adjustedExpected = expectedCash - totalExpenses;
        const variance = actualCash - adjustedExpected;
        
        let balanceStatus;
        if (Math.abs(variance) < 1) {
            balanceStatus = 'balanced';
        } else if (variance > 0) {
            balanceStatus = 'over';
        } else {
            balanceStatus = 'short';
        }
        
        const endTime = new Date().toISOString();
        
        const shiftReport = {
            endTime,
            cashSales,
            gcashSales,
            otherSales,
            totalSales,
            transactionCount,
            startingCash: shift.startingCash || 0,
            expectedCash,
            expenses: totalExpenses,
            expensesDetails: expensesData,
            adjustedExpected,
            actualCash,
            variance,
            balanceStatus,
            status: 'completed'
        };
        
        try {
            // Update shift in Firebase
            await DB.update('shifts', shift.id, shiftReport);
            
            // Create pending emergency purchases for ProofMaster
            for (const purchase of expensesData) {
                await DB.add('pendingPurchases', {
                    shiftId: shift.id,
                    shiftNumber: shift.shiftNumber,
                    dateKey: shift.dateKey,
                    cashierName: shift.staffName,
                    cashierId: shift.staffId,
                    // Item details (linked to actual ingredient/packaging)
                    itemId: purchase.itemId,
                    itemName: purchase.itemName,
                    itemType: purchase.itemType, // 'ingredient' or 'packaging'
                    // Supplier details
                    supplierId: purchase.supplierId,
                    supplierName: purchase.supplierName,
                    // Quantity and amount
                    qty: purchase.qty,
                    unit: purchase.unit,
                    amount: purchase.amount,
                    // Status tracking
                    status: 'pending', // pending → approved → received → added-to-inventory
                    createdAt: endTime
                });
            }
            
            // Store expenses data for report
            this.expensesData = expensesData;
            
            // Generate PDF report
            await this.generateShiftReport(shiftReport);
            
        } catch (error) {
            console.error('Error ending shift:', error);
            Toast.error('Failed to end shift');
            return false;
        }
    },
    
    async generateShiftReport(report) {
        const shift = this.currentShift;
        const dateStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = new Date().toLocaleTimeString('en-PH');
        const expensesData = this.expensesData || [];
        
        // Build expenses details HTML
        let expensesHTML = '';
        if (expensesData.length > 0) {
            expensesHTML = `
                <div style="margin-bottom: 20px;">
                    <h3>💸 Emergency Stock Purchases</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #e8e8e8;">
                            <td style="padding: 8px;"><strong>Item</strong></td>
                            <td style="padding: 8px;"><strong>Supplier</strong></td>
                            <td style="padding: 8px; text-align: right;"><strong>Amount</strong></td>
                        </tr>
                        ${expensesData.map(e => `
                            <tr style="background: #fff3cd;">
                                <td style="padding: 8px;">
                                    <strong>${e.itemName}</strong><br>
                                    <small>${e.qty} ${e.unit}</small>
                                </td>
                                <td style="padding: 8px;">${e.supplierName}</td>
                                <td style="padding: 8px; text-align: right;">${Utils.formatCurrency(e.amount)}</td>
                            </tr>
                        `).join('')}
                        <tr style="border-top: 2px solid #333;">
                            <td colspan="2" style="padding: 8px;"><strong>TOTAL</strong></td>
                            <td style="padding: 8px; text-align: right;"><strong>${Utils.formatCurrency(report.expenses)}</strong></td>
                        </tr>
                    </table>
                    <p style="color: #856404; font-size: 0.9em;">⚠️ Pending approval in ProofMaster</p>
                </div>
            `;
        }
        
        // Create report content
        const reportHTML = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #D4894A; margin: 0;">🍞 BreadHub</h1>
                    <h2 style="margin: 10px 0;">Shift End Report</h2>
                    <p style="color: #666;">${dateStr}</p>
                </div>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0;">Shift Details</h3>
                    <table style="width: 100%;">
                        <tr><td><strong>Shift #:</strong></td><td>${shift.shiftNumber}</td></tr>
                        <tr><td><strong>Cashier:</strong></td><td>${shift.staffName}</td></tr>
                        <tr><td><strong>Date:</strong></td><td>${shift.dateKey}</td></tr>
                        <tr><td><strong>Start Time:</strong></td><td>${Utils.formatTime(shift.startTime)}</td></tr>
                        <tr><td><strong>End Time:</strong></td><td>${timeStr}</td></tr>
                    </table>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3>💰 Sales Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #e8e8e8;"><td style="padding: 8px;"><strong>Payment Method</strong></td><td style="padding: 8px; text-align: right;"><strong>Amount</strong></td></tr>
                        <tr><td style="padding: 8px;">💵 Cash Sales</td><td style="padding: 8px; text-align: right;">${Utils.formatCurrency(report.cashSales)}</td></tr>
                        <tr><td style="padding: 8px;">📱 GCash Sales</td><td style="padding: 8px; text-align: right;">${Utils.formatCurrency(report.gcashSales)}</td></tr>
                        ${report.otherSales > 0 ? `<tr><td style="padding: 8px;">💳 Other</td><td style="padding: 8px; text-align: right;">${Utils.formatCurrency(report.otherSales)}</td></tr>` : ''}
                        <tr style="background: #D4894A; color: white;"><td style="padding: 8px;"><strong>TOTAL SALES</strong></td><td style="padding: 8px; text-align: right;"><strong>${Utils.formatCurrency(report.totalSales)}</strong></td></tr>
                    </table>
                    <p style="color: #666;">Total Transactions: ${report.transactionCount}</p>
                </div>
                
                ${expensesHTML}
                
                <div style="margin-bottom: 20px;">
                    <h3>🧮 Cash Reconciliation</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px;">Starting Cash</td><td style="padding: 8px; text-align: right;">${Utils.formatCurrency(report.startingCash)}</td></tr>
                        <tr><td style="padding: 8px;">+ Cash Sales</td><td style="padding: 8px; text-align: right;">${Utils.formatCurrency(report.cashSales)}</td></tr>
                        <tr style="border-top: 1px solid #ccc;"><td style="padding: 8px;"><strong>Expected Cash</strong></td><td style="padding: 8px; text-align: right;"><strong>${Utils.formatCurrency(report.expectedCash)}</strong></td></tr>
                        ${report.expenses > 0 ? `
                        <tr><td style="padding: 8px; color: #e74c3c;">- Total Expenses</td><td style="padding: 8px; text-align: right; color: #e74c3c;">${Utils.formatCurrency(report.expenses)}</td></tr>
                        <tr><td style="padding: 8px;"><strong>Adjusted Expected</strong></td><td style="padding: 8px; text-align: right;"><strong>${Utils.formatCurrency(report.adjustedExpected)}</strong></td></tr>
                        ` : ''}
                        <tr style="border-top: 2px solid #333;"><td style="padding: 8px;"><strong>Actual Cash</strong></td><td style="padding: 8px; text-align: right;"><strong>${Utils.formatCurrency(report.actualCash)}</strong></td></tr>
                    </table>
                </div>
                
                <div style="text-align: center; padding: 20px; border-radius: 8px; ${report.balanceStatus === 'balanced' ? 'background: #d4edda; color: #155724;' : report.balanceStatus === 'over' ? 'background: #fff3cd; color: #856404;' : 'background: #f8d7da; color: #721c24;'}">
                    <h2 style="margin: 0;">
                        ${report.balanceStatus === 'balanced' ? '✅ BALANCED' : report.balanceStatus === 'over' ? `⬆️ OVER: ${Utils.formatCurrency(report.variance)}` : `⬇️ SHORT: ${Utils.formatCurrency(Math.abs(report.variance))}`}
                    </h2>
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #999; font-size: 0.9em;">
                    <p>Report generated: ${dateStr} ${timeStr}</p>
                    <p>BreadHub POS System</p>
                </div>
            </div>
        `;
        
        // Show report modal with print/email options
        Modal.open({
            title: '📄 Shift Report Generated',
            content: `
                <div class="report-preview">
                    ${reportHTML}
                </div>
                <div class="report-actions">
                    <button class="btn btn-primary" onclick="Auth.printReport()">🖨️ Print Report</button>
                    <button class="btn btn-secondary" onclick="Auth.emailReport()">📧 Email Report</button>
                    <button class="btn btn-success" onclick="Auth.finishAndLogout()">✅ Done & Logout</button>
                </div>
            `,
            hideFooter: true
        });
        
        // Store HTML for printing/emailing
        this.reportHTML = reportHTML;
        this.reportData = report;
    },
    
    printReport() {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>Shift Report - BreadHub</title></head>
            <body>${this.reportHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    },
    
    async emailReport() {
        const shift = this.currentShift;
        const report = this.reportData;
        
        // Create email content
        const subject = `BreadHub Shift Report - Shift #${shift.shiftNumber} - ${shift.staffName} - ${shift.dateKey}`;
        const body = `
Shift End Report - BreadHub POS

Shift #: ${shift.shiftNumber}
Cashier: ${shift.staffName}
Date: ${shift.dateKey}
Start: ${Utils.formatTime(shift.startTime)}
End: ${Utils.formatTime(report.endTime)}

SALES SUMMARY
─────────────────
Cash Sales: ${Utils.formatCurrency(report.cashSales)}
GCash Sales: ${Utils.formatCurrency(report.gcashSales)}
${report.otherSales > 0 ? `Other: ${Utils.formatCurrency(report.otherSales)}` : ''}
TOTAL: ${Utils.formatCurrency(report.totalSales)}
Transactions: ${report.transactionCount}

CASH RECONCILIATION
─────────────────
Starting Cash: ${Utils.formatCurrency(report.startingCash)}
+ Cash Sales: ${Utils.formatCurrency(report.cashSales)}
Expected: ${Utils.formatCurrency(report.expectedCash)}
${report.expenses > 0 ? `- Expenses: ${Utils.formatCurrency(report.expenses)} (${report.expenseNotes})` : ''}
Actual Cash: ${Utils.formatCurrency(report.actualCash)}

STATUS: ${report.balanceStatus.toUpperCase()}${report.balanceStatus !== 'balanced' ? ` (${Utils.formatCurrency(Math.abs(report.variance))})` : ''}

---
BreadHub POS System
        `.trim();
        
        // Open email client
        const mailtoLink = `mailto:michael.marga@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink);
        
        Toast.success('Email client opened');
    },
    
    finishAndLogout() {
        Modal.close();
        Toast.success('Shift ended successfully!');
        this.logout();
    },
    
    // ========== ADMIN LOGIN (Firebase) ==========
    
    async adminLogin() {
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;
        
        if (!email || !password) {
            Toast.error('Enter email and password');
            return;
        }
        
        try {
            const result = await auth.signInWithEmailAndPassword(email, password);
            const doc = await db.collection('users').doc(result.user.uid).get();
            
            if (doc.exists) {
                const userData = doc.data();
                if (userData.role === 'admin' || userData.role === 'owner') {
                    this.currentUser = result.user;
                    this.userData = { id: doc.id, ...userData, isAdmin: true };
                    localStorage.setItem('pos_staff', JSON.stringify(this.userData));
                    
                    // Admin doesn't need shift
                    this.currentShift = { id: 'admin', staffName: userData.name, isAdmin: true };
                    localStorage.setItem('pos_shift', JSON.stringify(this.currentShift));
                    
                    Toast.success(`Welcome, ${userData.name}!`);
                    this.showPOS();
                } else {
                    Toast.error('Admin access required');
                    await auth.signOut();
                }
            }
        } catch (error) {
            console.error('Admin login error:', error);
            Toast.error(error.message || 'Login failed');
        }
    },
    
    // ========== LOGOUT ==========
    
    logout() {
        this.currentUser = null;
        this.userData = null;
        this.currentShift = null;
        localStorage.removeItem('pos_staff');
        localStorage.removeItem('pos_shift');
        
        if (auth.currentUser) {
            auth.signOut();
        }
        
        this.showLogin();
    },
    
    // ========== UI HELPERS ==========
    
    showLogin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('posContainer').style.display = 'none';
    },
    
    showPOS() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('posContainer').style.display = 'block';
        
        // Update header with staff info
        const nameEl = document.getElementById('currentUserName');
        if (nameEl && this.userData) {
            nameEl.textContent = this.userData.name;
        }
        
        // Update shift indicator
        this.updateShiftIndicator();
        
        App.loadData();
    },
    
    updateShiftIndicator() {
        let indicator = document.getElementById('shiftIndicator');
        if (!indicator) {
            // Create shift indicator in header
            const header = document.querySelector('.pos-header .header-right');
            if (header) {
                indicator = document.createElement('div');
                indicator.id = 'shiftIndicator';
                indicator.className = 'shift-indicator';
                header.insertBefore(indicator, header.firstChild);
            }
        }
        
        if (indicator && this.currentShift) {
            if (this.currentShift.isViewOnly) {
                indicator.innerHTML = `
                    <span class="view-only-badge">👁️ View Only</span>
                    <button class="btn btn-sm btn-primary" onclick="Auth.switchToShift()">Start Shift</button>
                `;
            } else if (this.currentShift.isAdmin) {
                indicator.innerHTML = `<span class="admin-badge">👑 Admin Mode</span>`;
            } else {
                indicator.innerHTML = `
                    <span class="shift-badge">Shift #${this.currentShift.shiftNumber}</span>
                    <button class="btn btn-sm btn-outline" onclick="Auth.endShift()">End Shift</button>
                `;
            }
        }
    },
    
    // Switch from view-only to active shift
    async switchToShift() {
        this.showShiftStartModal();
    },
    
    hasRole(role) {
        if (!this.userData) return false;
        
        // Admin/owner has all permissions
        if (this.userData.isAdmin || this.userData.role === 'owner' || this.userData.role === 'admin') {
            return true;
        }
        
        const roles = ['cashier', 'baker', 'manager', 'admin', 'owner'];
        const userRoleIndex = roles.indexOf(this.userData.role || 'cashier');
        const requiredIndex = roles.indexOf(role);
        return userRoleIndex >= requiredIndex;
    },
    
    // Get current shift ID for linking sales
    getShiftId() {
        return this.currentShift?.id || null;
    }
};
