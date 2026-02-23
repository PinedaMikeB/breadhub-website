/**
 * BreadHub POS - Charge Customers Module
 * Manages customers who can pay via "Charge" (accounts receivable)
 */

const ChargeCustomers = {
    _cache: null,

    async getAll() {
        if (this._cache) return this._cache;
        this._cache = await DB.getAll('chargeCustomers');
        this._cache.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return this._cache;
    },

    clearCache() { this._cache = null; },

    // ========== ADMIN: MANAGE CUSTOMERS ==========
    async showManagement() {
        this.clearCache();
        const customers = await this.getAll();
        const rows = customers.length === 0
            ? '<p style="text-align:center;color:#888;padding:20px;">No charge customers yet. Add one below.</p>'
            : customers.map(c => `
                <div style="background:#0d2137;border:1px solid #1a3a4a;border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;" onclick="ChargeCustomers.editCustomer('${c.id}')">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-weight:bold;color:#fff;">${c.name}</div>
                            <div style="font-size:0.8rem;color:#8ab4d6;">${c.contactPerson ? '👤 ' + c.contactPerson : ''}${c.mobile ? ' · 📱 ' + c.mobile : ''}${c.email ? ' · ✉️ ' + c.email : ''}</div>
                            ${c.address ? `<div style="font-size:0.75rem;color:#666;margin-top:2px;">📍 ${c.address}</div>` : ''}
                        </div>
                        <div style="color:#8ab4d6;font-size:1.2rem;">›</div>
                    </div>
                </div>
            `).join('');

        Modal.open({
            title: '🏢 Charge Customers',
            width: '600px',
            content: `
                <div style="margin-bottom:12px;">
                    <button onclick="ChargeCustomers.addCustomer()" style="width:100%;padding:12px;background:#1a56db;color:#fff;border:none;border-radius:10px;font-size:0.9rem;font-weight:700;cursor:pointer;">
                        ➕ Add New Customer
                    </button>
                </div>
                <div style="max-height:450px;overflow-y:auto;">${rows}</div>
            `,
            cancelText: null,
            saveText: 'Close'
        });
    },

    // ========== ADD / EDIT FORM ==========
    addCustomer() {
        this._showForm(null);
    },

    async editCustomer(id) {
        const c = await DB.get('chargeCustomers', id);
        if (!c) { alert('Customer not found'); return; }
        this._showForm(c);
    },

    _showForm(c) {
        const isEdit = !!c;
        const f = (field) => c ? (c[field] || '') : '';
        Modal.open({
            title: isEdit ? `✏️ Edit: ${c.name}` : '➕ New Charge Customer',
            width: '500px',
            content: `
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="color:#8ab4d6;font-size:0.8rem;display:block;margin-bottom:4px;">Business / Customer Name <span style="color:#e74c3c;">*</span></label>
                        <input type="text" id="ccName" value="${f('name')}" style="width:100%;padding:10px;background:#0d2137;color:#fff;border:1px solid #1a3a4a;border-radius:8px;font-size:0.9rem;box-sizing:border-box;" placeholder="e.g., ABC Corp or Juan Dela Cruz">
                    </div>
                    <div>
                        <label style="color:#8ab4d6;font-size:0.8rem;display:block;margin-bottom:4px;">Address</label>
                        <input type="text" id="ccAddress" value="${f('address')}" style="width:100%;padding:10px;background:#0d2137;color:#fff;border:1px solid #1a3a4a;border-radius:8px;font-size:0.9rem;box-sizing:border-box;" placeholder="e.g., 123 Main St, Taytay, Rizal">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label style="color:#8ab4d6;font-size:0.8rem;display:block;margin-bottom:4px;">TIN Number</label>
                            <input type="text" id="ccTin" value="${f('tin')}" style="width:100%;padding:10px;background:#0d2137;color:#fff;border:1px solid #1a3a4a;border-radius:8px;font-size:0.9rem;box-sizing:border-box;" placeholder="e.g., 123-456-789-000">
                        </div>
                        <div>
                            <label style="color:#8ab4d6;font-size:0.8rem;display:block;margin-bottom:4px;">Contact Person</label>
                            <input type="text" id="ccContactPerson" value="${f('contactPerson')}" style="width:100%;padding:10px;background:#0d2137;color:#fff;border:1px solid #1a3a4a;border-radius:8px;font-size:0.9rem;box-sizing:border-box;" placeholder="e.g., Juan Dela Cruz">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label style="color:#8ab4d6;font-size:0.8rem;display:block;margin-bottom:4px;">Mobile Number</label>
                            <input type="tel" id="ccMobile" value="${f('mobile')}" style="width:100%;padding:10px;background:#0d2137;color:#fff;border:1px solid #1a3a4a;border-radius:8px;font-size:0.9rem;box-sizing:border-box;" placeholder="e.g., 09171234567">
                        </div>
                        <div>
                            <label style="color:#8ab4d6;font-size:0.8rem;display:block;margin-bottom:4px;">Email</label>
                            <input type="email" id="ccEmail" value="${f('email')}" style="width:100%;padding:10px;background:#0d2137;color:#fff;border:1px solid #1a3a4a;border-radius:8px;font-size:0.9rem;box-sizing:border-box;" placeholder="e.g., juan@email.com">
                        </div>
                    </div>
                </div>
                ${isEdit ? `<div style="margin-top:16px;border-top:1px solid #2d3748;padding-top:12px;">
                    <button onclick="ChargeCustomers.deleteCustomer('${c.id}')" style="width:100%;padding:10px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:8px;font-size:0.85rem;font-weight:700;cursor:pointer;">🗑️ Delete Customer</button>
                </div>` : ''}
            `,
            saveText: isEdit ? '💾 Update' : '➕ Add Customer',
            onSave: async () => { await this._saveForm(c?.id); }
        });
    },

    async _saveForm(existingId) {
        const name = document.getElementById('ccName')?.value?.trim();
        if (!name) { Toast.error('Customer name is required'); return false; }
        const data = {
            name,
            address: document.getElementById('ccAddress')?.value?.trim() || '',
            tin: document.getElementById('ccTin')?.value?.trim() || '',
            contactPerson: document.getElementById('ccContactPerson')?.value?.trim() || '',
            mobile: document.getElementById('ccMobile')?.value?.trim() || '',
            email: document.getElementById('ccEmail')?.value?.trim() || ''
        };
        try {
            if (existingId) {
                await DB.update('chargeCustomers', existingId, data);
                Toast.success('Customer updated');
            } else {
                await DB.add('chargeCustomers', data);
                Toast.success('Customer added');
            }
            this.clearCache();
            Modal.close();
            setTimeout(() => this.showManagement(), 150);
        } catch (e) { console.error(e); Toast.error('Failed to save'); return false; }
    },

    async deleteCustomer(id) {
        if (!confirm('Delete this customer? Existing receivables will not be affected.')) return;
        try {
            await DB.delete('chargeCustomers', id);
            this.clearCache();
            Toast.success('Customer deleted');
            Modal.close();
            setTimeout(() => this.showManagement(), 150);
        } catch (e) { console.error(e); Toast.error('Failed to delete'); }
    },

    // ========== CHECKOUT: CUSTOMER DROPDOWN ==========
    async buildChargeDropdownHTML() {
        const customers = await this.getAll();
        if (customers.length === 0) return '<option value="">-- No customers. Add in Admin --</option>';
        let html = '<option value="">-- Select Customer --</option>';
        customers.forEach(c => {
            const label = c.name + (c.contactPerson ? ` (${c.contactPerson})` : '');
            html += `<option value="${c.id}" data-name="${c.name}" data-contact="${c.contactPerson||''}" data-mobile="${c.mobile||''}" data-email="${c.email||''}" data-address="${c.address||''}" data-tin="${c.tin||''}">${label}</option>`;
        });
        html += '<option value="__new__">➕ New customer (type below)</option>';
        return html;
    },

    onCustomerSelected(selectEl) {
        const opt = selectEl.options[selectEl.selectedIndex];
        const val = selectEl.value;
        const manualGroup = document.getElementById('chargeManualGroup');
        if (val === '__new__' || val === '') {
            if (manualGroup) manualGroup.style.display = 'block';
            document.getElementById('chargeCustomerName').value = '';
            document.getElementById('chargeContactNumber').value = '';
        } else {
            if (manualGroup) manualGroup.style.display = 'none';
            document.getElementById('chargeCustomerName').value = opt.dataset.name || '';
            document.getElementById('chargeContactNumber').value = opt.dataset.mobile || '';
        }
    },

    getSelectedCustomerData() {
        const select = document.getElementById('chargeCustomerSelect');
        if (!select || !select.value || select.value === '__new__') {
            return {
                customerId: null,
                customerName: document.getElementById('chargeCustomerName')?.value?.trim() || '',
                contactNumber: document.getElementById('chargeContactNumber')?.value?.trim() || '',
                notes: document.getElementById('chargeNotes')?.value?.trim() || ''
            };
        }
        const opt = select.options[select.selectedIndex];
        return {
            customerId: select.value,
            customerName: opt.dataset.name || '',
            contactPerson: opt.dataset.contact || '',
            contactNumber: opt.dataset.mobile || '',
            email: opt.dataset.email || '',
            address: opt.dataset.address || '',
            tin: opt.dataset.tin || '',
            notes: document.getElementById('chargeNotes')?.value?.trim() || ''
        };
    },

    // ========== SYNC: Create missing receivables for charge sales ==========
    async syncReceivables() {
        const sales = await DB.getAll('sales');
        const receivables = await DB.getAll('receivables');
        const existingSaleIds = new Set(receivables.map(r => r.saleId));
        
        const chargeSales = sales.filter(s => (s.paymentMethod || '').toLowerCase() === 'charge');
        let created = 0;
        for (const sale of chargeSales) {
            const saleId = sale.saleId || sale.id;
            if (existingSaleIds.has(saleId)) continue;
            // Create missing receivable
            const cp = sale.chargePayment || {};
            await DB.add('receivables', {
                saleId: saleId,
                dateKey: sale.dateKey,
                customerId: cp.customerId || null,
                customerName: cp.customerName || 'Unknown',
                contactPerson: cp.contactPerson || '',
                contactNumber: cp.contactNumber || '',
                email: cp.email || '',
                address: cp.address || '',
                tin: cp.tin || '',
                notes: cp.notes || '',
                totalAmount: sale.total || 0,
                paidAmount: 0,
                balance: sale.total || 0,
                status: 'unpaid',
                items: (sale.items || []).map(i => ({ productName: i.productName || i.name, quantity: i.quantity, unitPrice: i.unitPrice || i.price, lineTotal: i.lineTotal })),
                payments: [],
                cashierId: sale.cashierId || '',
                cashierName: sale.cashierName || '',
                createdAt: sale.timestamp || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            created++;
        }
        return created;
    },

    // ========== ADMIN: ACCOUNTS RECEIVABLE DASHBOARD ==========
    async showReceivablesDashboard() {
        Toast.info('Syncing receivables...');
        try {
            // First sync any missing receivables from charge sales
            const synced = await this.syncReceivables();
            if (synced > 0) Toast.success(`Created ${synced} missing receivable record${synced>1?'s':''}`);
            
            const allR = await DB.getAllFresh('receivables');
            // Helper to get timestamp as ms
            const getMs = (d) => { if (!d) return 0; if (d.toDate) return d.toDate().getTime(); if (d.seconds) return d.seconds * 1000; return new Date(d).getTime() || 0; };
            allR.sort((a, b) => {
                const so = { unpaid: 0, partial: 1, paid: 2 };
                const d = (so[a.status]||0) - (so[b.status]||0);
                return d !== 0 ? d : getMs(b.createdAt) - getMs(a.createdAt);
            });

            const unpaid = allR.filter(r => r.status !== 'paid');
            const unpaidTotal = unpaid.reduce((s, r) => s + (r.balance || 0), 0);
            const overdue7 = unpaid.filter(r => {
                return (Date.now() - getMs(r.createdAt)) > 7 * 86400000;
            });
            const overdue30 = unpaid.filter(r => {
                return (Date.now() - getMs(r.createdAt)) > 30 * 86400000;
            });

            // Group by customer
            const byCustomer = {};
            unpaid.forEach(r => {
                const key = r.customerName || 'Unknown';
                const ms = getMs(r.createdAt);
                if (!byCustomer[key]) byCustomer[key] = { name: key, total: 0, count: 0, oldestMs: ms, mobile: r.contactNumber || '', items: [] };
                byCustomer[key].total += r.balance || 0;
                byCustomer[key].count++;
                if (ms < byCustomer[key].oldestMs) byCustomer[key].oldestMs = ms;
                byCustomer[key].items.push(r);
            });
            const customerList = Object.values(byCustomer).sort((a, b) => b.total - a.total);

            let c = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
                    <div style="background:#3a2a1a;padding:10px;border-radius:8px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:bold;color:#F57F17;">${Utils.formatCurrency(unpaidTotal)}</div>
                        <div style="font-size:0.7rem;color:#aaa;">Outstanding</div>
                    </div>
                    <div style="background:#1a3a4a;padding:10px;border-radius:8px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:bold;color:#D4894A;">${unpaid.length}</div>
                        <div style="font-size:0.7rem;color:#aaa;">Unpaid Invoices</div>
                    </div>
                    <div style="background:${overdue30.length > 0 ? '#5a1a1a' : '#1a3a4a'};padding:10px;border-radius:8px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:bold;color:${overdue30.length > 0 ? '#ef4444' : '#27ae60'};">${overdue30.length}</div>
                        <div style="font-size:0.7rem;color:#aaa;">Over 30 Days</div>
                    </div>
                </div>
            `;

            if (customerList.length === 0) {
                c += '<p style="text-align:center;color:#27ae60;padding:20px;">✅ No outstanding receivables!</p>';
            } else {
                c += '<div style="max-height:450px;overflow-y:auto;">';
                customerList.forEach(cust => {
                    const daysOld = Math.floor((Date.now() - cust.oldestMs) / 86400000);
                    const urgency = daysOld > 30 ? '#ef4444' : daysOld > 7 ? '#F57F17' : '#D4894A';
                    c += `<div style="background:#0d2137;border:1px solid #1a3a4a;border-left:4px solid ${urgency};border-radius:10px;padding:12px;margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div style="font-weight:bold;color:#fff;font-size:0.95rem;">${cust.name}</div>
                                <div style="font-size:0.75rem;color:#8ab4d6;margin-top:2px;">${cust.count} invoice${cust.count>1?'s':''} · Oldest: ${daysOld} day${daysOld!==1?'s':''} ago</div>
                                ${cust.mobile ? `<div style="font-size:0.75rem;color:#666;margin-top:2px;">📱 ${cust.mobile}</div>` : ''}
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:1.1rem;font-weight:bold;color:${urgency};">${Utils.formatCurrency(cust.total)}</div>
                                ${daysOld > 7 ? `<div style="font-size:0.7rem;color:${urgency};font-weight:bold;">⚠️ FOLLOW UP</div>` : ''}
                            </div>
                        </div>
                        <div style="margin-top:8px;display:flex;gap:6px;">
                            <button onclick="Receivables.showReceivables(); setTimeout(()=>Receivables.filterList('unpaid'),300);" style="flex:1;padding:6px;background:#1a3a4a;color:#8ab4d6;border:1px solid #2d4a5a;border-radius:6px;font-size:0.75rem;cursor:pointer;">📋 View Details</button>
                            ${cust.mobile ? `<a href="tel:${cust.mobile}" style="flex:1;padding:6px;background:#2d6a4f;color:#fff;border:none;border-radius:6px;font-size:0.75rem;cursor:pointer;text-align:center;text-decoration:none;">📞 Call</a>` : ''}
                            ${cust.mobile ? `<a href="sms:${cust.mobile}" style="flex:1;padding:6px;background:#1a56db;color:#fff;border:none;border-radius:6px;font-size:0.75rem;cursor:pointer;text-align:center;text-decoration:none;">💬 SMS</a>` : ''}
                        </div>
                    </div>`;
                });
                c += '</div>';
            }

            Modal.open({
                title: '💰 Accounts Receivable',
                width: '600px',
                content: c,
                cancelText: null,
                saveText: 'Close'
            });
        } catch (e) { console.error(e); Toast.error('Failed to load receivables'); }
    }
};
