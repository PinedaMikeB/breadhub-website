/**
 * BreadHub POS - Authentication v10
 * PIN-based login for cashiers with shift management
 * 
 * CHANGE FUND RULES:
 * - Change fund is FIXED and set by Owner/Manager
 * - Can only be INCREASED (bank withdrawal, etc.) - never reduced
 * - Must be handed over exactly as-is between shifts
 * - Starting cash is REQUIRED, not optional
 */

const Auth = {
    currentUser: null,      // Firebase auth user (for admins)
    userData: null,         // Current staff member data
    currentShift: null,     // Active shift
    changeFund: 0,          // Store's fixed change fund amount
    
    async init() {
        // Load store settings including change fund
        await this.loadStoreSettings();
        
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
    
    async loadStoreSettings() {
        try {
            const settings = await DB.get('settings', 'pos');
            if (settings) {
                this.changeFund = settings.changeFund || 1000; // Default ₱1,000
            } else {
                // Create default settings if not exists
                this.changeFund = 1000;
            }
        } catch (error) {
            console.log('Using default change fund');
            this.changeFund = 1000;
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
            
            // Check for unclosed shifts for this staff member
            const unclosedShifts = await this.getUnclosedShifts(staff.id);
            
            if (unclosedShifts.length > 0) {
                // Show unclosed shift options
                this.showUnclosedShiftModal(unclosedShifts);
            } else if (staff.role === 'owner' || staff.role === 'manager') {
                // Owners/Managers can skip shift, others must start shift
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
    
    // ========== UNCLOSED SHIFT HANDLING ==========
    
    async getUnclosedShifts(staffId) {
        // Query shifts that are 'active' or 'draft' for this staff member
        const allShifts = await DB.getAll('shifts');
        return allShifts.filter(s => 
            s.staffId === staffId && 
            (s.status === 'active' || s.status === 'draft')
        ).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    },
    
    showUnclosedShiftModal(unclosedShifts) {
        const shift = unclosedShifts[0]; // Most recent unclosed shift
        const statusLabel = shift.status === 'draft' ? '📋 Draft (needs finalization)' : '⚠️ Still Active';
        const statusClass = shift.status === 'draft' ? 'draft' : 'active';
        
        Modal.open({
            title: '⚠️ Unclosed Shift Found',
            content: `
                <div class="unclosed-shift-info">
                    <div class="shift-alert ${statusClass}">
                        <p>You have an unclosed shift that needs attention:</p>
                    </div>
                    
                    <div class="unclosed-shift-details">
                        <div class="detail-row">
                            <span class="label">Shift #:</span>
                            <span class="value">${shift.shiftNumber}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Date:</span>
                            <span class="value">${shift.dateKey}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Start Time:</span>
                            <span class="value">${Utils.formatTime(shift.startTime)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Status:</span>
                            <span class="value status-${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="detail-row">
                            <span class="label">Starting Cash:</span>
                            <span class="value">${Utils.formatCurrency(shift.startingCash || 0)}</span>
                        </div>
                    </div>
                    
                    <div class="unclosed-shift-options">
                        <p><strong>What would you like to do?</strong></p>
                    </div>
                </div>
            `,
            hideFooter: true,
            customFooter: `
                <div class="unclosed-shift-buttons">
                    <button class="btn btn-primary btn-lg" onclick="Auth.resumeShift('${shift.id}')">
                        ▶️ Resume This Shift
                    </button>
                    <button class="btn btn-warning btn-lg" onclick="Auth.showEndShiftForUnclosed('${shift.id}')">
                        🏁 Close This Shift
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="Auth.logout(); Modal.close();">
                        Cancel & Logout
                    </button>
                </div>
            `
        });
    },
    
    async resumeShift(shiftId) {
        try {
            const shift = await DB.get('shifts', shiftId);
            if (!shift) {
                Toast.error('Shift not found');
                return;
            }
            
            // If shift was draft, reactivate it
            if (shift.status === 'draft') {
                await DB.update('shifts', shiftId, { status: 'active' });
                shift.status = 'active';
            }
            
            this.currentShift = { id: shiftId, ...shift };
            localStorage.setItem('pos_shift', JSON.stringify(this.currentShift));
            
            Modal.close();
            Toast.success(`Resumed Shift #${shift.shiftNumber}`);
            this.showPOS();
            
        } catch (error) {
            console.error('Error resuming shift:', error);
            Toast.error('Failed to resume shift');
        }
    },
    
    async showEndShiftForUnclosed(shiftId) {
        try {
            const shift = await DB.get('shifts', shiftId);
            if (!shift) {
                Toast.error('Shift not found');
                return;
            }
            
            // Temporarily set as current shift to use endShift flow
            this.currentShift = { id: shiftId, ...shift };
            localStorage.setItem('pos_shift', JSON.stringify(this.currentShift));
            
            Modal.close();
            
            // Small delay then show end shift
            setTimeout(() => {
                this.endShift();
            }, 300);
            
        } catch (error) {
            console.error('Error:', error);
            Toast.error('Failed to load shift');
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
    
    async showShiftStartModal() {
        // Check if there's a pending handover from previous cashier
        const pendingHandover = await this.getPendingHandover();
        
        if (pendingHandover) {
            // Show handover verification modal
            this.showHandoverVerificationModal(pendingHandover);
        } else {
            // Normal shift start (no handover)
            this.showNormalShiftStartModal();
        }
    },
    
    async getPendingHandover() {
        try {
            // Find the most recent draft shift with handover data
            const allShifts = await DB.getAll('shifts');
            const today = Utils.getTodayKey();
            
            // Look for draft shifts from today or yesterday with handover cash
            const draftShifts = allShifts.filter(s => 
                s.status === 'draft' && 
                s.handoverCash > 0 &&
                !s.handoverReceivedBy // Not yet received by another cashier
            ).sort((a, b) => new Date(b.handoverTime) - new Date(a.handoverTime));
            
            return draftShifts.length > 0 ? draftShifts[0] : null;
        } catch (error) {
            console.error('Error checking handover:', error);
            return null;
        }
    },
    
    showHandoverVerificationModal(previousShift) {
        Modal.open({
            title: '🤝 Receive Cash Handover',
            content: `
                <div class="handover-receive-info">
                    <div class="staff-welcome">
                        <div class="staff-avatar">${this.userData.name.charAt(0).toUpperCase()}</div>
                        <div>
                            <h3>${this.userData.name}</h3>
                            <span class="role-badge">${this.userData.role}</span>
                        </div>
                    </div>
                    
                    <div class="handover-from">
                        <h4>📋 Receiving handover from:</h4>
                        <div class="previous-cashier-info">
                            <p><strong>${previousShift.staffName}</strong> (Shift #${previousShift.shiftNumber})</p>
                            <p>Handed over at: ${Utils.formatTime(previousShift.handoverTime)}</p>
                        </div>
                    </div>
                    
                    <div class="handover-declared">
                        <h4>💰 Declared Handover Amount:</h4>
                        <div class="declared-amount">${Utils.formatCurrency(previousShift.handoverCash)}</div>
                        ${previousShift.handoverVariance && Math.abs(previousShift.handoverVariance) >= 1 ? `
                            <p class="outgoing-variance">
                                ⚠️ ${previousShift.staffName} reported ${previousShift.handoverVariance > 0 ? 'OVER' : 'SHORT'} 
                                ${Utils.formatCurrency(Math.abs(previousShift.handoverVariance))}
                            </p>
                        ` : ''}
                    </div>
                    
                    <div class="form-group">
                        <label>💵 Actual Cash You Received</label>
                        <input type="number" id="receivedCash" class="form-input form-input-lg" 
                               placeholder="Count and enter amount" step="0.01"
                               oninput="Auth.calculateReceivedVariance(${previousShift.handoverCash})">
                        <small class="form-hint">Count the cash carefully before confirming</small>
                    </div>
                    
                    <div id="receivedVarianceDisplay" class="variance-display">
                        Enter the cash you received above
                    </div>
                </div>
            `,
            customFooter: `
                <div class="handover-footer">
                    <button class="btn btn-success btn-lg" onclick="Auth.confirmHandoverReceived('${previousShift.id}', ${previousShift.handoverCash})">
                        ✅ Confirm & Start Shift
                    </button>
                    <button class="btn btn-outline" onclick="Auth.skipHandover('${previousShift.id}')">
                        Skip (No Handover)
                    </button>
                </div>
            `,
            hideFooter: true
        });
    },
    
    calculateReceivedVariance(declared) {
        const received = parseFloat(document.getElementById('receivedCash')?.value) || 0;
        const variance = received - declared;
        
        const display = document.getElementById('receivedVarianceDisplay');
        
        if (received === 0) {
            display.innerHTML = 'Enter the cash you received above';
            return;
        }
        
        let status, statusClass;
        if (Math.abs(variance) < 1) {
            status = '✅ MATCHES - No discrepancy';
            statusClass = 'balanced';
        } else if (variance > 0) {
            status = `⬆️ RECEIVED MORE by ${Utils.formatCurrency(variance)}`;
            statusClass = 'over';
        } else {
            status = `⬇️ RECEIVED LESS by ${Utils.formatCurrency(Math.abs(variance))}`;
            statusClass = 'short';
        }
        
        display.innerHTML = `<div class="variance-status ${statusClass}">${status}</div>`;
    },
    
    async confirmHandoverReceived(previousShiftId, declaredAmount) {
        const receivedCash = parseFloat(document.getElementById('receivedCash')?.value) || 0;
        
        if (receivedCash <= 0) {
            Toast.error('Please enter the cash amount you received');
            return;
        }
        
        const handoverVariance = receivedCash - declaredAmount;
        
        try {
            // Update previous shift to mark handover as received
            await DB.update('shifts', previousShiftId, {
                handoverReceivedBy: this.userData.name,
                handoverReceivedById: this.userData.id,
                handoverReceivedAmount: receivedCash,
                handoverReceivedTime: new Date().toISOString(),
                handoverReceivedVariance: handoverVariance
            });
            
            // Log discrepancy if any
            if (Math.abs(handoverVariance) >= 1) {
                const previousShift = await DB.get('shifts', previousShiftId);
                await this.logHandoverDiscrepancy({
                    type: 'incoming',
                    shiftId: previousShiftId,
                    shiftNumber: previousShift.shiftNumber,
                    dateKey: previousShift.dateKey,
                    outgoingCashier: previousShift.staffName,
                    incomingCashier: this.userData.name,
                    declared: declaredAmount,
                    received: receivedCash,
                    variance: handoverVariance,
                    timestamp: new Date().toISOString()
                });
            }
            
            Modal.close();
            
            // Now start the new shift with received cash as starting cash
            await this.createNewShift(receivedCash, previousShiftId);
            
        } catch (error) {
            console.error('Error confirming handover:', error);
            Toast.error('Failed to confirm handover');
        }
    },
    
    async skipHandover(previousShiftId) {
        // Only Owner/Manager can skip handover
        if (this.userData.role !== 'owner' && this.userData.role !== 'manager') {
            Toast.error('Only Owner/Manager can skip handover verification');
            return;
        }
        
        // Mark the handover as skipped
        await DB.update('shifts', previousShiftId, {
            handoverSkipped: true,
            handoverSkippedBy: this.userData.name,
            handoverSkippedTime: new Date().toISOString()
        });
        
        Modal.close();
        this.showNormalShiftStartModal();
    },
    
    showNormalShiftStartModal() {
        const isCashier = this.userData.role === 'cashier';
        const canCancel = !isCashier; // Only owner/manager can cancel
        
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
                    
                    <div class="change-fund-info">
                        <h4>💰 Change Fund</h4>
                        <p>Standard Change Fund: <strong>${Utils.formatCurrency(this.changeFund)}</strong></p>
                        <small>This amount must be in the cash drawer before starting.</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Starting Cash (Count your drawer) <span class="required">*</span></label>
                        <input type="number" id="startingCash" class="form-input form-input-lg" 
                               placeholder="Enter exact amount" step="0.01" required
                               value="${this.changeFund}">
                        <small class="form-hint">Must match or exceed the change fund of ${Utils.formatCurrency(this.changeFund)}</small>
                    </div>
                    
                    <div id="startingCashWarning" class="starting-cash-warning" style="display: none;">
                        ⚠️ Starting cash is below the required change fund!
                    </div>
                </div>
            `,
            saveText: '▶️ Start Shift',
            cancelText: canCancel ? 'Cancel' : null,
            onSave: async () => {
                const startingCash = parseFloat(document.getElementById('startingCash')?.value) || 0;
                
                // Validate starting cash
                if (startingCash <= 0) {
                    Toast.error('Starting cash is required');
                    return false; // Prevent modal close
                }
                
                if (startingCash < this.changeFund) {
                    // Warn but allow if owner/manager
                    if (isCashier) {
                        Toast.error(`Starting cash must be at least ${Utils.formatCurrency(this.changeFund)}`);
                        return false;
                    } else {
                        // Owner/manager can override
                        if (!confirm(`Starting cash is below the standard change fund. Continue anyway?`)) {
                            return false;
                        }
                    }
                }
                
                await this.createNewShift(startingCash, null);
            },
            onCancel: canCancel ? () => {
                this.logout();
            } : null
        });
        
        // Add input validation listener
        setTimeout(() => {
            const input = document.getElementById('startingCash');
            if (input) {
                input.addEventListener('input', () => {
                    const val = parseFloat(input.value) || 0;
                    const warning = document.getElementById('startingCashWarning');
                    if (warning) {
                        warning.style.display = val < this.changeFund ? 'block' : 'none';
                    }
                });
            }
        }, 100);
    },
    
    async createNewShift(startingCash, previousShiftId) {
        const today = Utils.getTodayKey();
        
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
                previousShiftId: previousShiftId, // Link to handover source
                endTime: null,
                endingCash: null,
                totalSales: 0,
                transactionCount: 0,
                status: 'active'
            };
            
            const shiftId = await DB.add('shifts', shiftData);
            this.currentShift = { id: shiftId, ...shiftData };
            localStorage.setItem('pos_shift', JSON.stringify(this.currentShift));
            
            Toast.success(`Shift #${shiftNumber} started with ${Utils.formatCurrency(startingCash)}!`);
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
            width: '95vw',
            content: `
                <div class="shift-end-layout">
                    <!-- LEFT SIDE: Scrollable Data -->
                    <div class="shift-end-left">
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
                                    Expected Cash: <strong>${Utils.formatCurrency(expectedCash)}</strong>
                                    <small>(₱${(this.currentShift.startingCash || 0).toLocaleString()} + ₱${cashSales.toLocaleString()})</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>Actual Cash Count</label>
                                    <input type="number" id="actualCash" class="form-input form-input-lg" placeholder="Count your drawer" step="0.01" oninput="Auth.calculateVariance()">
                                </div>
                                
                                <div id="varianceDisplay" class="variance-display">
                                    Enter actual cash count above
                                </div>
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
                        </div>
                    </div>
                    
                    <!-- RIGHT SIDE: Fixed Actions -->
                    <div class="shift-end-right">
                        <div class="end-shift-actions">
                            <button class="btn btn-success btn-xl" onclick="Auth.finalizeEndShift()">
                                ✅ End Shift & Generate Report
                            </button>
                            
                            <div class="draft-close-box">
                                <p>Need to let another cashier start?</p>
                                <button class="btn btn-warning btn-lg" onclick="Auth.draftCloseShift()">
                                    📋 Draft Close (Finalize Later)
                                </button>
                            </div>
                            
                            <button class="btn btn-outline btn-lg" onclick="Modal.close()">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `,
            hideFooter: true
        });
        
        // Initialize expenses array
        this.shiftExpenses = [];
    },
    
    // ========== DRAFT CLOSE ==========
    
    async draftCloseShift() {
        if (!this.currentShift || !this.endShiftData) {
            Toast.error('No shift data available');
            return;
        }
        
        // Show draft close options modal
        Modal.close();
        setTimeout(() => {
            this.showDraftCloseModal();
        }, 300);
    },
    
    showDraftCloseModal() {
        const { cashSales, gcashSales, totalSales, transactionCount, expectedCash } = this.endShiftData;
        const expensesData = this.getExpensesData();
        const totalExpenses = expensesData.reduce((sum, e) => sum + e.amount, 0);
        const changeFund = this.changeFund;
        
        // Cash to remit = Cash Sales - Expenses (this goes with the report)
        const cashToRemit = cashSales - totalExpenses;
        
        Modal.open({
            title: '📋 Draft Close Shift',
            width: '90vw',
            content: `
                <div class="draft-close-layout">
                    <div class="draft-close-left">
                        <div class="draft-summary-section">
                            <h4>📊 Shift Summary</h4>
                            <div class="summary-grid-compact">
                                <div class="summary-item">
                                    <span class="label">Cashier</span>
                                    <span class="value">${this.currentShift.staffName}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="label">Shift #</span>
                                    <span class="value">${this.currentShift.shiftNumber}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="label">Date</span>
                                    <span class="value">${this.currentShift.dateKey}</span>
                                </div>
                                <div class="summary-item">
                                    <span class="label">Transactions</span>
                                    <span class="value">${transactionCount}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="cash-breakdown-section">
                            <h4>💰 Cash Breakdown</h4>
                            <div class="breakdown-table">
                                <div class="breakdown-row">
                                    <span>💵 Cash Sales:</span>
                                    <span class="amount">${Utils.formatCurrency(cashSales)}</span>
                                </div>
                                <div class="breakdown-row">
                                    <span>📱 GCash Sales:</span>
                                    <span class="amount">${Utils.formatCurrency(gcashSales)}</span>
                                </div>
                                ${totalExpenses > 0 ? `
                                <div class="breakdown-row expense">
                                    <span>🛒 Expenses:</span>
                                    <span class="amount">-${Utils.formatCurrency(totalExpenses)}</span>
                                </div>
                                ` : ''}
                                <div class="breakdown-row total">
                                    <span>Total Sales:</span>
                                    <span class="amount">${Utils.formatCurrency(totalSales)}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="remittance-section">
                            <h4>💵 Cash to Remit (with Report)</h4>
                            <div class="remit-amount">${Utils.formatCurrency(cashToRemit)}</div>
                            <small>Cash Sales (${Utils.formatCurrency(cashSales)}) - Expenses (${Utils.formatCurrency(totalExpenses)})</small>
                        </div>
                        
                        <div class="change-fund-section">
                            <h4>🔄 Change Fund to Leave in Drawer</h4>
                            <div class="change-fund-amount">${Utils.formatCurrency(changeFund)}</div>
                            <small>This stays in the drawer for the next shift</small>
                        </div>
                    </div>
                    
                    <div class="draft-close-right">
                        <div class="draft-close-actions">
                            <h4>Choose Action:</h4>
                            
                            <button class="btn btn-primary btn-lg action-btn" onclick="Auth.emailDraftReport()">
                                📧 Email Report to Owner
                            </button>
                            
                            <button class="btn btn-success btn-lg action-btn" onclick="Auth.saveDraftAndClose()">
                                💾 Save Draft & Logout
                            </button>
                            
                            <button class="btn btn-secondary btn-lg action-btn" onclick="Auth.printBlankCashierForm()">
                                🖨️ Print Blank Cashier Form
                            </button>
                            
                            <div class="handover-confirm-section">
                                <h5>🤝 Confirm Change Fund Handover</h5>
                                <div class="form-group">
                                    <label>Change Fund Left in Drawer</label>
                                    <input type="number" id="changeFundLeft" class="form-input" 
                                           value="${changeFund}" step="0.01">
                                </div>
                                <div id="changeFundStatus" class="fund-status"></div>
                            </div>
                            
                            <button class="btn btn-warning btn-xl action-btn" onclick="Auth.confirmDraftClose()">
                                ✅ Confirm Draft Close
                            </button>
                            
                            <button class="btn btn-outline" onclick="Auth.cancelDraftClose()">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `,
            hideFooter: true
        });
        
        // Store data for later
        this.draftCloseData = {
            cashSales,
            gcashSales,
            totalSales,
            totalExpenses,
            cashToRemit,
            changeFund,
            transactionCount,
            expensesData
        };
        
        // Add change fund validation listener
        setTimeout(() => {
            const input = document.getElementById('changeFundLeft');
            if (input) {
                input.addEventListener('input', () => this.validateChangeFund());
                this.validateChangeFund();
            }
        }, 100);
    },
    
    validateChangeFund() {
        const input = document.getElementById('changeFundLeft');
        const status = document.getElementById('changeFundStatus');
        const value = parseFloat(input?.value) || 0;
        const expected = this.changeFund;
        
        if (Math.abs(value - expected) < 1) {
            status.innerHTML = '<span class="status-ok">✅ Change fund correct</span>';
            status.className = 'fund-status ok';
        } else if (value < expected) {
            status.innerHTML = `<span class="status-short">⚠️ SHORT by ${Utils.formatCurrency(expected - value)}</span>`;
            status.className = 'fund-status short';
        } else {
            status.innerHTML = `<span class="status-over">⬆️ OVER by ${Utils.formatCurrency(value - expected)}</span>`;
            status.className = 'fund-status over';
        }
    },
    
    async emailDraftReport() {
        const data = this.draftCloseData;
        const shift = this.currentShift;
        
        // Generate email content
        const subject = encodeURIComponent(`📋 Draft Shift Report - ${shift.staffName} - Shift #${shift.shiftNumber} - ${shift.dateKey}`);
        const body = encodeURIComponent(`
DRAFT SHIFT REPORT
==================
Cashier: ${shift.staffName}
Shift #: ${shift.shiftNumber}
Date: ${shift.dateKey}
Start Time: ${Utils.formatTime(shift.startTime)}
Draft Time: ${new Date().toLocaleTimeString()}

SALES SUMMARY
-------------
Cash Sales: ₱${data.cashSales.toLocaleString()}
GCash Sales: ₱${data.gcashSales.toLocaleString()}
Total Sales: ₱${data.totalSales.toLocaleString()}
Transactions: ${data.transactionCount}

EXPENSES
--------
Total Expenses: ₱${data.totalExpenses.toLocaleString()}
${data.expensesData.map(e => `- ${e.itemName}: ₱${e.amount.toLocaleString()}`).join('\n')}

CASH SUMMARY
------------
Cash to Remit: ₱${data.cashToRemit.toLocaleString()}
Change Fund Left: ₱${data.changeFund.toLocaleString()}

Status: DRAFT - Pending Finalization
        `);
        
        window.open(`mailto:michael.marga@gmail.com?subject=${subject}&body=${body}`);
        Toast.success('Email client opened');
    },
    
    async printBlankCashierForm() {
        // Generate blank cashier form PDF
        const shift = this.currentShift;
        const today = new Date().toLocaleDateString('en-PH');
        
        const blankFormHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Blank Cashier Form</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { text-align: center; margin-bottom: 5px; }
                    h2 { text-align: center; color: #666; margin-top: 0; }
                    .header-info { display: flex; justify-content: space-between; margin: 20px 0; }
                    .field { margin: 15px 0; }
                    .field label { display: block; font-weight: bold; margin-bottom: 5px; }
                    .field .line { border-bottom: 1px solid #000; height: 25px; }
                    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .section { border: 1px solid #000; padding: 15px; margin: 15px 0; }
                    .section h3 { margin-top: 0; background: #f0f0f0; padding: 5px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
                    .signature-box { width: 200px; text-align: center; }
                    .signature-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 5px; }
                </style>
            </head>
            <body>
                <h1>🍞 BreadHub</h1>
                <h2>Cashier Shift Report Form</h2>
                
                <div class="header-info">
                    <div class="field">
                        <label>Date:</label>
                        <div class="line" style="width: 150px;">${today}</div>
                    </div>
                    <div class="field">
                        <label>Shift #:</label>
                        <div class="line" style="width: 100px;">${shift?.shiftNumber || '___'}</div>
                    </div>
                    <div class="field">
                        <label>Cashier Name:</label>
                        <div class="line" style="width: 200px;">${shift?.staffName || ''}</div>
                    </div>
                </div>
                
                <div class="two-col">
                    <div class="field">
                        <label>Start Time:</label>
                        <div class="line"></div>
                    </div>
                    <div class="field">
                        <label>End Time:</label>
                        <div class="line"></div>
                    </div>
                </div>
                
                <div class="section">
                    <h3>💰 Sales Summary</h3>
                    <table>
                        <tr><td>Cash Sales</td><td style="width:150px;">₱ ________________</td></tr>
                        <tr><td>GCash Sales</td><td>₱ ________________</td></tr>
                        <tr><td>Other Payment</td><td>₱ ________________</td></tr>
                        <tr><td><strong>TOTAL SALES</strong></td><td><strong>₱ ________________</strong></td></tr>
                    </table>
                </div>
                
                <div class="section">
                    <h3>🛒 Expenses / Emergency Purchases</h3>
                    <table>
                        <tr><th>Item</th><th>Supplier</th><th>Qty</th><th>Amount</th></tr>
                        <tr><td>&nbsp;</td><td></td><td></td><td>₱</td></tr>
                        <tr><td>&nbsp;</td><td></td><td></td><td>₱</td></tr>
                        <tr><td>&nbsp;</td><td></td><td></td><td>₱</td></tr>
                        <tr><td>&nbsp;</td><td></td><td></td><td>₱</td></tr>
                        <tr><td colspan="3"><strong>TOTAL EXPENSES</strong></td><td><strong>₱ ________</strong></td></tr>
                    </table>
                </div>
                
                <div class="section">
                    <h3>🧮 Cash Reconciliation</h3>
                    <table>
                        <tr><td>Starting Cash (Change Fund)</td><td style="width:150px;">₱ ________________</td></tr>
                        <tr><td>+ Cash Sales</td><td>₱ ________________</td></tr>
                        <tr><td>- Expenses</td><td>₱ ________________</td></tr>
                        <tr><td><strong>Expected Cash</strong></td><td><strong>₱ ________________</strong></td></tr>
                        <tr><td>Actual Cash Count</td><td>₱ ________________</td></tr>
                        <tr><td><strong>Variance (Short/Over)</strong></td><td><strong>₱ ________________</strong></td></tr>
                    </table>
                </div>
                
                <div class="section">
                    <h3>💵 Cash Remittance</h3>
                    <table>
                        <tr><td>Cash to Remit (with report)</td><td style="width:150px;">₱ ________________</td></tr>
                        <tr><td>Change Fund Left in Drawer</td><td>₱ ________________</td></tr>
                    </table>
                </div>
                
                <div class="signature-section">
                    <div class="signature-box">
                        <div class="signature-line">Cashier Signature</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-line">Verified By</div>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        // Open print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(blankFormHTML);
        printWindow.document.close();
        printWindow.print();
        
        Toast.success('Blank form opened for printing');
    },
    
    async saveDraftAndClose() {
        await this.confirmDraftClose();
        // Logout after saving
        this.logout();
    },
    
    cancelDraftClose() {
        Modal.close();
        setTimeout(() => this.endShift(), 300);
    },
    
    async confirmDraftClose() {
        const changeFundLeft = parseFloat(document.getElementById('changeFundLeft')?.value) || 0;
        const data = this.draftCloseData;
        
        try {
            // Update shift to draft status with all data
            await DB.update('shifts', this.currentShift.id, {
                status: 'draft',
                draftTime: new Date().toISOString(),
                
                // Sales data
                cashSales: data.cashSales,
                gcashSales: data.gcashSales,
                totalSales: data.totalSales,
                transactionCount: data.transactionCount,
                
                // Expenses
                draftExpenses: data.expensesData,
                draftExpensesTotal: data.totalExpenses,
                
                // Cash handling
                cashToRemit: data.cashToRemit,
                changeFundLeft: changeFundLeft,
                changeFundVariance: changeFundLeft - data.changeFund,
                
                // Expected values
                expectedCash: (this.currentShift.startingCash || 0) + data.cashSales - data.totalExpenses
            });
            
            // Log discrepancy if change fund doesn't match
            if (Math.abs(changeFundLeft - data.changeFund) >= 1) {
                await DB.add('handoverDiscrepancies', {
                    type: 'change_fund',
                    shiftId: this.currentShift.id,
                    shiftNumber: this.currentShift.shiftNumber,
                    dateKey: this.currentShift.dateKey,
                    cashier: this.currentShift.staffName,
                    expected: data.changeFund,
                    actual: changeFundLeft,
                    variance: changeFundLeft - data.changeFund,
                    timestamp: new Date().toISOString()
                });
            }
            
            Toast.success('Draft saved! You can finalize later on Mac Mini.');
            Modal.close();
            
            // Clear current shift from local storage
            localStorage.removeItem('pos_shift');
            this.currentShift = null;
            
        } catch (error) {
            console.error('Error saving draft:', error);
            Toast.error('Failed to save draft');
        }
    },
    
    // Keep logHandoverDiscrepancy for general discrepancy tracking
    async logHandoverDiscrepancy(data) {
        try {
            await DB.add('handoverDiscrepancies', data);
        } catch (error) {
            console.error('Error logging discrepancy:', error);
        }
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
        if (!dropdown) return;
        
        // Ensure suppliers list is loaded
        if (!this.suppliersList || this.suppliersList.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-empty">Loading suppliers...</div>';
            dropdown.classList.add('show');
            
            // Try to load suppliers
            DB.getAll('suppliers').then(suppliers => {
                this.suppliersList = suppliers.map(s => ({ id: s.id, name: s.name }));
                this.filterSuppliers(expenseId, '');
            }).catch(err => {
                console.error('Failed to load suppliers:', err);
                dropdown.innerHTML = '<div class="dropdown-empty">No suppliers found. Type to add new.</div>';
            });
            return;
        }
        
        this.filterSuppliers(expenseId, '');
        dropdown.classList.add('show');
    },
    
    filterSuppliers(expenseId, query) {
        const dropdown = document.getElementById(`supplier-dropdown-${expenseId}`);
        if (!dropdown) return;
        
        const q = (query || '').toLowerCase();
        
        // Handle case where suppliers list isn't loaded yet
        if (!this.suppliersList) {
            this.suppliersList = [];
        }
        
        const filtered = this.suppliersList.filter(s => 
            s.name && s.name.toLowerCase().includes(q)
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
            } else if (this.currentShift.status === 'draft') {
                // Resumed draft shift
                indicator.innerHTML = `
                    <span class="draft-badge">📋 Shift #${this.currentShift.shiftNumber} (Draft)</span>
                    <button class="btn btn-sm btn-warning" onclick="Auth.endShift()">Finalize</button>
                `;
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
    },
    
    // ========== CHANGE FUND MANAGEMENT (Owner/Manager Only) ==========
    
    async showChangeFundSettings() {
        if (!this.hasRole('manager')) {
            Toast.error('Only Owner/Manager can adjust change fund');
            return;
        }
        
        Modal.open({
            title: '💰 Change Fund Settings',
            content: `
                <div class="change-fund-settings">
                    <div class="current-fund">
                        <p>Current Change Fund:</p>
                        <div class="fund-amount">${Utils.formatCurrency(this.changeFund)}</div>
                    </div>
                    
                    <div class="form-group">
                        <label>New Change Fund Amount</label>
                        <input type="number" id="newChangeFund" class="form-input form-input-lg" 
                               value="${this.changeFund}" step="100" min="${this.changeFund}">
                        <small class="form-hint">Can only be increased, never decreased.</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Source of Additional Funds</label>
                        <select id="fundSource" class="form-input">
                            <option value="bank">Bank Withdrawal</option>
                            <option value="owner">Owner Capital</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Notes (Optional)</label>
                        <input type="text" id="fundNotes" class="form-input" placeholder="Reason for increase">
                    </div>
                </div>
            `,
            saveText: '💾 Update Change Fund',
            onSave: async () => {
                await this.updateChangeFund();
            }
        });
    },
    
    async updateChangeFund() {
        const newAmount = parseFloat(document.getElementById('newChangeFund')?.value) || 0;
        const source = document.getElementById('fundSource')?.value || 'other';
        const notes = document.getElementById('fundNotes')?.value || '';
        
        if (newAmount < this.changeFund) {
            Toast.error('Change fund can only be increased, not decreased');
            return false;
        }
        
        if (newAmount === this.changeFund) {
            Toast.info('No change made');
            return;
        }
        
        try {
            // Update settings
            await DB.update('settings', 'pos', {
                changeFund: newAmount,
                changeFundUpdatedAt: new Date().toISOString(),
                changeFundUpdatedBy: this.userData.name
            });
            
            // Log the change
            await DB.add('changeFundHistory', {
                previousAmount: this.changeFund,
                newAmount: newAmount,
                increase: newAmount - this.changeFund,
                source: source,
                notes: notes,
                updatedBy: this.userData.name,
                timestamp: new Date().toISOString()
            });
            
            this.changeFund = newAmount;
            Toast.success(`Change fund updated to ${Utils.formatCurrency(newAmount)}`);
            
        } catch (error) {
            console.error('Error updating change fund:', error);
            Toast.error('Failed to update change fund');
            return false;
        }
    },
    
    // ========== PENDING DRAFT SHIFT NOTIFICATION ==========
    
    async checkForPendingDraftShifts() {
        if (!this.userData) return;
        
        try {
            // Find draft shifts for this user that are NOT the current shift
            const allShifts = await DB.getAll('shifts');
            const pendingDrafts = allShifts.filter(s => 
                s.staffId === this.userData.id && 
                s.status === 'draft' &&
                s.id !== this.currentShift?.id
            );
            
            if (pendingDrafts.length > 0) {
                this.pendingDraftShift = pendingDrafts[0]; // Most recent
                this.showPendingShiftBanner();
            } else {
                this.pendingDraftShift = null;
                this.hidePendingShiftBanner();
            }
        } catch (error) {
            console.error('Error checking draft shifts:', error);
        }
    },
    
    showPendingShiftBanner() {
        const banner = document.getElementById('pendingShiftBanner');
        if (banner && this.pendingDraftShift) {
            const shift = this.pendingDraftShift;
            const bannerText = banner.querySelector('.banner-text');
            if (bannerText) {
                bannerText.textContent = `⚠️ You have Shift #${shift.shiftNumber} (${shift.dateKey}) still in draft. Please finalize it!`;
            }
            banner.style.display = 'block';
        }
    },
    
    hidePendingShiftBanner() {
        const banner = document.getElementById('pendingShiftBanner');
        if (banner) {
            banner.style.display = 'none';
        }
    },
    
    async showPendingDraftShift() {
        if (!this.pendingDraftShift) {
            Toast.error('No pending draft shift found');
            return;
        }
        
        const shift = this.pendingDraftShift;
        
        // Get sales for this shift
        const sales = await DB.query('sales', 'shiftId', '==', shift.id);
        const cashSales = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
        const gcashSales = sales.filter(s => s.paymentMethod === 'gcash').reduce((sum, s) => sum + (s.total || 0), 0);
        const totalSales = cashSales + gcashSales;
        
        Modal.open({
            title: `📋 Finalize Draft Shift #${shift.shiftNumber}`,
            content: `
                <div class="draft-shift-finalize">
                    <div class="shift-info-summary">
                        <p><strong>Date:</strong> ${shift.dateKey}</p>
                        <p><strong>Started:</strong> ${Utils.formatTime(shift.startTime)}</p>
                        <p><strong>Draft saved:</strong> ${shift.draftTime ? Utils.formatTime(shift.draftTime) : 'Unknown'}</p>
                    </div>
                    
                    <div class="shift-sales-summary">
                        <h4>💰 Shift Sales</h4>
                        <p>Cash Sales: ${Utils.formatCurrency(shift.cashSales || cashSales)}</p>
                        <p>GCash Sales: ${Utils.formatCurrency(shift.gcashSales || gcashSales)}</p>
                        <p><strong>Total: ${Utils.formatCurrency(shift.totalSales || totalSales)}</strong></p>
                    </div>
                    
                    ${shift.draftExpenses?.length > 0 ? `
                        <div class="shift-expenses-summary">
                            <h4>🛒 Expenses Recorded</h4>
                            <p>${shift.draftExpenses.length} items - ${Utils.formatCurrency(shift.draftExpensesTotal || 0)}</p>
                        </div>
                    ` : ''}
                    
                    <div class="form-group">
                        <label>💵 Actual Cash You Handed Over</label>
                        <input type="number" id="draftActualCash" class="form-input form-input-lg" 
                               value="${shift.handoverCash || ''}" placeholder="Enter amount" step="0.01">
                    </div>
                </div>
            `,
            saveText: '✅ Finalize & Close Shift',
            onSave: async () => {
                await this.finalizePendingDraftShift();
            }
        });
    },
    
    async finalizePendingDraftShift() {
        const actualCash = parseFloat(document.getElementById('draftActualCash')?.value) || 0;
        
        if (actualCash <= 0) {
            Toast.error('Please enter the cash amount');
            return false;
        }
        
        const shift = this.pendingDraftShift;
        const expectedCash = shift.expectedCash || 0;
        const expenses = shift.draftExpensesTotal || 0;
        const adjustedExpected = expectedCash - expenses;
        const variance = actualCash - adjustedExpected;
        
        let balanceStatus;
        if (Math.abs(variance) < 1) {
            balanceStatus = 'balanced';
        } else if (variance > 0) {
            balanceStatus = 'over';
        } else {
            balanceStatus = 'short';
        }
        
        try {
            // Update shift to completed
            await DB.update('shifts', shift.id, {
                status: 'completed',
                endTime: new Date().toISOString(),
                actualCash: actualCash,
                adjustedExpected: adjustedExpected,
                variance: variance,
                balanceStatus: balanceStatus,
                expenses: expenses,
                expensesDetails: shift.draftExpenses || [],
                finalizedAt: new Date().toISOString(),
                finalizedBy: this.userData.name
            });
            
            this.pendingDraftShift = null;
            this.hidePendingShiftBanner();
            
            Toast.success(`Shift #${shift.shiftNumber} finalized! Status: ${balanceStatus.toUpperCase()}`);
            
            // Check if there are more pending drafts
            await this.checkForPendingDraftShifts();
            
        } catch (error) {
            console.error('Error finalizing shift:', error);
            Toast.error('Failed to finalize shift');
            return false;
        }
    }
};
