/**
 * BreadHub POS - Reports Module v3
 * With charts, date filtering, tabbed day view, transaction management
 */

const Reports = {
    currentTab: 'daily',
    dateFrom: null,
    dateTo: null,
    chart: null,
    _dayData: null,
    _dayDateKey: null,
    
    async init() {
        this.setQuickRange('month');
    },
    
    setQuickRange(range) {
        const today = new Date();
        let from, to;
        switch (range) {
            case 'today': from = to = today.toISOString().split('T')[0]; break;
            case 'week':
                const w = new Date(today); w.setDate(today.getDate() - 7);
                from = w.toISOString().split('T')[0]; to = today.toISOString().split('T')[0]; break;
            case 'month':
                const m = new Date(today); m.setMonth(today.getMonth() - 1);
                from = m.toISOString().split('T')[0]; to = today.toISOString().split('T')[0]; break;
            case 'all': from = '2020-01-01'; to = today.toISOString().split('T')[0]; break;
        }
        document.getElementById('reportDateFrom').value = from;
        document.getElementById('reportDateTo').value = to;
        this.dateFrom = from; this.dateTo = to;
        this.showTab(this.currentTab);
    },
    
    applyDateFilter() {
        this.dateFrom = document.getElementById('reportDateFrom').value;
        this.dateTo = document.getElementById('reportDateTo').value;
        this.showTab(this.currentTab);
    },
    
    isInDateRange(dateKey) {
        if (!this.dateFrom || !this.dateTo) return true;
        return dateKey >= this.dateFrom && dateKey <= this.dateTo;
    },
    
    showTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.report-tab').forEach(t => t.classList.toggle('active', t.dataset.report === tab));
        switch (tab) {
            case 'daily': this.loadDaily(); break;
            case 'monthly': this.loadMonthly(); break;
            case 'products': this.loadProducts(); break;
            case 'categories': this.loadCategories(); break;
        }
    },
    
    destroyChart() { if (this.chart) { this.chart.destroy(); this.chart = null; } },
    
    parseDate(dateStr) {
        if (dateStr.includes('/')) { const [m, d, y] = dateStr.split('/'); return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
        return dateStr;
    },

    async loadDaily() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        try {
            const sales = await DB.getAll('sales');
            const imports = await DB.getAll('salesImports');
            const dailyData = {};
            sales.forEach(sale => {
                const day = sale.dateKey; if (!this.isInDateRange(day)) return;
                if (!dailyData[day]) dailyData[day] = { date: day, posSales: 0, posCount: 0, importSales: 0, source: 'pos' };
                dailyData[day].posSales += sale.total || 0; dailyData[day].posCount++;
            });
            imports.forEach(imp => {
                if (imp.dailySummaries) imp.dailySummaries.forEach(day => {
                    const dateKey = this.parseDate(day.date); if (!this.isInDateRange(dateKey)) return;
                    if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, posSales: 0, posCount: 0, importSales: 0, source: 'import' };
                    dailyData[dateKey].importSales += day.netSales || 0;
                    dailyData[dateKey].source = dailyData[dateKey].posSales > 0 ? 'both' : 'import';
                });
            });
            const days = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
            if (days.length === 0) { container.innerHTML = '<p class="empty-state">No sales data for selected period</p>'; return; }
            const totalPOS = days.reduce((s, d) => s + d.posSales, 0);
            const totalImport = days.reduce((s, d) => s + d.importSales, 0);
            container.innerHTML = `
                <div class="chart-container"><canvas id="dailyChart"></canvas></div>
                <div class="report-summary">
                    <div class="summary-card"><div class="summary-value">${Utils.formatCurrency(totalPOS)}</div><div class="summary-label">POS Sales</div></div>
                    <div class="summary-card"><div class="summary-value">${Utils.formatCurrency(totalImport)}</div><div class="summary-label">Imported (Loyverse)</div></div>
                    <div class="summary-card highlight"><div class="summary-value">${Utils.formatCurrency(totalPOS + totalImport)}</div><div class="summary-label">Total</div></div>
                </div>
                <table class="report-table"><thead><tr><th>Date</th><th>POS Sales</th><th>Imported Sales</th><th>Total</th><th>Source</th><th>Action</th></tr></thead>
                <tbody>${days.slice().reverse().slice(0, 30).map(d => `<tr><td>${d.date}</td><td>${d.posSales > 0 ? Utils.formatCurrency(d.posSales) : '-'}</td><td>${d.importSales > 0 ? Utils.formatCurrency(d.importSales) : '-'}</td><td><strong>${Utils.formatCurrency(d.posSales + d.importSales)}</strong></td><td><span class="source-badge ${d.source}">${d.source}</span></td><td><button class="btn-view" onclick="Reports.viewDayDetails('${d.date}')">👁️ View</button></td></tr>`).join('')}</tbody></table>`;
            this.destroyChart();
            const ctx = document.getElementById('dailyChart').getContext('2d');
            this.chart = new Chart(ctx, { type: 'bar', data: { labels: days.map(d => d.date), datasets: [{ label: 'POS Sales', data: days.map(d => d.posSales), backgroundColor: '#D4894A' }, { label: 'Imported Sales', data: days.map(d => d.importSales), backgroundColor: '#3498db' }] }, options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } });
        } catch (error) { console.error('Error loading daily report:', error); container.innerHTML = '<p class="error">Failed to load report</p>'; }
    },

    async loadMonthly() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        try {
            const sales = await DB.getAll('sales'); const imports = await DB.getAll('salesImports');
            const monthlyData = {};
            sales.forEach(sale => { if (!this.isInDateRange(sale.dateKey)) return; const month = sale.dateKey.substring(0, 7); if (!monthlyData[month]) monthlyData[month] = { month, posSales: 0, importSales: 0 }; monthlyData[month].posSales += sale.total || 0; });
            imports.forEach(imp => { if (imp.dailySummaries) imp.dailySummaries.forEach(day => { const dk = this.parseDate(day.date); if (!this.isInDateRange(dk)) return; const month = dk.substring(0, 7); if (!monthlyData[month]) monthlyData[month] = { month, posSales: 0, importSales: 0 }; monthlyData[month].importSales += day.netSales || 0; }); });
            const months = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
            if (months.length === 0) { container.innerHTML = '<p class="empty-state">No sales data for selected period</p>'; return; }
            const totalPOS = months.reduce((s, m) => s + m.posSales, 0); const totalImport = months.reduce((s, m) => s + m.importSales, 0);
            container.innerHTML = `<div class="chart-container"><canvas id="monthlyChart"></canvas></div>
                <div class="report-summary"><div class="summary-card highlight"><div class="summary-value">${Utils.formatCurrency(totalPOS + totalImport)}</div><div class="summary-label">Total Sales</div></div></div>
                <table class="report-table"><thead><tr><th>Month</th><th>POS Sales</th><th>Imported</th><th>Total</th></tr></thead>
                <tbody>${months.slice().reverse().map(m => `<tr><td>${m.month}</td><td>${Utils.formatCurrency(m.posSales)}</td><td>${Utils.formatCurrency(m.importSales)}</td><td><strong>${Utils.formatCurrency(m.posSales + m.importSales)}</strong></td></tr>`).join('')}</tbody></table>`;
            this.destroyChart();
            const ctx = document.getElementById('monthlyChart').getContext('2d');
            this.chart = new Chart(ctx, { type: 'bar', data: { labels: months.map(m => m.month), datasets: [{ label: 'POS Sales', data: months.map(m => m.posSales), backgroundColor: '#D4894A' }, { label: 'Imported Sales', data: months.map(m => m.importSales), backgroundColor: '#3498db' }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } });
        } catch (error) { console.error('Error loading monthly report:', error); container.innerHTML = '<p class="error">Failed to load report</p>'; }
    },

    async loadProducts() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        try {
            const imports = await DB.getAll('salesImports'); const products = await DB.getAll('products');
            const productData = {}; const categories = new Set();
            imports.forEach(imp => { if (imp.items) imp.items.forEach(item => {
                if (!this.isInDateRange(imp.dateKey || '2025-01-01')) return;
                const name = item.productName || item.loyverseName; const prod = products.find(p => p.name === name);
                if (!productData[name]) productData[name] = { name, qty: 0, sales: 0, category: item.category || prod?.category || 'Other', mainCategory: prod?.mainCategory || 'Breads' };
                productData[name].qty += item.quantity || 0; productData[name].sales += item.netSales || 0; categories.add(productData[name].category);
            }); });
            const allProducts = Object.values(productData).sort((a, b) => b.sales - a.sales);
            if (allProducts.length === 0) { container.innerHTML = '<p class="empty-state">No product data for selected period</p>'; return; }
            const totalSales = allProducts.reduce((s, p) => s + p.sales, 0); const totalQty = allProducts.reduce((s, p) => s + p.qty, 0);
            this.productsData = allProducts; this.chartMetric = 'sales';
            container.innerHTML = `
                <div class="report-filters"><div class="filter-row"><label>Main Category:</label><select id="filterMainCat" onchange="Reports.updateProductsChart()"><option value="all">All</option><option value="Breads">🍞 Breads Only</option><option value="Drinks">🥤 Drinks Only</option></select>
                <label>Sub-Category:</label><select id="filterSubCat" onchange="Reports.filterProductsTable()"><option value="all">All</option>${[...categories].sort().map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
                <div class="filter-row"><div class="toggle-container"><span class="toggle-label">Show:</span><div class="toggle-switch" id="metricToggle" onclick="Reports.toggleMetric()"><div class="toggle-option active" data-value="sales">💰 Sales (₱)</div><div class="toggle-option" data-value="qty">📦 Quantity</div></div></div></div>
                <div class="filter-row"><label>Display:</label><select id="chartView" onchange="Reports.updateProductsChart()"><option value="top">🏆 Top 10</option><option value="top20">🏆 Top 20</option><option value="bottom">🐌 Bottom 10</option><option value="bottom20">🐌 Bottom 20</option><option value="all">📊 All</option></select></div></div>
                <div class="products-chart-wrapper"><div class="products-chart-scroll" id="productsChartScroll"><canvas id="productsChart"></canvas></div></div>
                <div class="report-summary"><div class="summary-card"><div class="summary-value">${Utils.formatNumber(totalQty)}</div><div class="summary-label">Items Sold</div></div><div class="summary-card highlight"><div class="summary-value">${Utils.formatCurrency(totalSales)}</div><div class="summary-label">Total Sales</div></div><div class="summary-card"><div class="summary-value">${allProducts.length}</div><div class="summary-label">Products</div></div></div>
                <h3>📋 Product Rankings</h3>
                <table class="report-table" id="productsTable"><thead><tr><th>#</th><th>Product</th><th>Main</th><th>Category</th><th>Qty</th><th>Sales</th></tr></thead>
                <tbody>${allProducts.map((p, i) => `<tr data-main="${p.mainCategory}" data-cat="${p.category}"><td>${i+1}</td><td><strong>${p.name}</strong></td><td>${p.mainCategory}</td><td>${p.category}</td><td>${Utils.formatNumber(p.qty)}</td><td>${Utils.formatCurrency(p.sales)}</td></tr>`).join('')}</tbody></table>`;
            this.updateProductsChart();
        } catch (error) { console.error('Error loading products report:', error); container.innerHTML = '<p class="error">Failed to load report</p>'; }
    },
    
    toggleMetric() {
        const toggle = document.getElementById('metricToggle'); const options = toggle.querySelectorAll('.toggle-option');
        const cur = toggle.querySelector('.toggle-option.active'); const next = cur.dataset.value === 'sales' ? options[1] : options[0];
        options.forEach(o => o.classList.remove('active')); next.classList.add('active');
        this.chartMetric = next.dataset.value; this.updateProductsChart();
    },
    updateProductsChart() {
        const metric = this.chartMetric || 'sales'; const view = document.getElementById('chartView').value; const mainCat = document.getElementById('filterMainCat').value;
        let filtered = this.productsData; if (mainCat !== 'all') filtered = filtered.filter(p => p.mainCategory === mainCat);
        filtered = [...filtered].sort((a, b) => metric === 'sales' ? b.sales - a.sales : b.qty - a.qty);
        let chartData, chartTitle;
        if (view === 'top') { chartData = filtered.slice(0, 10); chartTitle = 'Top 10'; } else if (view === 'top20') { chartData = filtered.slice(0, 20); chartTitle = 'Top 20'; }
        else if (view === 'bottom') { chartData = filtered.slice(-10).reverse(); chartTitle = 'Bottom 10'; } else if (view === 'bottom20') { chartData = filtered.slice(-20).reverse(); chartTitle = 'Bottom 20'; }
        else { chartData = filtered; chartTitle = 'All Products'; }
        this.filterProductsTable();
        const canvas = document.getElementById('productsChart'); canvas.width = Math.max(chartData.length * 100, 800); canvas.height = 400;
        this.destroyChart(); const ctx = canvas.getContext('2d'); const isQty = metric === 'qty';
        this.chart = new Chart(ctx, { type: 'bar', data: { labels: chartData.map(p => p.name.length > 15 ? p.name.substring(0, 13) + '...' : p.name), datasets: [{ label: isQty ? 'Quantity' : 'Sales (₱)', data: chartData.map(p => isQty ? p.qty : p.sales), backgroundColor: view.includes('bottom') ? '#e74c3c' : '#D4894A', borderRadius: 4, barThickness: 40 }] },
            options: { responsive: false, maintainAspectRatio: false, plugins: { title: { display: true, text: chartTitle + (mainCat !== 'all' ? ' - ' + mainCat : ''), color: '#fff', font: { size: 16 } }, legend: { labels: { color: '#ccc' } }, tooltip: { callbacks: { title: (items) => chartData[items[0].dataIndex]?.name || '', label: (item) => isQty ? 'Qty: ' + Utils.formatNumber(item.raw) : Utils.formatCurrency(item.raw) } } }, scales: { x: { ticks: { color: '#ccc', maxRotation: 45, minRotation: 45 }, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { beginAtZero: true, ticks: { color: '#ccc', callback: (val) => isQty ? val : '₱' + val.toLocaleString() }, grid: { color: 'rgba(255,255,255,0.1)' } } } } });
    },
    filterProductsTable() {
        const mainCat = document.getElementById('filterMainCat')?.value || 'all'; const subCat = document.getElementById('filterSubCat')?.value || 'all';
        document.querySelectorAll('#productsTable tbody tr').forEach(row => { row.style.display = ((mainCat === 'all' || row.dataset.main === mainCat) && (subCat === 'all' || row.dataset.cat === subCat)) ? '' : 'none'; });
    },

    async loadCategories() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        try {
            const imports = await DB.getAll('salesImports'); const categoryData = {};
            imports.forEach(imp => { if (imp.items) imp.items.forEach(item => { const cat = item.category || 'Other'; if (!categoryData[cat]) categoryData[cat] = { name: cat, qty: 0, sales: 0 }; categoryData[cat].qty += item.quantity || 0; categoryData[cat].sales += item.netSales || 0; }); });
            const categories = Object.values(categoryData).sort((a, b) => b.sales - a.sales);
            if (categories.length === 0) { container.innerHTML = '<p class="empty-state">No category data</p>'; return; }
            container.innerHTML = `<div class="chart-container"><canvas id="categoriesChart"></canvas></div>
                <table class="report-table"><thead><tr><th>Category</th><th>Items Sold</th><th>Sales</th></tr></thead>
                <tbody>${categories.map(c => `<tr><td><strong>${c.name}</strong></td><td>${c.qty}</td><td>${Utils.formatCurrency(c.sales)}</td></tr>`).join('')}</tbody></table>`;
            this.destroyChart();
            const ctx = document.getElementById('categoriesChart').getContext('2d');
            this.chart = new Chart(ctx, { type: 'doughnut', data: { labels: categories.map(c => c.name), datasets: [{ data: categories.map(c => c.sales), backgroundColor: ['#D4894A', '#3498db', '#27ae60', '#e74c3c', '#9b59b6', '#f39c12', '#1abc9c', '#34495e'] }] }, options: { responsive: true } });
        } catch (error) { console.error('Error loading categories report:', error); container.innerHTML = '<p class="error">Failed to load report</p>'; }
    },

    // ========== TABBED DAY DETAILS ==========
    async viewDayDetails(dateKey) {
        try {
            const sales = await DB.getAll('sales');
            const imports = await DB.getAll('salesImports');
            this._dayDateKey = dateKey;
            this._dayData = { daySales: sales.filter(s => s.dateKey === dateKey), imports, dateKey };
            this._renderDayModal('summary');
        } catch (error) { console.error('Error:', error); alert('Failed to load: ' + error.message); }
    },
    
    _renderDayModal(tab) {
        const { daySales, imports, dateKey } = this._dayData;
        const tabBtn = (id, label, icon) => `<button onclick="Reports._renderDayModal('${id}')" style="flex:1;padding:8px 4px;border:none;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;background:${tab===id?'#D4894A':'transparent'};color:${tab===id?'#0a1929':'#8ab4d6'};">${icon} ${label}</button>`;
        const tabs = `<div style="display:flex;gap:4px;margin-bottom:14px;background:#0a1525;border-radius:10px;padding:4px;">${tabBtn('summary','Summary','📊')}${tabBtn('transactions','Transactions','🧾')}${tabBtn('products','Products','🍞')}</div>`;
        let body = '';
        if (tab === 'summary') body = this._buildSummaryTab();
        else if (tab === 'transactions') body = this._buildTransactionsTab();
        else if (tab === 'products') body = this._buildProductsTab();
        Modal.open({ title: `📋 Daily Report - ${dateKey}`, content: tabs + body, width: '600px', cancelText: null, saveText: 'Close' });
    },

    // ---- SUMMARY TAB ----
    _buildSummaryTab() {
        const { daySales, imports, dateKey } = this._dayData;
        const shifts = {}; let posTotal = 0, posDiscount = 0; const gp = { cash:0, gcash:0, grab:0, charge:0 }; let gItems = 0;
        daySales.forEach(sale => {
            const sk = sale.shiftNumber || 'unassigned', cashier = sale.cashierName || sale.createdByName || 'Unknown', method = (sale.paymentMethod||'cash').toLowerCase();
            if (!shifts[sk]) shifts[sk] = { shiftNumber: sale.shiftNumber||0, cashier, totalSales:0, payments:{cash:0,gcash:0,grab:0,charge:0}, itemCount:0, discount:0, txnCount:0 };
            const tot = sale.total||0, disc = sale.totalDiscount||0, qty = sale.items ? sale.items.reduce((s,i)=>s+(i.quantity||1),0) : 0;
            shifts[sk].totalSales += tot; shifts[sk].discount += disc; shifts[sk].itemCount += qty; shifts[sk].txnCount++;
            if (shifts[sk].payments.hasOwnProperty(method)) shifts[sk].payments[method] += tot; else shifts[sk].payments.cash += tot;
            if (cashier !== 'Unknown') shifts[sk].cashier = cashier;
            posTotal += tot; posDiscount += disc; gItems += qty;
            if (gp.hasOwnProperty(method)) gp[method] += tot; else gp.cash += tot;
        });
        let impTotal = 0;
        imports.forEach(imp => {
            if (imp.dailySummaries) imp.dailySummaries.forEach(d => { if (this.parseDate(d.date)===dateKey) impTotal += d.netSales||0; });
            if (imp.items) imp.items.forEach(i => { if (this.parseDate(i.date||imp.dateKey||'')===dateKey) impTotal += i.netSales||0; });
        });
        const grand = posTotal + impTotal;
        const ss = Object.values(shifts).sort((a,b)=>(a.shiftNumber||99)-(b.shiftNumber||99));
        const pb = (l,a,c) => a<=0?'':`<span style="display:inline-block;background:${c};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8rem;margin:2px;">${l}: ${Utils.formatCurrency(a)}</span>`;
        if (ss.length===0 && impTotal===0) return '<p style="text-align:center;color:#999;padding:20px;">No sales data</p>';
        let c = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
            <div style="background:#1a3a4a;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:1.3rem;font-weight:bold;color:#D4894A;">${Utils.formatNumber(gItems)}</div><div style="font-size:0.75rem;color:#aaa;">Items Sold</div></div>
            <div style="background:#1a3a4a;padding:10px;border-radius:8px;text-align:center;"><div style="font-size:1.3rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(grand)}</div><div style="font-size:0.75rem;color:#aaa;">Grand Total</div></div></div>`;
        if (posDiscount > 0) c += `<div style="background:#2d3748;padding:6px 10px;border-radius:6px;margin-bottom:10px;font-size:0.8rem;color:#f6ad55;">💰 Discounts: ${Utils.formatCurrency(posDiscount)}</div>`;
        c += '<div style="max-height:400px;overflow-y:auto;">';
        ss.forEach(s => {
            const lbl = s.shiftNumber ? `Shift ${s.shiftNumber}` : 'Unassigned';
            c += `<div style="background:#0d2137;border:1px solid #1a3a4a;border-radius:10px;padding:12px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div><span style="font-weight:bold;color:#D4894A;">🕐 ${lbl}</span><span style="display:block;font-size:0.8rem;color:#8ab4d6;">👤 ${s.cashier}</span></div>
                    <div style="text-align:right;"><div style="font-size:1.1rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(s.totalSales)}</div><div style="font-size:0.7rem;color:#aaa;">${s.txnCount} txns · ${Utils.formatNumber(s.itemCount)} items</div></div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">${pb('💵 Cash',s.payments.cash,'#2d6a4f')}${pb('📱 GCash',s.payments.gcash,'#1a56db')}${pb('🛵 Grab',s.payments.grab,'#00b14f')}${pb('📝 Charge',s.payments.charge,'#b45309')}</div>
                ${s.discount>0?`<div style="font-size:0.75rem;color:#f6ad55;margin-top:4px;">💰 Discount: ${Utils.formatCurrency(s.discount)}</div>`:''}
            </div>`;
        });
        if (impTotal > 0) c += `<div style="background:#0d2137;border:1px solid #1a3a4a;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;"><span style="font-weight:bold;color:#3498db;">📥 Imported</span><span style="font-weight:bold;color:#3498db;">${Utils.formatCurrency(impTotal)}</span></div>`;
        if (posTotal > 0) {
            c += `<div style="background:#1a2940;border:2px solid #D4894A;border-radius:10px;padding:12px;margin-bottom:6px;">
                <div style="font-size:0.9rem;font-weight:bold;color:#D4894A;margin-bottom:8px;text-align:center;">📊 Grand Total by Payment</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <div style="background:#0d2137;padding:6px;border-radius:6px;text-align:center;"><div style="font-size:0.7rem;color:#aaa;">💵 Cash</div><div style="font-size:1rem;font-weight:bold;color:#2d6a4f;">${Utils.formatCurrency(gp.cash)}</div></div>
                    <div style="background:#0d2137;padding:6px;border-radius:6px;text-align:center;"><div style="font-size:0.7rem;color:#aaa;">📱 GCash</div><div style="font-size:1rem;font-weight:bold;color:#1a56db;">${Utils.formatCurrency(gp.gcash)}</div></div>
                    <div style="background:#0d2137;padding:6px;border-radius:6px;text-align:center;"><div style="font-size:0.7rem;color:#aaa;">🛵 Grab</div><div style="font-size:1rem;font-weight:bold;color:#00b14f;">${Utils.formatCurrency(gp.grab)}</div></div>
                    <div style="background:#0d2137;padding:6px;border-radius:6px;text-align:center;"><div style="font-size:0.7rem;color:#aaa;">📝 Charge</div><div style="font-size:1rem;font-weight:bold;color:#b45309;">${Utils.formatCurrency(gp.charge)}</div></div>
                </div>
                <div style="text-align:center;margin-top:8px;padding-top:8px;border-top:1px solid #2d3748;"><div style="font-size:0.75rem;color:#aaa;">Grand Total (POS)</div><div style="font-size:1.2rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(posTotal)}</div></div>
            </div>`;
        }
        c += '</div>'; return c;
    },

    // ---- TRANSACTIONS TAB ----
    _buildTransactionsTab() {
        const { daySales } = this._dayData;
        if (daySales.length === 0) return '<p style="text-align:center;color:#999;padding:20px;">No transactions</p>';
        const sorted = [...daySales].sort((a,b)=>(b.timestamp||'').localeCompare(a.timestamp||''));
        let c = `<div style="font-size:0.8rem;color:#8ab4d6;margin-bottom:8px;text-align:center;">${sorted.length} transactions</div><div style="max-height:450px;overflow-y:auto;">`;
        const mc = { cash:'#2d6a4f', gcash:'#1a56db', grab:'#00b14f', charge:'#b45309' };
        const ml = { cash:'💵 Cash', gcash:'📱 GCash', grab:'🛵 Grab', charge:'📝 Charge' };
        sorted.forEach(sale => {
            const time = sale.timestamp ? new Date(sale.timestamp).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}) : '--:--';
            const method = (sale.paymentMethod||'cash').toLowerCase();
            const items = sale.items ? sale.items.reduce((s,i)=>s+(i.quantity||1),0) : 0;
            const sl = sale.shiftNumber ? `S${sale.shiftNumber}` : '';
            c += `<div style="background:#0d2137;border:1px solid #1a3a4a;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;" onclick="Reports.viewTransaction('${sale.id}')">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><span style="font-weight:bold;color:#fff;font-size:0.9rem;">${sale.saleId||sale.id}</span>
                        <span style="display:block;font-size:0.75rem;color:#8ab4d6;margin-top:2px;">🕐 ${time} ${sl?'· '+sl:''} · 👤 ${sale.cashierName||'Unknown'}</span></div>
                    <div style="text-align:right;"><div style="font-size:1rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(sale.total||0)}</div>
                        <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:2px;">
                            <span style="background:${mc[method]||'#555'};color:#fff;padding:1px 6px;border-radius:4px;font-size:0.7rem;">${ml[method]||method}</span>
                            <span style="color:#aaa;font-size:0.7rem;">${items} items</span></div></div>
                </div></div>`;
        });
        c += '</div>'; return c;
    },

    // ---- PRODUCTS TAB ----
    _buildProductsTab() {
        const { daySales } = this._dayData;
        const items = {};
        daySales.forEach(sale => { if (sale.items) sale.items.forEach(item => {
            const name = item.productName || item.name || 'Unknown';
            if (!items[name]) items[name] = { name, qty: 0, sales: 0 };
            items[name].qty += item.quantity || 1;
            items[name].sales += item.lineTotal || ((item.unitPrice||item.price||0) * (item.quantity||1));
        }); });
        const sorted = Object.values(items).sort((a,b)=>b.qty-a.qty);
        if (sorted.length === 0) return '<p style="text-align:center;color:#999;padding:20px;">No product data</p>';
        const tQty = sorted.reduce((s,i)=>s+i.qty,0), tSales = sorted.reduce((s,i)=>s+i.sales,0);
        let c = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:#1a3a4a;padding:8px;border-radius:8px;text-align:center;"><div style="font-size:1.2rem;font-weight:bold;color:#D4894A;">${sorted.length}</div><div style="font-size:0.7rem;color:#aaa;">Products</div></div>
            <div style="background:#1a3a4a;padding:8px;border-radius:8px;text-align:center;"><div style="font-size:1.2rem;font-weight:bold;color:#D4894A;">${Utils.formatNumber(tQty)}</div><div style="font-size:0.7rem;color:#aaa;">Total Qty</div></div>
            <div style="background:#1a3a4a;padding:8px;border-radius:8px;text-align:center;"><div style="font-size:1.2rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(tSales)}</div><div style="font-size:0.7rem;color:#aaa;">Total Sales</div></div>
        </div><div style="max-height:400px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
        <thead><tr style="border-bottom:1px solid #1a3a4a;"><th style="text-align:left;padding:6px 8px;color:#8ab4d6;font-size:0.75rem;">#</th><th style="text-align:left;padding:6px 8px;color:#8ab4d6;font-size:0.75rem;">Product</th><th style="text-align:center;padding:6px 8px;color:#8ab4d6;font-size:0.75rem;">Qty</th><th style="text-align:right;padding:6px 8px;color:#8ab4d6;font-size:0.75rem;">Sales</th></tr></thead><tbody>`;
        sorted.forEach((item,i) => {
            c += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);"><td style="padding:6px 8px;color:#555;font-size:0.75rem;">${i+1}</td><td style="padding:6px 8px;color:#fff;font-weight:600;">${item.name}</td><td style="padding:6px 8px;text-align:center;color:#D4894A;font-weight:bold;">${Utils.formatNumber(item.qty)}</td><td style="padding:6px 8px;text-align:right;color:#27ae60;">${Utils.formatCurrency(item.sales)}</td></tr>`;
        });
        c += '</tbody></table></div>'; return c;
    },

    // ========== VIEW SINGLE TRANSACTION ==========
    async viewTransaction(saleDocId) {
        try {
            const sale = await DB.get('sales', saleDocId);
            if (!sale) { alert('Transaction not found'); return; }
            const time = sale.timestamp ? new Date(sale.timestamp).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '--:--';
            const method = (sale.paymentMethod||'cash').toLowerCase();
            const ml = { cash:'💵 Cash', gcash:'📱 GCash', grab:'🛵 Grab', charge:'📝 Charge' };
            let c = `<div style="background:#0d2137;border-radius:10px;padding:12px;margin-bottom:12px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;">
                    <div><span style="color:#8ab4d6;">Sale ID:</span> <strong style="color:#fff;">${sale.saleId||sale.id}</strong></div>
                    <div><span style="color:#8ab4d6;">Time:</span> <strong style="color:#fff;">${time}</strong></div>
                    <div><span style="color:#8ab4d6;">Cashier:</span> <strong style="color:#fff;">${sale.cashierName||'Unknown'}</strong></div>
                    <div><span style="color:#8ab4d6;">Payment:</span> <strong style="color:#fff;">${ml[method]||method}</strong></div>
                    <div><span style="color:#8ab4d6;">Shift:</span> <strong style="color:#fff;">${sale.shiftNumber||'-'}</strong></div>
                    <div><span style="color:#8ab4d6;">Total:</span> <strong style="color:#27ae60;font-size:1.1rem;">${Utils.formatCurrency(sale.total||0)}</strong></div>
                </div>
                ${sale.totalDiscount>0?`<div style="margin-top:6px;font-size:0.8rem;color:#f6ad55;">💰 Discount: ${Utils.formatCurrency(sale.totalDiscount)}</div>`:''}
            </div>`;
            c += '<div style="margin-bottom:8px;"><strong style="color:#D4894A;font-size:0.85rem;">Items:</strong></div><div style="max-height:300px;overflow-y:auto;">';
            if (sale.items && sale.items.length > 0) {
                sale.items.forEach((item, idx) => {
                    const it = item.lineTotal || ((item.unitPrice||item.price||0)*(item.quantity||1));
                    c += `<div style="display:flex;justify-content:space-between;align-items:center;background:#0d2137;border:1px solid #1a3a4a;border-radius:8px;padding:8px 10px;margin-bottom:6px;">
                        <div style="flex:1;"><div style="color:#fff;font-size:0.85rem;font-weight:600;">${item.productName||item.name}</div>
                            <div style="color:#8ab4d6;font-size:0.75rem;">${item.quantity||1} × ${Utils.formatCurrency(item.unitPrice||item.price||0)} = ${Utils.formatCurrency(it)}</div></div>
                        <button onclick="Reports.removeItemFromTransaction('${saleDocId}',${idx})" style="background:#7f1d1d;color:#fca5a5;border:none;border-radius:6px;padding:4px 8px;font-size:0.7rem;font-weight:700;cursor:pointer;flex-shrink:0;margin-left:8px;">🗑️ Remove</button>
                    </div>`;
                });
            } else c += '<p style="color:#999;font-size:0.85rem;text-align:center;">No items</p>';
            c += '</div>';
            c += `<div style="border-top:1px solid #2d3748;padding-top:12px;margin-top:8px;">
                <button onclick="Reports.deleteTransaction('${saleDocId}')" style="width:100%;padding:12px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:10px;font-size:0.9rem;font-weight:700;cursor:pointer;">🗑️ Delete Entire Transaction</button>
            </div>
            <div style="margin-top:8px;"><button onclick="Reports._renderDayModal('transactions')" style="width:100%;padding:10px;background:transparent;color:#8ab4d6;border:1px solid #1a3a4a;border-radius:10px;font-size:0.85rem;cursor:pointer;">← Back to Transactions</button></div>`;
            Modal.open({ title: `🧾 Transaction - ${sale.saleId||sale.id}`, content: c, width: '500px', cancelText: null, saveText: 'Close' });
        } catch (error) { console.error('Error:', error); alert('Failed: ' + error.message); }
    },

    // ========== DELETE ENTIRE TRANSACTION ==========
    async deleteTransaction(saleDocId) {
        if (!confirm('⚠️ DELETE this entire transaction? This cannot be undone.')) return;
        if (!confirm('This will permanently remove this sale. Proceed?')) return;
        try {
            await DB.delete('sales', saleDocId);
            Toast.success('Transaction deleted');
            const sales = await DB.getAll('sales');
            this._dayData.daySales = sales.filter(s => s.dateKey === this._dayDateKey);
            this._renderDayModal('transactions');
            this.loadDaily();
        } catch (error) { console.error('Error:', error); alert('Failed: ' + error.message); }
    },

    // ========== REMOVE SINGLE ITEM ==========
    async removeItemFromTransaction(saleDocId, itemIndex) {
        try {
            const sale = await DB.get('sales', saleDocId);
            if (!sale || !sale.items) { alert('Not found'); return; }
            const item = sale.items[itemIndex]; if (!item) { alert('Item not found'); return; }
            const name = item.productName || item.name || 'Unknown';
            if (!confirm(`Remove "${name}" (qty: ${item.quantity||1}) from this transaction?`)) return;
            if (sale.items.length === 1) {
                if (!confirm('This is the only item — this will delete the entire transaction. Proceed?')) return;
                await DB.delete('sales', saleDocId);
                Toast.success('Transaction deleted (last item removed)');
                const sales = await DB.getAll('sales');
                this._dayData.daySales = sales.filter(s => s.dateKey === this._dayDateKey);
                this._renderDayModal('transactions'); this.loadDaily(); return;
            }
            const removedTotal = item.lineTotal || ((item.unitPrice||item.price||0)*(item.quantity||1));
            const removedDisc = (item.discountAmount||0) * (item.quantity||1);
            const newItems = [...sale.items]; newItems.splice(itemIndex, 1);
            const newTotal = Math.max(0, (sale.total||0) - removedTotal);
            const newDisc = Math.max(0, (sale.totalDiscount||0) - removedDisc);
            const newSub = newItems.reduce((s,i) => s + ((i.originalPrice||i.unitPrice||i.price||0)*(i.quantity||1)), 0);
            await DB.update('sales', saleDocId, { items: newItems, total: newTotal, totalDiscount: newDisc, subtotal: newSub, editedAt: new Date().toISOString(), editNote: `Removed ${name} (qty ${item.quantity||1})` });
            Toast.success(`Removed "${name}"`);
            const sales = await DB.getAll('sales');
            this._dayData.daySales = sales.filter(s => s.dateKey === this._dayDateKey);
            this.viewTransaction(saleDocId);
        } catch (error) { console.error('Error:', error); alert('Failed: ' + error.message); }
    }
};
