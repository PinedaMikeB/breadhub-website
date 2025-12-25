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
                
                // Load device restriction setting
                this.deviceRestrictionEnabled = settings.deviceRestrictionEnabled || false;
            } else {
                // Create default settings if not exists
                this.changeFund = 1000;
                this.deviceRestrictionEnabled = false;
            }
        } catch (error) {
            console.log('Using default change fund');
            this.changeFund = 1000;
            this.deviceRestrictionEnabled = false;
        }
    },
    
    // ========== DEVICE RESTRICTION ==========
    
    getDeviceId() {
        // Get or generate a unique device ID
        let deviceId = localStorage.getItem('pos_device_id');
        if (!deviceId) {
            // Generate a unique ID using crypto + timestamp
            deviceId = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('pos_device_id', deviceId);
        }
        return deviceId;
    },
    
    async checkDeviceAuthorized() {
        // If device restriction is disabled, allow all
        if (!this.deviceRestrictionEnabled) {
            return { authorized: true, reason: 'restriction_disabled' };
        }
        
        const deviceId = this.getDeviceId();
        
        try {
            const devices = await DB.getAll('authorizedDevices');
            const thisDevice = devices.find(d => d.deviceId === deviceId && d.status === 'active');
            
            if (thisDevice) {
                return { authorized: true, device: thisDevice };
            } else {
                return { authorized: false, deviceId: deviceId, reason: 'not_registered' };
            }
        } catch (error) {
            console.error('Device check error:', error);
            // On error, allow access (fail-open for now)
            return { authorized: true, reason: 'check_failed' };
        }
    },
    
    async registerDevice(deviceName) {
        const deviceId = this.getDeviceId();
        
        // Get device info
        const deviceInfo = {
            deviceId: deviceId,
            name: deviceName || 'Unnamed Device',
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            screenSize: `${screen.width}x${screen.height}`,
            registeredAt: new Date().toISOString(),
            registeredBy: this.userData?.name || 'Admin',
            status: 'active'
        };
        
        try {
            await DB.add('authorizedDevices', deviceInfo);
            Toast.success(`Device "${deviceName}" registered successfully`);
            return true;
        } catch (error) {
            console.error('Device registration error:', error);
            Toast.error('Failed to register device');
            return false;
        }
    },
    
    showDeviceBlockedModal(deviceId) {
        Modal.open({
            title: '🚫 Device Not Authorized',
            content: `
                <div class="device-blocked-modal">
                    <div class="blocked-icon">🔒</div>
                    <p><strong>This device is not authorized to use BreadHub POS.</strong></p>
                    <p>Only registered devices can access the POS system.</p>
                    <div class="device-info">
                        <small>Device ID: ${deviceId}</small>
                    </div>
                    <p class="contact-admin">Please contact your manager or admin to register this device.</p>
                </div>
            `,
            hideFooter: true,
            customFooter: `
                <div style="text-align:center;padding:15px;">
                    <button class="btn btn-outline" onclick="location.reload()">Try Again</button>
                </div>
            `
        });
    },
    
    showAdminDeviceRegistrationPrompt(deviceId, staff) {
        Modal.open({
            title: '📱 New Device Detected',
            content: `
                <div class="device-register-prompt">
                    <p>Welcome, <strong>${staff.name}</strong>!</p>
                    <p>This device is not yet registered. As an admin, you can register it now or continue without registering.</p>
                    <div class="device-info-box">
                        <small>Device ID: ${deviceId}</small>
                    </div>
                    <div class="form-group" style="margin-top:15px;">
                        <label>Device Name (optional)</label>
                        <input type="text" id="newDeviceName" class="form-input" placeholder="e.g., Store Tablet 1, Office PC">
                    </div>
                </div>
            `,
            hideFooter: true,
            customFooter: `
                <div style="display:flex;gap:10px;justify-content:center;padding:15px;">
                    <button class="btn btn-success" onclick="Auth.registerAndContinue()">✅ Register & Continue</button>
                    <button class="btn btn-outline" onclick="Auth.skipRegistrationAndContinue()">Skip for Now</button>
                </div>
            `
        });
    },
    
    async registerAndContinue() {
        const name = document.getElementById('newDeviceName')?.value?.trim() || 'Unnamed Device';
        await this.registerDevice(name);
        Modal.close();
        this.continueAfterDeviceCheck();
    },
    
    skipRegistrationAndContinue() {
        Toast.warning('Device not registered - others may not be able to use it');
        Modal.close();
        this.continueAfterDeviceCheck();
    },
    
    async continueAfterDeviceCheck() {
        Toast.success(`Welcome, ${this.userData.name}!`);
        
        // Check for unclosed shifts
        const unclosedShifts = await this.getUnclosedShifts(this.userData.id);
        
        if (unclosedShifts.length > 0) {
            this.showUnclosedShiftModal(unclosedShifts);
        } else if (this.userData.role === 'owner' || this.userData.role === 'manager') {
            this.showOwnerOptions();
        } else {
            this.showShiftStartModal();
        }
    },
    
    // ========== PIN LOGIN ==========
    
    async loginWithPIN(pin) {
        if (!pin || pin.length < 4) {
            Toast.error('Please enter a valid PIN');
            return false;
        }
        
        try {
            // First, get staff info to check if admin/owner
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
            
            // Check device authorization - BUT allow admins/owners to bypass
            const isAdminOrOwner = staff.role === 'owner' || staff.role === 'manager' || staff.isAdmin;
            const deviceCheck = await this.checkDeviceAuthorized();
            
            if (!deviceCheck.authorized && !isAdminOrOwner) {
                // Regular staff blocked on unregistered device
                this.showDeviceBlockedModal(deviceCheck.deviceId);
                return false;
            }
            
            // If admin on unregistered device, show option to register
            if (!deviceCheck.authorized && isAdminOrOwner) {
                this.userData = staff;
                localStorage.setItem('pos_staff', JSON.stringify(staff));
                this.showAdminDeviceRegistrationPrompt(deviceCheck.deviceId, staff);
                return true;
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
        
        // IMPORTANT: Expected Cash = CASH SALES ONLY (Change Fund is separate!)
        // Change fund stays in drawer and is tracked separately
        const expectedCashFromSales = cashSales;
        
        // Store for later use in PDF
        this.endShiftData = {
            shift: this.currentShift,
            sales,
            cashSales,
            gcashSales,
            otherSales,
            totalSales,
            transactionCount,
            expectedCashFromSales,
            changeFund: this.changeFund
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
                                <h4>🧮 Cash Sales Verification</h4>
                                <p class="cash-instruction">Count your CASH SALES only (excluding the change fund)</p>
                                <div class="expected-cash">
                                    Expected from Cash Sales: <strong>${Utils.formatCurrency(expectedCashFromSales)}</strong>
                                </div>
                                
                                <div class="form-group">
                                    <label>Actual Cash from Sales</label>
                                    <input type="number" id="actualCashSales" class="form-input form-input-lg" placeholder="Enter cash sales amount" step="0.01" oninput="Auth.calculateVariance()">
                                </div>
                                
                                <div id="varianceDisplay" class="variance-display">
                                    Enter actual cash from sales above
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
                            <div class="change-fund-confirm">
                                <h4>🔄 Change Fund Handover</h4>
                                <p>Set Change Fund: <strong>${Utils.formatCurrency(this.changeFund)}</strong></p>
                                
                                <div class="form-group" style="margin: 10px 0;">
                                    <label>Actual Change Fund Left in Drawer:</label>
                                    <input type="number" id="actualChangeFund" class="form-input" 
                                           value="${this.changeFund}" step="0.01" 
                                           oninput="Auth.checkChangeFundShortage()">
                                </div>
                                
                                <div id="changeFundStatus" class="change-fund-status"></div>
                                
                                <label class="checkbox-confirm">
                                    <input type="checkbox" id="changeFundConfirmed" onchange="Auth.toggleEndShiftBtn()">
                                    I confirm this amount for next cashier
                                </label>
                            </div>
                            
                            <button class="btn btn-success btn-xl" onclick="Auth.finalizeEndShift()" id="endShiftBtn" disabled>
                                ✅ End Shift & Generate Report
                            </button>
                            
                            <button class="btn btn-outline btn-lg" onclick="Modal.close()">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `,
            hideFooter: true
        });
        
        // Initialize expenses array only if not already set (preserve existing expenses)
        if (!this.shiftExpenses) {
            this.shiftExpenses = [];
        }
        
        // Render existing expenses
        this.renderExpensesList();
        this.updateTotalExpenses();
        
        // Initialize change fund status
        this.checkChangeFundShortage();
    },
    
    checkChangeFundShortage() {
        const actualChangeFund = parseFloat(document.getElementById('actualChangeFund')?.value) || 0;
        const setChangeFund = this.changeFund || 1000;
        const shortage = setChangeFund - actualChangeFund;
        
        const statusDiv = document.getElementById('changeFundStatus');
        if (!statusDiv) return;
        
        if (shortage > 0) {
            // There's a shortage - likely used for emergency purchases
            statusDiv.innerHTML = `
                <div style="background: #fff3cd; padding: 10px; border-radius: 8px; margin: 10px 0; color: #856404;">
                    ⚠️ <strong>Shortage: ${Utils.formatCurrency(shortage)}</strong>
                    <br><small>If used for emergency purchases, it will be noted in the report and owner will be notified.</small>
                </div>
            `;
            this.changeFundShortage = shortage;
        } else if (shortage < 0) {
            // Overage
            statusDiv.innerHTML = `
                <div style="background: #d4edda; padding: 10px; border-radius: 8px; margin: 10px 0; color: #155724;">
                    ✅ <strong>Extra: ${Utils.formatCurrency(Math.abs(shortage))}</strong>
                </div>
            `;
            this.changeFundShortage = 0;
        } else {
            statusDiv.innerHTML = `
                <div style="background: #d4edda; padding: 10px; border-radius: 8px; margin: 10px 0; color: #155724;">
                    ✅ Change fund complete
                </div>
            `;
            this.changeFundShortage = 0;
        }
    },
    
    toggleEndShiftBtn() {
        const checkbox = document.getElementById('changeFundConfirmed');
        const btn = document.getElementById('endShiftBtn');
        if (btn) {
            btn.disabled = !checkbox?.checked;
        }
    },
    
    // ========== NEW EXPENSE MODAL SYSTEM ==========
    
    addExpenseRow() {
        // Open the expense picker modal
        this.openExpenseModal();
    },
    
    async openExpenseModal() {
        // Load full item details from Firebase
        try {
            Toast.show('Loading items...', 'info');
            
            const [ingredients, packaging, suppliers] = await Promise.all([
                DB.getAll('ingredients'),
                DB.getAll('packagingMaterials'),
                DB.getAll('suppliers')
            ]);
            
            // Build supplier lookup map
            const supplierMap = {};
            suppliers.forEach(s => {
                supplierMap[s.id] = s.companyName || s.name || 'Unknown';
            });
            this.supplierMap = supplierMap;
            
            // Load supplier prices from sub-collections for each ingredient
            // First, test with one ingredient to see the sub-collection name
            const testIngredient = ingredients[0];
            if (testIngredient) {
                console.log('Testing sub-collections for:', testIngredient.name, testIngredient.id);
                
                // Try different possible sub-collection names
                const possibleSubcollections = ['prices', 'supplierPrices', 'suppliers', 'pricing'];
                for (const subName of possibleSubcollections) {
                    try {
                        const subData = await DB.getSubcollection('ingredients', testIngredient.id, subName);
                        console.log(`Sub-collection '${subName}':`, subData);
                        if (subData && subData.length > 0) {
                            console.log(`✅ Found data in '${subName}' sub-collection!`);
                            break;
                        }
                    } catch (e) {
                        console.log(`Sub-collection '${subName}' error:`, e.message);
                    }
                }
            }
            
            const ingredientsWithPrices = await Promise.all(
                ingredients.map(async (ing) => {
                    try {
                        // Try to get prices sub-collection
                        const prices = await DB.getSubcollection('ingredients', ing.id, 'prices');
                        
                        // Find default supplier price (one with ⭐ or first one)
                        let defaultPrice = null;
                        if (prices && prices.length > 0) {
                            defaultPrice = prices.find(p => p.isDefault) || prices[0];
                        }
                        
                        return {
                            ...ing,
                            supplierPrices: prices || [],
                            defaultSupplierPrice: defaultPrice
                        };
                    } catch (e) {
                        return { ...ing, supplierPrices: [], defaultSupplierPrice: null };
                    }
                })
            );
            
            // Map ingredients with full details including supplier prices
            this.allItemsDetails = [
                ...ingredientsWithPrices.map(i => {
                    const priceInfo = i.defaultSupplierPrice || {};
                    const suppId = priceInfo.supplierId || priceInfo.supplier;
                    
                    return {
                        id: i.id,
                        name: i.name,
                        type: 'ingredient',
                        category: i.category || 'Ingredient',
                        // Price from supplier prices sub-collection
                        price: priceInfo.price || priceInfo.purchasePrice || 0,
                        size: priceInfo.size || priceInfo.packageSize || 1000,
                        costPerGram: priceInfo.costPerGram || priceInfo.costPerG || 0,
                        unit: 'kg',
                        priceUnit: `${(priceInfo.size || 1000)}g`,
                        // Supplier info
                        supplierId: suppId,
                        supplierName: supplierMap[suppId] || priceInfo.supplierName || 'No supplier',
                        // Stock
                        currentStock: i.currentStock || 0,
                        stockUnit: 'g',
                        // All supplier prices for reference
                        allPrices: i.supplierPrices
                    };
                }),
                ...packaging.map(p => ({
                    id: p.id,
                    name: p.name,
                    type: 'packaging',
                    category: 'Packaging',
                    price: p.price || p.unitPrice || 0,
                    size: p.size || 1,
                    unit: p.unit || 'pcs',
                    priceUnit: p.unit || 'pcs',
                    supplierId: p.supplierId || null,
                    supplierName: supplierMap[p.supplierId] || 'No supplier',
                    currentStock: p.currentStock || 0,
                    stockUnit: p.unit || 'pcs',
                    allPrices: []
                }))
            ].sort((a, b) => a.name.localeCompare(b.name));
            
            console.log('Sample mapped item:', this.allItemsDetails[0]);
            
            this.showExpenseListModal();
            
        } catch (err) {
            console.error('Failed to load items:', err);
            Toast.error('Failed to load items');
        }
    },
    
    showExpenseListModal() {
        const items = this.allItemsDetails || [];
        
        // Build item rows HTML like ProofMaster
        const itemRowsHTML = items.map((item, index) => {
            // Format price display
            let priceDisplay = '₱0';
            if (item.price > 0) {
                priceDisplay = `₱${item.price.toLocaleString()} / ${item.size || 1000}g`;
            }
            
            // Stock display
            const stockDisplay = item.currentStock > 0 
                ? `${item.currentStock.toLocaleString()} ${item.stockUnit}`
                : '0 g';
            const stockClass = item.currentStock <= 0 ? 'low-stock' : '';
            
            return `
            <div class="expense-item-row" data-item-index="${index}" data-name="${item.name.toLowerCase()}">
                <div class="expense-item-checkbox">
                    <input type="checkbox" id="expItem${index}" class="expense-checkbox" data-index="${index}">
                </div>
                <div class="expense-item-info">
                    <div class="expense-item-name">${item.name}</div>
                    <div class="expense-item-details">
                        <span class="item-category">${item.category}</span>
                        <span class="item-price">${priceDisplay}</span>
                        <span class="item-supplier">• ${item.supplierName}</span>
                    </div>
                    <div class="expense-item-stock ${stockClass}">
                        📦 Stock: ${stockDisplay}
                    </div>
                </div>
                <div class="expense-item-qty">
                    <input type="number" class="expense-qty-input" id="expQty${index}" 
                           value="0" min="0" step="0.1" placeholder="0">
                </div>
                <div class="expense-item-unit">
                    <select class="expense-unit-select" id="expUnit${index}">
                        <option value="kg" selected>kg</option>
                        <option value="g">g</option>
                        <option value="pcs">pcs</option>
                        <option value="pack">pack</option>
                        <option value="sack">sack</option>
                        <option value="box">box</option>
                        <option value="bottle">bottle</option>
                        <option value="can">can</option>
                    </select>
                </div>
                <div class="expense-item-amount">
                    <input type="number" class="expense-amount-input" id="expAmt${index}" 
                           placeholder="₱0" min="0" step="0.01">
                </div>
            </div>
        `}).join('');
        
        Modal.open({
            title: '🛒 Emergency Purchase',
            width: '95vw',
            content: `
                <div class="expense-list-modal">
                    <p class="expense-instruction">Select items purchased. Enter qty and amount paid.</p>
                    
                    <!-- Search Box -->
                    <div class="expense-search-box">
                        <input type="text" id="expenseSearchInput" 
                               placeholder="🔍 Search ingredients or materials..." 
                               oninput="Auth.filterExpenseRows(this.value)"
                               autocomplete="off">
                    </div>
                    
                    <!-- Header Row -->
                    <div class="expense-list-header">
                        <div class="header-checkbox">
                            <input type="checkbox" id="selectAllExp" onchange="Auth.toggleAllExpenses(this.checked)">
                        </div>
                        <div class="header-item">Item</div>
                        <div class="header-qty">Qty</div>
                        <div class="header-unit">Unit</div>
                        <div class="header-amount">Amount Paid</div>
                    </div>
                    
                    <!-- Item List (scrollable) -->
                    <div class="expense-items-list" id="expenseItemsList">
                        ${itemRowsHTML}
                    </div>
                </div>
            `,
            customFooter: `
                <div class="expense-modal-footer">
                    <button class="btn btn-outline btn-lg" onclick="Auth.closeExpenseAndReturn()">Cancel</button>
                    <button class="btn btn-success btn-lg" onclick="Auth.addSelectedExpenses()">✅ Add Selected Purchases</button>
                </div>
            `,
            hideFooter: true
        });
        
        // Auto-check when qty is entered
        setTimeout(() => {
            document.querySelectorAll('.expense-qty-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const index = e.target.id.replace('expQty', '');
                    const checkbox = document.getElementById(`expItem${index}`);
                    if (checkbox && parseFloat(e.target.value) > 0) {
                        checkbox.checked = true;
                    }
                });
            });
            
            document.querySelectorAll('.expense-amount-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const index = e.target.id.replace('expAmt', '');
                    const checkbox = document.getElementById(`expItem${index}`);
                    if (checkbox && parseFloat(e.target.value) > 0) {
                        checkbox.checked = true;
                    }
                });
            });
        }, 100);
    },
    
    filterExpenseRows(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.expense-item-row').forEach(row => {
            const name = row.dataset.name || '';
            row.style.display = name.includes(q) ? '' : 'none';
        });
    },
    
    toggleAllExpenses(checked) {
        document.querySelectorAll('.expense-checkbox').forEach(cb => {
            cb.checked = checked;
        });
    },
    
    addSelectedExpenses() {
        const items = this.allItemsDetails || [];
        let addedCount = 0;
        
        items.forEach((item, index) => {
            const checkbox = document.getElementById(`expItem${index}`);
            const qtyInput = document.getElementById(`expQty${index}`);
            const unitSelect = document.getElementById(`expUnit${index}`);
            const amtInput = document.getElementById(`expAmt${index}`);
            
            if (checkbox && checkbox.checked) {
                const qty = parseFloat(qtyInput?.value) || 0;
                const unit = unitSelect?.value || item.unit;
                const amount = parseFloat(amtInput?.value) || 0;
                
                if (qty > 0 && amount > 0) {
                    // Add to expenses list
                    if (!this.shiftExpenses) this.shiftExpenses = [];
                    
                    this.shiftExpenses.push({
                        id: Date.now() + index,
                        itemId: item.id,
                        itemName: item.name,
                        itemType: item.type,
                        supplierId: item.supplierId,
                        supplierName: item.supplierName,
                        qty: qty,
                        unit: unit,
                        amount: amount,
                        pricePerUnit: item.price,
                        category: item.category
                    });
                    
                    addedCount++;
                }
            }
        });
        
        if (addedCount > 0) {
            Toast.success(`✅ Added ${addedCount} item(s) to expenses`);
            Modal.close();
            setTimeout(() => this.endShift(), 150);
        } else {
            Toast.error('Please select items with qty and amount');
        }
    },
    
    clearExpenseSearch() {
        const input = document.getElementById('expenseSearchInput');
        if (input) {
            input.value = '';
            this.filterExpenseButtons('');
        }
    },
    
    closeExpenseAndReturn() {
        Modal.close();
        // Re-open end shift modal
        setTimeout(() => this.endShift(), 150);
    },
    
    pickExpenseItem(itemId, itemName, itemType, itemUnit) {
        this.expenseModalState.item = { id: itemId, name: itemName, type: itemType, unit: itemUnit };
        
        // Show quick add form with supplier dropdown and amount
        this.showQuickAddForm();
    },
    
    showQuickAddForm() {
        const item = this.expenseModalState.item;
        
        // Safe sort with null check
        const sortedSuppliers = [...(this.suppliersList || [])]
            .filter(s => s && s.name)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        const supplierOptions = sortedSuppliers.map(s => 
            `<option value="${s.id}" data-name="${s.name}">${s.name}</option>`
        ).join('');
        
        Modal.open({
            title: '💰 Add Purchase Details',
            width: '90vw',
            content: `
                <div class="quick-add-form">
                    <div class="selected-item-banner">
                        <span class="item-icon">${item.type === 'ingredient' ? '🥚' : '📦'}</span>
                        <strong class="item-name">${item.name}</strong>
                    </div>
                    
                    <div class="form-group">
                        <label>Supplier</label>
                        <select id="quickSupplierSelect" class="form-select form-select-lg">
                            <option value="">-- Select Supplier --</option>
                            ${supplierOptions}
                            <option value="__new__">➕ Add New Supplier...</option>
                        </select>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label>Qty</label>
                            <input type="number" id="quickQtyInput" class="form-input form-input-lg" value="1" min="0.01" step="0.01">
                        </div>
                        <div class="form-group flex-2">
                            <label>Amount Paid (₱)</label>
                            <input type="number" id="quickAmountInput" class="form-input form-input-lg" placeholder="0.00" min="0" step="0.01" inputmode="decimal">
                        </div>
                    </div>
                    
                    <div class="quick-amounts">
                        <button type="button" class="quick-amt-btn" onclick="Auth.setQuickAmount(50)">₱50</button>
                        <button type="button" class="quick-amt-btn" onclick="Auth.setQuickAmount(100)">₱100</button>
                        <button type="button" class="quick-amt-btn" onclick="Auth.setQuickAmount(200)">₱200</button>
                        <button type="button" class="quick-amt-btn" onclick="Auth.setQuickAmount(500)">₱500</button>
                    </div>
                </div>
            `,
            customFooter: `
                <div class="quick-add-footer">
                    <button class="btn btn-outline btn-lg" onclick="Auth.backToItemPicker()">← Back</button>
                    <button class="btn btn-success btn-lg" onclick="Auth.confirmQuickAdd()">✅ Add Purchase</button>
                </div>
            `,
            hideFooter: true
        });
        
        // Handle new supplier selection
        setTimeout(() => {
            const select = document.getElementById('quickSupplierSelect');
            if (select) {
                select.addEventListener('change', (e) => {
                    if (e.target.value === '__new__') {
                        this.showAddSupplierForm();
                    }
                });
            }
        }, 100);
    },
    
    setQuickAmount(amount) {
        const input = document.getElementById('quickAmountInput');
        if (input) input.value = amount;
    },
    
    confirmQuickAdd() {
        const supplierSelect = document.getElementById('quickSupplierSelect');
        const supplierId = supplierSelect?.value;
        const supplierName = supplierSelect?.selectedOptions[0]?.textContent || '';
        
        if (!supplierId || supplierId === '' || supplierId === '__new__') {
            Toast.error('Select a supplier');
            return;
        }
        
        const qty = parseFloat(document.getElementById('quickQtyInput')?.value) || 1;
        const amount = parseFloat(document.getElementById('quickAmountInput')?.value) || 0;
        
        if (amount <= 0) {
            Toast.error('Enter the amount paid');
            return;
        }
        
        const item = this.expenseModalState.item;
        
        // Add to expenses list (persistent)
        if (!this.shiftExpenses) this.shiftExpenses = [];
        
        const expense = {
            id: Date.now(),
            itemId: item.id,
            itemName: item.name,
            itemType: item.type,
            supplierId: supplierId,
            supplierName: supplierName,
            qty: qty,
            unit: item.unit,
            amount: amount
        };
        
        this.shiftExpenses.push(expense);
        
        Toast.success(`✅ Added: ${item.name} - ₱${amount}`);
        
        // Return to End Shift modal (not close everything)
        Modal.close();
        setTimeout(() => this.endShift(), 150);
    },
    
    showSupplierPicker() {
        const sortedSuppliers = [...(this.suppliersList || [])].sort((a, b) => a.name.localeCompare(b.name));
        this.sortedSuppliersCache = sortedSuppliers;
        
        const supplierButtonsHTML = sortedSuppliers.map((s, index) => `
            <button type="button" class="expense-pick-btn supplier-btn" data-supplier-index="${index}">
                <span class="pick-icon">🏪</span>
                <span class="pick-name">${s.name}</span>
            </button>
        `).join('');
        
        const item = this.expenseModalState.item;
        
        Modal.open({
            title: '🏪 Select Supplier',
            width: '95vw',
            content: `
                <div class="expense-picker-modal">
                    <div class="selected-item-banner">
                        <span>${item.type === 'ingredient' ? '🥚' : '📦'}</span>
                        <strong>${item.name}</strong>
                    </div>
                    
                    <div class="expense-search-bar">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="supplierSearchInput" 
                               placeholder="Search suppliers..." 
                               oninput="Auth.filterSupplierButtons(this.value)"
                               autocomplete="off">
                    </div>
                    
                    <div class="expense-picker-grid" id="supplierPickerGrid">
                        ${supplierButtonsHTML}
                        <button type="button" class="expense-pick-btn add-new-btn" 
                                onclick="Auth.showAddSupplierForm()">
                            <span class="pick-icon">➕</span>
                            <span class="pick-name">Add New Supplier</span>
                        </button>
                    </div>
                </div>
            `,
            customFooter: `<div style="text-align:center;padding:10px;">
                <button class="btn btn-outline" onclick="Auth.backToItemPicker()">← Back</button>
                <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
            </div>`,
            hideFooter: true
        });
        
        // Attach click handlers after modal opens
        setTimeout(() => {
            document.querySelectorAll('#supplierPickerGrid .expense-pick-btn[data-supplier-index]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.supplierIndex);
                    const supplier = this.sortedSuppliersCache[index];
                    if (supplier) {
                        this.pickExpenseSupplier(supplier.id, supplier.name);
                    }
                });
            });
        }, 100);
    },
    
    filterSupplierButtons(query) {
        const q = query.toLowerCase();
        const buttons = document.querySelectorAll('.expense-pick-btn.supplier-btn');
        buttons.forEach(btn => {
            const name = btn.querySelector('.pick-name').textContent.toLowerCase();
            btn.style.display = name.includes(q) ? '' : 'none';
        });
    },
    
    backToItemPicker() {
        this.openExpenseModal();
    },
    
    showAddSupplierForm() {
        Modal.open({
            title: '➕ Add New Supplier',
            content: `
                <div class="add-supplier-form">
                    <div class="form-group">
                        <label>Supplier Name *</label>
                        <input type="text" id="newSupplierName" class="form-input form-input-lg" placeholder="e.g., 7-Eleven">
                    </div>
                    <div class="form-group">
                        <label>Contact (Optional)</label>
                        <input type="text" id="newSupplierContact" class="form-input" placeholder="Phone number">
                    </div>
                </div>
            `,
            saveText: '✅ Add Supplier',
            onSave: async () => {
                const name = document.getElementById('newSupplierName')?.value?.trim();
                if (!name) {
                    Toast.error('Enter supplier name');
                    return false;
                }
                
                try {
                    const newSupplier = {
                        name: name,
                        contact: document.getElementById('newSupplierContact')?.value || '',
                        createdAt: new Date().toISOString(),
                        source: 'pos-emergency'
                    };
                    const id = await DB.add('suppliers', newSupplier);
                    this.suppliersList.push({ id, name });
                    
                    // Auto-select this supplier
                    this.pickExpenseSupplier(id, name);
                    Toast.success('Supplier added');
                } catch (err) {
                    Toast.error('Failed to add supplier');
                    return false;
                }
            }
        });
    },
    
    pickExpenseSupplier(supplierId, supplierName) {
        this.expenseModalState.supplier = { id: supplierId, name: supplierName };
        
        // Move to quantity/amount entry
        this.showExpenseAmountForm();
    },
    
    showExpenseAmountForm() {
        const item = this.expenseModalState.item;
        const supplier = this.expenseModalState.supplier;
        
        Modal.open({
            title: '💰 Enter Amount',
            content: `
                <div class="expense-amount-form">
                    <div class="selected-item-banner">
                        <div><span>${item.type === 'ingredient' ? '🥚' : '📦'}</span> <strong>${item.name}</strong></div>
                        <div><span>🏪</span> ${supplier.name}</div>
                    </div>
                    
                    <div class="amount-input-section">
                        <div class="form-group">
                            <label>Quantity</label>
                            <div class="qty-stepper">
                                <button type="button" class="qty-step-btn" onclick="Auth.stepExpenseQty(-1)">−</button>
                                <input type="number" id="expenseQtyInput" class="form-input" value="1" min="0.1" step="0.5">
                                <button type="button" class="qty-step-btn" onclick="Auth.stepExpenseQty(1)">+</button>
                                <span class="qty-unit">${item.unit}</span>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Amount Paid (₱) *</label>
                            <input type="number" id="expenseAmountInput" class="form-input form-input-lg" 
                                   placeholder="0.00" step="1" min="0" inputmode="decimal">
                        </div>
                        
                        <!-- Quick amount buttons -->
                        <div class="quick-amount-btns">
                            <button type="button" onclick="Auth.setExpenseAmount(50)">₱50</button>
                            <button type="button" onclick="Auth.setExpenseAmount(100)">₱100</button>
                            <button type="button" onclick="Auth.setExpenseAmount(200)">₱200</button>
                            <button type="button" onclick="Auth.setExpenseAmount(500)">₱500</button>
                        </div>
                    </div>
                </div>
            `,
            customFooter: `
                <div class="expense-amount-footer">
                    <button class="btn btn-outline" onclick="Auth.showSupplierPicker()">← Back</button>
                    <button class="btn btn-success btn-lg" onclick="Auth.confirmExpense()">✅ Add Expense</button>
                </div>
            `,
            hideFooter: true
        });
    },
    
    stepExpenseQty(delta) {
        const input = document.getElementById('expenseQtyInput');
        if (input) {
            let val = parseFloat(input.value) || 1;
            val = Math.max(0.1, val + delta);
            input.value = val;
        }
    },
    
    setExpenseAmount(amount) {
        const input = document.getElementById('expenseAmountInput');
        if (input) input.value = amount;
    },
    
    confirmExpense() {
        const qty = parseFloat(document.getElementById('expenseQtyInput')?.value) || 1;
        const amount = parseFloat(document.getElementById('expenseAmountInput')?.value) || 0;
        
        if (amount <= 0) {
            Toast.error('Enter the amount paid');
            return;
        }
        
        const { item, supplier } = this.expenseModalState;
        
        // Add to expenses list
        if (!this.shiftExpenses) this.shiftExpenses = [];
        
        const expense = {
            id: Date.now(),
            itemId: item.id,
            itemName: item.name,
            itemType: item.type,
            supplierId: supplier.id,
            supplierName: supplier.name,
            qty: qty,
            unit: item.unit,
            amount: amount
        };
        
        this.shiftExpenses.push(expense);
        
        // Update the expenses display
        this.renderExpensesList();
        this.updateTotalExpenses();
        
        Modal.close();
        Toast.success(`Added: ${item.name} - ₱${amount}`);
    },
    
    renderExpensesList() {
        const container = document.getElementById('expensesList');
        if (!container) return;
        
        if (!this.shiftExpenses || this.shiftExpenses.length === 0) {
            container.innerHTML = '<p class="empty-expenses">No expenses added</p>';
            return;
        }
        
        container.innerHTML = this.shiftExpenses.map(e => `
            <div class="expense-row-display" id="expense-${e.id}">
                <div class="expense-info">
                    <span class="expense-icon">${e.itemType === 'ingredient' ? '🥚' : '📦'}</span>
                    <div class="expense-details">
                        <strong>${e.itemName}</strong>
                        <small>${e.qty} ${e.unit} from ${e.supplierName}</small>
                    </div>
                </div>
                <div class="expense-amount">₱${e.amount.toLocaleString()}</div>
                <button type="button" class="btn btn-icon btn-sm btn-danger" onclick="Auth.removeExpense(${e.id})">🗑️</button>
            </div>
        `).join('');
    },
    
    removeExpense(expenseId) {
        if (!this.shiftExpenses) return;
        this.shiftExpenses = this.shiftExpenses.filter(e => e.id !== expenseId);
        this.renderExpensesList();
        this.updateTotalExpenses();
    },
    
    updateTotalExpenses() {
        const total = (this.shiftExpenses || []).reduce((sum, e) => sum + e.amount, 0);
        const display = document.getElementById('totalExpensesDisplay');
        if (display) display.textContent = Utils.formatCurrency(total);
        this.calculateVariance();
    },
    
    getExpensesData() {
        return this.shiftExpenses || [];
    },
    
    
    calculateVariance() {
        const actualCashSales = parseFloat(document.getElementById('actualCashSales')?.value) || 0;
        
        // Get total expenses
        const expenses = (this.shiftExpenses || []).reduce((sum, e) => sum + e.amount, 0);
        
        // Expected is cash sales only (NOT including change fund)
        const expectedCash = this.endShiftData?.expectedCashFromSales || 0;
        
        // Adjusted expected = cash sales - expenses paid from sales
        const adjustedExpected = expectedCash - expenses;
        const variance = actualCashSales - adjustedExpected;
        
        const display = document.getElementById('varianceDisplay');
        if (!display) return;
        
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
                    <span>Expected Cash Sales:</span>
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
                    <span>Actual Cash Sales:</span>
                    <span>${Utils.formatCurrency(actualCashSales)}</span>
                </div>
            </div>
            <div class="variance-status ${statusClass}">${status}</div>
        `;
    },
    
    async finalizeEndShift() {
        // Get actual cash from SALES (not including change fund)
        const actualCashSales = parseFloat(document.getElementById('actualCashSales')?.value) || 0;
        
        // Get actual change fund left in drawer
        const actualChangeFund = parseFloat(document.getElementById('actualChangeFund')?.value) || 0;
        const setChangeFund = this.changeFund || 1000;
        const changeFundShortage = setChangeFund - actualChangeFund;
        
        // Get structured expenses data
        const expensesData = this.getExpensesData();
        const totalExpenses = expensesData.reduce((sum, e) => sum + e.amount, 0);
        
        const { shift, sales, cashSales, gcashSales, otherSales, totalSales, transactionCount, expectedCashFromSales } = this.endShiftData;
        
        // Calculate discount totals from sales
        let totalDiscountGiven = 0;
        let originalSubtotal = 0;
        const discountBreakdown = {};
        
        sales.forEach(sale => {
            if (sale.totalDiscount) {
                totalDiscountGiven += sale.totalDiscount;
            }
            if (sale.subtotal) {
                originalSubtotal += sale.subtotal;
            }
            if (sale.discountInfo && sale.discountInfo.details) {
                Object.entries(sale.discountInfo.details).forEach(([type, info]) => {
                    if (!discountBreakdown[type]) {
                        discountBreakdown[type] = { name: info.name, count: 0, amount: 0 };
                    }
                    discountBreakdown[type].count++;
                    discountBreakdown[type].amount += info.amount;
                });
            }
        });
        
        // Cash to remit = actual cash sales - expenses
        const cashToRemit = actualCashSales - totalExpenses;
        
        // Variance calculation (cash sales only, NOT change fund)
        const adjustedExpectedSales = expectedCashFromSales - totalExpenses;
        const salesVariance = actualCashSales - adjustedExpectedSales;
        
        let balanceStatus;
        if (Math.abs(salesVariance) < 1) {
            balanceStatus = 'balanced';
        } else if (salesVariance > 0) {
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
            // Cash tracking (sales only, change fund separate)
            expectedCashFromSales,
            actualCashSales,
            expenses: totalExpenses,
            expensesDetails: expensesData,
            cashToRemit,
            // Variance on sales
            adjustedExpectedSales,
            salesVariance,
            balanceStatus,
            // Change fund tracking (separate from sales)
            setChangeFund,
            actualChangeFund,
            changeFundShortage,
            changeFundForNextShift: actualChangeFund,
            // Discount tracking
            originalSubtotal,
            totalDiscountGiven,
            discountBreakdown,
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
                    itemId: purchase.itemId,
                    itemName: purchase.itemName,
                    itemType: purchase.itemType,
                    supplierId: purchase.supplierId,
                    supplierName: purchase.supplierName,
                    qty: purchase.qty,
                    unit: purchase.unit,
                    amount: purchase.amount,
                    status: 'pending',
                    createdAt: endTime
                });
            }
            
            // Store for report generation
            this.expensesData = expensesData;
            this.shiftReportData = shiftReport;
            
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
        
        // Cash to remit is now calculated in finalizeEndShift
        const cashToRemit = report.cashToRemit || (report.actualCashSales - report.expenses);
        
        // Build discount summary HTML
        let discountHTML = '';
        if (report.totalDiscountGiven > 0) {
            discountHTML = `
                <div style="margin-bottom: 20px; background: #fff3e0; padding: 15px; border-radius: 8px;">
                    <h3 style="color: #e65100; margin-top: 0;">🏷️ Discounts Given</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px;">Original Total (Before Discounts):</td>
                            <td style="padding: 5px; text-align: right;">₱${(report.originalSubtotal || 0).toLocaleString()}</td>
                        </tr>
                        ${Object.entries(report.discountBreakdown || {}).map(([type, info]) => `
                            <tr style="color: #e65100;">
                                <td style="padding: 5px;">${info.name} (${info.count} transactions):</td>
                                <td style="padding: 5px; text-align: right;">-₱${info.amount.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                        <tr style="border-top: 2px solid #e65100; font-weight: bold;">
                            <td style="padding: 8px;">TOTAL DISCOUNTS:</td>
                            <td style="padding: 8px; text-align: right; color: #c62828;">-₱${report.totalDiscountGiven.toLocaleString()}</td>
                        </tr>
                    </table>
                </div>
            `;
        }
        
        // Build expenses details HTML
        let expensesHTML = '';
        if (expensesData.length > 0) {
            expensesHTML = `
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #333;">🛒 Emergency Purchases</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #e8e8e8;">
                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Item</strong></td>
                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Supplier</strong></td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;"><strong>Amount</strong></td>
                        </tr>
                        ${expensesData.map(e => `
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd;">
                                    ${e.itemName} (${e.qty} ${e.unit})
                                </td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${e.supplierName || '-'}</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₱${e.amount.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                        <tr style="background: #f5f5f5;">
                            <td colspan="2" style="padding: 8px; border: 1px solid #ddd;"><strong>TOTAL EXPENSES</strong></td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;"><strong>₱${report.expenses.toLocaleString()}</strong></td>
                        </tr>
                    </table>
                </div>
            `;
        }
        
        // Create report content - NO change fund, only cash to remit
        const reportHTML = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #D4894A; margin: 0;">🍞 BreadHub</h1>
                    <h2 style="margin: 10px 0; color: #333;">Shift End Report</h2>
                    <p style="color: #666;">${dateStr}</p>
                </div>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0; color: #333;">Shift Details</h3>
                    <table style="width: 100%; color: #333;">
                        <tr><td style="padding: 5px;"><strong>Shift #:</strong></td><td style="padding: 5px;">${shift.shiftNumber}</td></tr>
                        <tr><td style="padding: 5px;"><strong>Cashier:</strong></td><td style="padding: 5px;">${shift.staffName}</td></tr>
                        <tr><td style="padding: 5px;"><strong>Date:</strong></td><td style="padding: 5px;">${shift.dateKey}</td></tr>
                        <tr><td style="padding: 5px;"><strong>Start Time:</strong></td><td style="padding: 5px;">${Utils.formatTime(shift.startTime)}</td></tr>
                        <tr><td style="padding: 5px;"><strong>End Time:</strong></td><td style="padding: 5px;">${timeStr}</td></tr>
                    </table>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #333;">💰 Sales Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #e8e8e8;">
                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Payment Method</strong></td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;"><strong>Amount</strong></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd;">💵 Cash Sales</td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₱${report.cashSales.toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd;">📱 GCash Sales</td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₱${report.gcashSales.toLocaleString()}</td>
                        </tr>
                        ${report.otherSales > 0 ? `
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd;">💳 Other</td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₱${report.otherSales.toLocaleString()}</td>
                        </tr>
                        ` : ''}
                        <tr style="background: #D4894A; color: white;">
                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>TOTAL SALES</strong></td>
                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;"><strong>₱${report.totalSales.toLocaleString()}</strong></td>
                        </tr>
                    </table>
                    <p style="color: #666; margin-top: 10px;">Total Transactions: ${report.transactionCount}</p>
                </div>
                
                ${discountHTML}
                
                ${expensesHTML}
                
                <div style="margin-bottom: 20px; background: #e8f5e9; padding: 15px; border-radius: 8px;">
                    <h3 style="color: #2e7d32; margin-top: 0;">💵 Cash to Remit (Attached to Report)</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px;">Cash Sales</td>
                            <td style="padding: 8px; text-align: right;">₱${report.cashSales.toLocaleString()}</td>
                        </tr>
                        ${report.expenses > 0 ? `
                        <tr>
                            <td style="padding: 8px; color: #c62828;">Less: Expenses</td>
                            <td style="padding: 8px; text-align: right; color: #c62828;">- ₱${report.expenses.toLocaleString()}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-top: 2px solid #2e7d32;">
                            <td style="padding: 8px;"><strong>CASH TO REMIT</strong></td>
                            <td style="padding: 8px; text-align: right; font-size: 1.3em;"><strong>₱${cashToRemit.toLocaleString()}</strong></td>
                        </tr>
                    </table>
                </div>
                
                <div style="margin-bottom: 20px; background: #fff3e0; padding: 15px; border-radius: 8px;">
                    <h3 style="color: #e65100; margin-top: 0;">🔄 Change Fund Handover</h3>
                    <table style="width: 100%;">
                        <tr>
                            <td style="padding: 5px;">Set Change Fund:</td>
                            <td style="padding: 5px; text-align: right;">₱${(report.setChangeFund || this.changeFund).toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px;">Actual Left in Drawer:</td>
                            <td style="padding: 5px; text-align: right; font-weight: bold;">₱${(report.actualChangeFund || this.changeFund).toLocaleString()}</td>
                        </tr>
                        ${(report.changeFundShortage || 0) > 0 ? `
                        <tr style="color: #c62828;">
                            <td style="padding: 5px;">⚠️ Shortage:</td>
                            <td style="padding: 5px; text-align: right;">₱${report.changeFundShortage.toLocaleString()}</td>
                        </tr>
                        ` : ''}
                    </table>
                    <p style="margin: 5px 0 0; font-size: 0.9em; color: #666;">Confirmed by cashier - ready for next shift</p>
                </div>
                
                <div style="text-align: center; padding: 20px; border-radius: 8px; ${report.balanceStatus === 'balanced' ? 'background: #d4edda; color: #155724;' : report.balanceStatus === 'over' ? 'background: #fff3cd; color: #856404;' : 'background: #f8d7da; color: #721c24;'}">
                    <h2 style="margin: 0;">
                        ${report.balanceStatus === 'balanced' ? '✅ BALANCED' : report.balanceStatus === 'over' ? `⬆️ OVER: ₱${(report.salesVariance || 0).toLocaleString()}` : `⬇️ SHORT: ₱${Math.abs(report.salesVariance || 0).toLocaleString()}`}
                    </h2>
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #999; font-size: 0.9em;">
                    <p>Report generated: ${dateStr} ${timeStr}</p>
                    <p>BreadHub POS System</p>
                </div>
            </div>
        `;
        
        // Store for later use
        this.reportHTML = reportHTML;
        this.reportData = { ...report, cashToRemit };
        
        // Generate 58mm receipt HTML
        this.receiptHTML = this.generate58mmReceipt(report, cashToRemit, expensesData);
        
        // Show report modal with both print options
        Modal.open({
            title: '📄 Shift Report Generated',
            content: `
                <div class="report-preview" style="background: white; border-radius: 8px; max-height: 50vh; overflow-y: auto;">
                    ${reportHTML}
                </div>
            `,
            customFooter: `
                <div class="report-modal-footer" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; padding: 15px;">
                    <button class="btn btn-secondary btn-lg" onclick="Auth.print58mmReceipt()">🧾 Print 58mm Receipt</button>
                    <button class="btn btn-primary btn-lg" onclick="Auth.printReport()">🖨️ Print Full Report</button>
                    <button class="btn btn-success btn-lg" onclick="Auth.finishAndLogout()">✅ Done & Logout</button>
                </div>
            `,
            hideFooter: true
        });
    },
    
    generate58mmReceipt(report, cashToRemit, expensesData) {
        const shift = this.currentShift;
        const dateStr = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
        
        // Build expenses section for receipt
        let expensesLines = '';
        if (expensesData && expensesData.length > 0) {
            expensesLines = `
                <div class="receipt-divider">- - - - - - - - - - - - - - -</div>
                <div class="receipt-section-title">EXPENSES</div>
                ${expensesData.map(e => `
                    <div class="receipt-row">
                        <span>${e.itemName.substring(0, 16)}</span>
                        <span>-P${e.amount}</span>
                    </div>
                `).join('')}
                <div class="receipt-row total">
                    <span>Total Expenses</span>
                    <span>-P${report.expenses}</span>
                </div>
            `;
        }
        
        return `
            <div class="receipt-58mm">
                <div class="receipt-header">
                    <div class="receipt-logo">🍞 BREADHUB</div>
                    <div class="receipt-title">SHIFT END REPORT</div>
                </div>
                
                <div class="receipt-divider">================================</div>
                
                <div class="receipt-info">
                    <div>Shift #${shift.shiftNumber}</div>
                    <div>Cashier: ${shift.staffName}</div>
                    <div>${dateStr} ${timeStr}</div>
                </div>
                
                <div class="receipt-divider">--------------------------------</div>
                
                <div class="receipt-section-title">SALES SUMMARY</div>
                <div class="receipt-row">
                    <span>Cash Sales</span>
                    <span>P${report.cashSales.toLocaleString()}</span>
                </div>
                <div class="receipt-row">
                    <span>GCash Sales</span>
                    <span>P${report.gcashSales.toLocaleString()}</span>
                </div>
                <div class="receipt-row total">
                    <span>TOTAL SALES</span>
                    <span>P${report.totalSales.toLocaleString()}</span>
                </div>
                <div class="receipt-row small">
                    <span>Transactions: ${report.transactionCount}</span>
                </div>
                
                ${expensesLines}
                
                <div class="receipt-divider">================================</div>
                
                <div class="receipt-big-total">
                    <div>CASH TO REMIT</div>
                    <div class="amount">P${cashToRemit.toLocaleString()}</div>
                </div>
                
                <div class="receipt-divider">--------------------------------</div>
                
                <div class="receipt-status ${report.balanceStatus}">
                    ${report.balanceStatus === 'balanced' ? '✓ BALANCED' : 
                      report.balanceStatus === 'over' ? `↑ OVER P${report.variance.toLocaleString()}` : 
                      `↓ SHORT P${Math.abs(report.variance).toLocaleString()}`}
                </div>
                
                <div class="receipt-footer">
                    <div>Change Fund: P${this.changeFund.toLocaleString()}</div>
                    <div class="receipt-divider">--------------------------------</div>
                    <div>Thank you!</div>
                    <div>BreadHub POS</div>
                </div>
            </div>
        `;
    },
    
    print58mmReceipt() {
        // Use RawBT-compatible printing via iframe
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Shift Receipt</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Courier New', monospace; 
                        font-size: 12px; 
                        width: 58mm; 
                        padding: 2mm;
                        line-height: 1.3;
                    }
                    .receipt-58mm { width: 100%; }
                    .receipt-header { text-align: center; margin-bottom: 5px; }
                    .receipt-logo { font-size: 16px; font-weight: bold; }
                    .receipt-title { font-size: 11px; }
                    .receipt-divider { text-align: center; margin: 3px 0; font-size: 10px; }
                    .receipt-info { margin: 5px 0; font-size: 11px; }
                    .receipt-section-title { font-weight: bold; margin: 5px 0 3px; font-size: 11px; }
                    .receipt-row { display: flex; justify-content: space-between; font-size: 11px; }
                    .receipt-row.total { font-weight: bold; border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px; }
                    .receipt-row.small { font-size: 10px; color: #666; }
                    .receipt-big-total { text-align: center; margin: 8px 0; }
                    .receipt-big-total .amount { font-size: 18px; font-weight: bold; }
                    .receipt-status { text-align: center; font-weight: bold; padding: 5px; margin: 5px 0; }
                    .receipt-status.balanced { background: #d4edda; }
                    .receipt-status.over { background: #fff3cd; }
                    .receipt-status.short { background: #f8d7da; }
                    .receipt-footer { text-align: center; margin-top: 5px; font-size: 10px; }
                    @media print {
                        @page { margin: 0; size: 58mm auto; }
                        body { width: 58mm; }
                    }
                </style>
            </head>
            <body>
                ${this.receiptHTML}
            </body>
            </html>
        `;
        
        // Create hidden iframe for printing
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write(printContent);
        iframe.contentWindow.document.close();
        
        iframe.onload = () => {
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        };
    },
    
    printReport() {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Shift Report - BreadHub</title>
                <style>
                    body { margin: 0; padding: 0; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>${this.reportHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    },
    
    async finishAndLogout() {
        try {
            Toast.show('Processing shift completion...', 'info');
            console.log('Starting finishAndLogout...');
            
            // 1. Update inventory from emergency purchases
            console.log('Updating inventory from purchases...');
            const inventoryUpdates = await this.updateInventoryFromPurchases();
            console.log('Inventory updates:', inventoryUpdates);
            
            // 2. Mark shift as completed in Firebase
            console.log('Marking shift as completed...');
            if (this.currentShift && this.currentShift.id) {
                await DB.update('shifts', this.currentShift.id, {
                    status: 'completed',
                    completedAt: new Date().toISOString()
                });
                console.log('Shift marked as completed');
            }
            
            // 3. Send email report
            console.log('Sending email report...');
            await this.sendEmailReport();
            console.log('Email sent');
            
            // 4. Send push notification
            console.log('Sending push notification...');
            await this.sendPushNotification();
            console.log('Push notification sent');
            
            // 5. Show inventory update confirmation
            if (inventoryUpdates.length > 0) {
                console.log('Showing inventory confirmation...');
                await this.showInventoryUpdateConfirmation(inventoryUpdates);
            } else {
                // No inventory updates, just logout
                console.log('No inventory updates, completing logout...');
                this.completeLogout();
            }
            
        } catch (error) {
            console.error('Error finishing shift:', error);
            Toast.error('Error completing shift: ' + error.message);
        }
    },
    
    async updateInventoryFromPurchases() {
        const expensesData = this.expensesData || [];
        const updates = [];
        
        for (const purchase of expensesData) {
            try {
                // Determine collection based on item type
                const collection = purchase.itemType === 'ingredient' ? 'ingredients' : 'packagingMaterials';
                
                // Get current item data
                const item = await DB.get(collection, purchase.itemId);
                
                if (item) {
                    const oldQty = item.currentStock || item.stockQty || 0;
                    const addedQty = purchase.qty || 1;
                    const newQty = oldQty + addedQty;
                    
                    // Update stock in Firebase
                    await DB.update(collection, purchase.itemId, {
                        currentStock: newQty,
                        stockQty: newQty,
                        lastUpdated: new Date().toISOString(),
                        lastUpdateSource: 'emergency_purchase',
                        lastUpdateShiftId: this.currentShift?.id
                    });
                    
                    // Mark pending purchase as processed
                    const pendingPurchases = await DB.query('pendingPurchases', 'itemId', '==', purchase.itemId);
                    for (const pp of pendingPurchases) {
                        if (pp.shiftId === this.currentShift?.id && pp.status === 'pending') {
                            await DB.update('pendingPurchases', pp.id, {
                                status: 'processed',
                                processedAt: new Date().toISOString()
                            });
                        }
                    }
                    
                    updates.push({
                        itemName: purchase.itemName,
                        itemType: purchase.itemType,
                        unit: purchase.unit || 'unit',
                        addedQty: addedQty,
                        oldQty: oldQty,
                        newQty: newQty,
                        supplierName: purchase.supplierName
                    });
                }
            } catch (err) {
                console.error(`Failed to update inventory for ${purchase.itemName}:`, err);
            }
        }
        
        return updates;
    },
    
    async showInventoryUpdateConfirmation(updates) {
        const updateRows = updates.map(u => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #ddd;">
                    <strong>${u.itemName}</strong>
                    <br><small style="color: #666;">${u.itemType === 'ingredient' ? '🥚 Ingredient' : '📦 Packaging'}</small>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">
                    <span style="color: #28a745; font-weight: bold;">+${u.addedQty} ${u.unit}</span>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">
                    ${u.oldQty} → <strong style="color: #007bff;">${u.newQty}</strong> ${u.unit}
                </td>
            </tr>
        `).join('');
        
        Modal.open({
            title: '✅ Inventory Updated from Emergency Purchases',
            width: '600px',
            content: `
                <div style="padding: 15px;">
                    <p style="margin-bottom: 15px; color: #28a745;">
                        <strong>📦 ${updates.length} item(s) have been added to inventory:</strong>
                    </p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 10px; text-align: left;">Item</th>
                                <th style="padding: 10px; text-align: center;">Added</th>
                                <th style="padding: 10px; text-align: center;">Stock Level</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${updateRows}
                        </tbody>
                    </table>
                    <p style="margin-top: 15px; padding: 10px; background: #e8f5e9; border-radius: 8px; color: #2e7d32;">
                        ✅ Email notification sent to owner<br>
                        📱 Push notification sent
                    </p>
                </div>
            `,
            customFooter: `
                <div style="text-align: center; padding: 15px;">
                    <button class="btn btn-success btn-lg" onclick="Auth.completeLogout()">
                        ✅ OK - Logout
                    </button>
                </div>
            `,
            hideFooter: true
        });
    },
    
    completeLogout() {
        // Clear shift data
        localStorage.removeItem('pos_shift');
        this.currentShift = null;
        this.shiftExpenses = null;
        this.expensesData = null;
        this.endShiftData = null;
        
        Modal.close();
        Toast.success('Shift completed successfully!');
        this.showLogin();
    },
    
    async sendEmailReport() {
        const shift = this.currentShift;
        const report = this.reportData;
        const expensesData = this.expensesData || [];
        
        // Build expenses text
        let expensesText = '';
        if (expensesData.length > 0) {
            expensesText = '\nEMERGENCY PURCHASES\n───────────────────\n';
            expensesData.forEach(e => {
                expensesText += `• ${e.itemName} (${e.qty} ${e.unit}) - ₱${e.amount} from ${e.supplierName}\n`;
            });
            expensesText += `Total: ₱${report.expenses.toLocaleString()}\n`;
        }
        
        // Create email content
        const subject = encodeURIComponent(`BreadHub Shift Report - ${shift.staffName} - Shift #${shift.shiftNumber} - ${shift.dateKey}`);
        const body = encodeURIComponent(`
SHIFT END REPORT - BreadHub POS
================================

Shift #: ${shift.shiftNumber}
Cashier: ${shift.staffName}
Date: ${shift.dateKey}
Start: ${Utils.formatTime(shift.startTime)}
End: ${Utils.formatTime(report.endTime)}

SALES SUMMARY
─────────────
Cash Sales: ₱${report.cashSales.toLocaleString()}
GCash Sales: ₱${report.gcashSales.toLocaleString()}
TOTAL SALES: ₱${report.totalSales.toLocaleString()}
Transactions: ${report.transactionCount}
${expensesText}
CASH TO REMIT: ₱${report.cashToRemit.toLocaleString()}

CHANGE FUND IN DRAWER: ₱${this.changeFund.toLocaleString()}

STATUS: ${report.balanceStatus.toUpperCase()}
${report.balanceStatus !== 'balanced' ? `Variance: ₱${Math.abs(report.variance).toLocaleString()} ${report.balanceStatus}` : ''}

---
BreadHub POS System
        `.trim());
        
        // Try to use EmailJS or fallback to mailto
        try {
            // Store report in Firebase for email pickup (can be sent by Cloud Function)
            await DB.add('emailQueue', {
                to: 'michael.marga@gmail.com',
                subject: `BreadHub Shift Report - ${shift.staffName} - Shift #${shift.shiftNumber}`,
                shiftId: shift.id,
                reportData: report,
                expensesData: expensesData,
                createdAt: new Date().toISOString(),
                status: 'pending'
            });
            
            // Also open mailto as backup
            window.open(`mailto:michael.marga@gmail.com?subject=${subject}&body=${body}`, '_blank');
            
        } catch (err) {
            console.error('Email queue failed:', err);
            // Fallback to mailto
            window.open(`mailto:michael.marga@gmail.com?subject=${subject}&body=${body}`, '_blank');
        }
    },
    
    async sendPushNotification() {
        const shift = this.currentShift;
        const report = this.reportData;
        const expensesData = this.expensesData || [];
        
        // Request notification permission if not granted
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            
            if (Notification.permission === 'granted') {
                // Create local notification
                const notification = new Notification('BreadHub - Shift Completed', {
                    body: `Shift #${shift.shiftNumber} by ${shift.staffName}\nSales: ₱${report.totalSales.toLocaleString()}\nCash to Remit: ₱${report.cashToRemit.toLocaleString()}`,
                    icon: '/pos/images/icon-192.png',
                    badge: '/pos/images/icon-72.png',
                    tag: `shift-${shift.id}`,
                    requireInteraction: true
                });
                
                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };
            }
        }
        
        // Store notification in Firebase for mobile app pickup
        try {
            await DB.add('notifications', {
                type: 'shift_completed',
                title: 'Shift Completed',
                message: `Shift #${shift.shiftNumber} by ${shift.staffName} - Sales: ₱${report.totalSales.toLocaleString()}, Cash to Remit: ₱${report.cashToRemit.toLocaleString()}`,
                shiftId: shift.id,
                data: {
                    cashierName: shift.staffName,
                    shiftNumber: shift.shiftNumber,
                    totalSales: report.totalSales,
                    cashToRemit: report.cashToRemit,
                    expenses: report.expenses,
                    expensesCount: expensesData.length
                },
                createdAt: new Date().toISOString(),
                read: false
            });
        } catch (err) {
            console.error('Failed to store notification:', err);
        }
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
        
        // Reset view to POS before showing login
        App.currentView = 'pos';
        App.showView('pos');
        
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
        
        // IMPORTANT: Always reset to POS view when logging in
        // This prevents non-admin users from seeing admin panels
        App.showView('pos');
        
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
            // Update settings (use set to create if doesn't exist)
            await DB.set('settings', 'pos', {
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
