/**
 * BreadHub POS - Reports Module v2
 * With charts and date filtering
 */

const Reports = {
    currentTab: 'daily',
    dateFrom: null,
    dateTo: null,
    chart: null,
    
    async init() {
        // Set default date range to this month
        this.setQuickRange('month');
    },
    
    setQuickRange(range) {
        const today = new Date();
        let from, to;
        
        switch (range) {
            case 'today':
                from = to = today.toISOString().split('T')[0];
                break;
            case 'week':
                const weekAgo = new Date(today);
                weekAgo.setDate(today.getDate() - 7);
                from = weekAgo.toISOString().split('T')[0];
                to = today.toISOString().split('T')[0];
                break;
            case 'month':
                const monthAgo = new Date(today);
                monthAgo.setMonth(today.getMonth() - 1);
                from = monthAgo.toISOString().split('T')[0];
                to = today.toISOString().split('T')[0];
                break;
            case 'all':
                from = '2020-01-01';
                to = today.toISOString().split('T')[0];
                break;
        }
        
        document.getElementById('reportDateFrom').value = from;
        document.getElementById('reportDateTo').value = to;
        this.dateFrom = from;
        this.dateTo = to;
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
        
        document.querySelectorAll('.report-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.report === tab);
        });
        
        switch (tab) {
            case 'daily': this.loadDaily(); break;
            case 'monthly': this.loadMonthly(); break;
            case 'products': this.loadProducts(); break;
            case 'categories': this.loadCategories(); break;
        }
    },
    
    destroyChart() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    },
    
    async loadDaily() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        try {
            const sales = await DB.getAll('sales');
            const imports = await DB.getAll('salesImports');
            
            const dailyData = {};
            
            // POS sales
            sales.forEach(sale => {
                const day = sale.dateKey;
                if (!this.isInDateRange(day)) return;
                if (!dailyData[day]) {
                    dailyData[day] = { date: day, posSales: 0, posCount: 0, importSales: 0, source: 'pos' };
                }
                dailyData[day].posSales += sale.total || 0;
                dailyData[day].posCount++;
            });
            
            // Import daily summaries
            imports.forEach(imp => {
                if (imp.dailySummaries) {
                    imp.dailySummaries.forEach(day => {
                        const dateKey = this.parseDate(day.date);
                        if (!this.isInDateRange(dateKey)) return;
                        if (!dailyData[dateKey]) {
                            dailyData[dateKey] = { date: dateKey, posSales: 0, posCount: 0, importSales: 0, source: 'import' };
                        }
                        dailyData[dateKey].importSales += day.netSales || 0;
                        dailyData[dateKey].source = dailyData[dateKey].posSales > 0 ? 'both' : 'import';
                    });
                }
            });
            
            const days = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
            
            if (days.length === 0) {
                container.innerHTML = '<p class="empty-state">No sales data for selected period</p>';
                return;
            }
            
            const totalPOS = days.reduce((s, d) => s + d.posSales, 0);
            const totalImport = days.reduce((s, d) => s + d.importSales, 0);
            
            container.innerHTML = `
                <div class="chart-container">
                    <canvas id="dailyChart"></canvas>
                </div>
                
                <div class="report-summary">
                    <div class="summary-card">
                        <div class="summary-value">${Utils.formatCurrency(totalPOS)}</div>
                        <div class="summary-label">POS Sales</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-value">${Utils.formatCurrency(totalImport)}</div>
                        <div class="summary-label">Imported (Loyverse)</div>
                    </div>
                    <div class="summary-card highlight">
                        <div class="summary-value">${Utils.formatCurrency(totalPOS + totalImport)}</div>
                        <div class="summary-label">Total</div>
                    </div>
                </div>
                
                <table class="report-table">
                    <thead>
                        <tr><th>Date</th><th>POS Sales</th><th>Imported Sales</th><th>Total</th><th>Source</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${days.slice().reverse().slice(0, 30).map(d => `
                            <tr>
                                <td>${d.date}</td>
                                <td>${d.posSales > 0 ? Utils.formatCurrency(d.posSales) : '-'}</td>
                                <td>${d.importSales > 0 ? Utils.formatCurrency(d.importSales) : '-'}</td>
                                <td><strong>${Utils.formatCurrency(d.posSales + d.importSales)}</strong></td>
                                <td><span class="source-badge ${d.source}">${d.source}</span></td>
                                <td><button class="btn-view" onclick="Reports.viewDayDetails('${d.date}')">👁️ View</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            // Create chart
            this.destroyChart();
            const ctx = document.getElementById('dailyChart').getContext('2d');
            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: days.map(d => d.date),
                    datasets: [
                        {
                            label: 'POS Sales',
                            data: days.map(d => d.posSales),
                            backgroundColor: '#D4894A'
                        },
                        {
                            label: 'Imported Sales',
                            data: days.map(d => d.importSales),
                            backgroundColor: '#3498db'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
                }
            });
            
        } catch (error) {
            console.error('Error loading daily report:', error);
            container.innerHTML = '<p class="error">Failed to load report</p>';
        }
    },
    
    parseDate(dateStr) {
        if (dateStr.includes('/')) {
            const [m, d, y] = dateStr.split('/');
            return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return dateStr;
    },

    async loadMonthly() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        try {
            const sales = await DB.getAll('sales');
            const imports = await DB.getAll('salesImports');
            
            const monthlyData = {};
            
            sales.forEach(sale => {
                if (!this.isInDateRange(sale.dateKey)) return;
                const month = sale.dateKey.substring(0, 7);
                if (!monthlyData[month]) monthlyData[month] = { month, posSales: 0, importSales: 0 };
                monthlyData[month].posSales += sale.total || 0;
            });
            
            imports.forEach(imp => {
                if (imp.dailySummaries) {
                    imp.dailySummaries.forEach(day => {
                        const dateKey = this.parseDate(day.date);
                        if (!this.isInDateRange(dateKey)) return;
                        const month = dateKey.substring(0, 7);
                        if (!monthlyData[month]) monthlyData[month] = { month, posSales: 0, importSales: 0 };
                        monthlyData[month].importSales += day.netSales || 0;
                    });
                }
            });
            
            const months = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
            
            if (months.length === 0) {
                container.innerHTML = '<p class="empty-state">No sales data for selected period</p>';
                return;
            }
            
            const totalPOS = months.reduce((s, m) => s + m.posSales, 0);
            const totalImport = months.reduce((s, m) => s + m.importSales, 0);
            
            container.innerHTML = `
                <div class="chart-container">
                    <canvas id="monthlyChart"></canvas>
                </div>
                
                <div class="report-summary">
                    <div class="summary-card highlight">
                        <div class="summary-value">${Utils.formatCurrency(totalPOS + totalImport)}</div>
                        <div class="summary-label">Total Sales</div>
                    </div>
                </div>
                
                <table class="report-table">
                    <thead><tr><th>Month</th><th>POS Sales</th><th>Imported</th><th>Total</th></tr></thead>
                    <tbody>
                        ${months.slice().reverse().map(m => `
                            <tr>
                                <td>${m.month}</td>
                                <td>${Utils.formatCurrency(m.posSales)}</td>
                                <td>${Utils.formatCurrency(m.importSales)}</td>
                                <td><strong>${Utils.formatCurrency(m.posSales + m.importSales)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            this.destroyChart();
            const ctx = document.getElementById('monthlyChart').getContext('2d');
            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: months.map(m => m.month),
                    datasets: [
                        {
                            label: 'POS Sales',
                            data: months.map(m => m.posSales),
                            backgroundColor: '#D4894A'
                        },
                        {
                            label: 'Imported Sales',
                            data: months.map(m => m.importSales),
                            backgroundColor: '#3498db'
                        }
                    ]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });
            
        } catch (error) {
            console.error('Error loading monthly report:', error);
            container.innerHTML = '<p class="error">Failed to load report</p>';
        }
    },

    async loadProducts() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        try {
            const imports = await DB.getAll('salesImports');
            const products = await DB.getAll('products');
            const productData = {};
            const categories = new Set();
            const mainCategories = new Set();
            
            imports.forEach(imp => {
                if (imp.items) {
                    imp.items.forEach(item => {
                        if (!this.isInDateRange(imp.dateKey || '2025-01-01')) return;
                        const name = item.productName || item.loyverseName;
                        if (!productData[name]) {
                            const prod = products.find(p => p.name === name);
                            productData[name] = { 
                                name, 
                                qty: 0, 
                                sales: 0, 
                                category: item.category || prod?.category || 'Other',
                                mainCategory: prod?.mainCategory || 'Breads'
                            };
                        }
                        productData[name].qty += item.quantity || 0;
                        productData[name].sales += item.netSales || 0;
                        categories.add(productData[name].category);
                        mainCategories.add(productData[name].mainCategory);
                    });
                }
            });
            
            const allProducts = Object.values(productData).sort((a, b) => b.sales - a.sales);
            
            if (allProducts.length === 0) {
                container.innerHTML = '<p class="empty-state">No product data for selected period</p>';
                return;
            }
            
            const totalSales = allProducts.reduce((s, p) => s + p.sales, 0);
            const totalQty = allProducts.reduce((s, p) => s + p.qty, 0);
            
            // Store for chart updates
            this.productsData = allProducts;
            this.chartMetric = 'sales';
            this.chartView = 'top';
            this.chartMainCat = 'all';
            
            container.innerHTML = `
                <div class="report-filters">
                    <div class="filter-row">
                        <label>Main Category:</label>
                        <select id="filterMainCat" onchange="Reports.updateProductsChart()">
                            <option value="all">All</option>
                            <option value="Breads">🍞 Breads Only</option>
                            <option value="Drinks">🥤 Drinks Only</option>
                        </select>
                        <label>Sub-Category:</label>
                        <select id="filterSubCat" onchange="Reports.filterProductsTable()">
                            <option value="all">All</option>
                            ${[...categories].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="filter-row">
                        <div class="toggle-container">
                            <span class="toggle-label">Show:</span>
                            <div class="toggle-switch" id="metricToggle" onclick="Reports.toggleMetric()">
                                <div class="toggle-option active" data-value="sales">💰 Sales (₱)</div>
                                <div class="toggle-option" data-value="qty">📦 Quantity</div>
                            </div>
                        </div>
                    </div>
                    <div class="filter-row">
                        <label>Display:</label>
                        <select id="chartView" onchange="Reports.updateProductsChart()">
                            <option value="top">🏆 Top 10 Best Sellers</option>
                            <option value="top20">🏆 Top 20 Best Sellers</option>
                            <option value="bottom">🐌 Bottom 10 Slow Moving</option>
                            <option value="bottom20">🐌 Bottom 20 Slow Moving</option>
                            <option value="all">📊 All Products</option>
                        </select>
                    </div>
                </div>
                
                <div class="products-chart-wrapper">
                    <div class="products-chart-scroll" id="productsChartScroll">
                        <canvas id="productsChart"></canvas>
                    </div>
                </div>
                
                <div class="report-summary">
                    <div class="summary-card">
                        <div class="summary-value">${Utils.formatNumber(totalQty)}</div>
                        <div class="summary-label">Items Sold</div>
                    </div>
                    <div class="summary-card highlight">
                        <div class="summary-value">${Utils.formatCurrency(totalSales)}</div>
                        <div class="summary-label">Total Sales</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-value">${allProducts.length}</div>
                        <div class="summary-label">Products</div>
                    </div>
                </div>
                
                <h3>📋 Product Rankings</h3>
                <table class="report-table" id="productsTable">
                    <thead><tr><th>#</th><th>Product</th><th>Main</th><th>Category</th><th>Qty Sold</th><th>Sales</th></tr></thead>
                    <tbody>
                        ${allProducts.map((p, i) => `
                            <tr data-main="${p.mainCategory}" data-cat="${p.category}">
                                <td>${i + 1}</td>
                                <td><strong>${p.name}</strong></td>
                                <td>${p.mainCategory}</td>
                                <td>${p.category}</td>
                                <td>${Utils.formatNumber(p.qty)}</td>
                                <td>${Utils.formatCurrency(p.sales)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            this.updateProductsChart();
            
        } catch (error) {
            console.error('Error loading products report:', error);
            container.innerHTML = '<p class="error">Failed to load report</p>';
        }
    },
    
    toggleMetric() {
        const toggle = document.getElementById('metricToggle');
        const options = toggle.querySelectorAll('.toggle-option');
        const currentActive = toggle.querySelector('.toggle-option.active');
        const newActive = currentActive.dataset.value === 'sales' ? options[1] : options[0];
        
        options.forEach(opt => opt.classList.remove('active'));
        newActive.classList.add('active');
        
        this.chartMetric = newActive.dataset.value;
        this.updateProductsChart();
    },
    
    updateProductsChart() {
        const metric = this.chartMetric || 'sales';
        const view = document.getElementById('chartView').value;
        const mainCat = document.getElementById('filterMainCat').value;
        
        // Filter by main category
        let filtered = this.productsData;
        if (mainCat !== 'all') {
            filtered = filtered.filter(p => p.mainCategory === mainCat);
        }
        
        // Sort based on metric
        filtered = [...filtered].sort((a, b) => metric === 'sales' ? b.sales - a.sales : b.qty - a.qty);
        
        // Select view
        let chartData;
        let chartTitle;
        if (view === 'top') {
            chartData = filtered.slice(0, 10);
            chartTitle = 'Top 10 Best Sellers';
        } else if (view === 'top20') {
            chartData = filtered.slice(0, 20);
            chartTitle = 'Top 20 Best Sellers';
        } else if (view === 'bottom') {
            chartData = filtered.slice(-10).reverse();
            chartTitle = 'Bottom 10 Slow Moving';
        } else if (view === 'bottom20') {
            chartData = filtered.slice(-20).reverse();
            chartTitle = 'Bottom 20 Slow Moving';
        } else {
            chartData = filtered;
            chartTitle = 'All Products';
        }
        
        // Update table filter too
        this.filterProductsTable();
        
        // Calculate dynamic width - 100px per bar for clear visibility
        const barWidth = 100;
        const chartWidth = Math.max(chartData.length * barWidth, 800);
        
        // Set canvas dimensions for scrolling
        const scrollContainer = document.getElementById('productsChartScroll');
        const canvas = document.getElementById('productsChart');
        
        // Set actual canvas dimensions (not CSS)
        canvas.width = chartWidth;
        canvas.height = 400;
        
        // Create chart - VERTICAL bars
        this.destroyChart();
        const ctx = canvas.getContext('2d');
        
        const isQty = metric === 'qty';
        const label = isQty ? 'Quantity Sold' : 'Sales (₱)';
        const data = chartData.map(p => isQty ? p.qty : p.sales);
        const bgColor = view.includes('bottom') ? '#e74c3c' : '#D4894A';
        
        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(p => p.name.length > 15 ? p.name.substring(0, 13) + '...' : p.name),
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: bgColor,
                    borderRadius: 4,
                    barThickness: 40
                }]
            },
            options: { 
                responsive: false,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: chartTitle + (mainCat !== 'all' ? ` - ${mainCat}` : '') + ` (${isQty ? 'by Qty' : 'by Sales'})`,
                        color: '#fff',
                        font: { size: 16 }
                    },
                    legend: {
                        labels: { color: '#ccc' }
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => chartData[items[0].dataIndex]?.name || '',
                            label: (item) => isQty ? `Qty: ${Utils.formatNumber(item.raw)}` : Utils.formatCurrency(item.raw)
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#ccc',
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#ccc',
                            callback: (val) => isQty ? val : '₱' + val.toLocaleString()
                        },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            }
        });
    },
    
    filterProductsTable() {
        const mainCat = document.getElementById('filterMainCat')?.value || 'all';
        const subCat = document.getElementById('filterSubCat')?.value || 'all';
        const rows = document.querySelectorAll('#productsTable tbody tr');
        
        rows.forEach(row => {
            const rowMain = row.dataset.main;
            const rowCat = row.dataset.cat;
            const showMain = mainCat === 'all' || rowMain === mainCat;
            const showSub = subCat === 'all' || rowCat === subCat;
            row.style.display = (showMain && showSub) ? '' : 'none';
        });
    },

    async loadCategories() {
        const container = document.getElementById('reportsContent');
        container.innerHTML = '<p class="loading">Loading...</p>';
        
        try {
            const imports = await DB.getAll('salesImports');
            const categoryData = {};
            
            imports.forEach(imp => {
                if (imp.items) {
                    imp.items.forEach(item => {
                        const cat = item.category || 'Other';
                        if (!categoryData[cat]) categoryData[cat] = { name: cat, qty: 0, sales: 0 };
                        categoryData[cat].qty += item.quantity || 0;
                        categoryData[cat].sales += item.netSales || 0;
                    });
                }
            });
            
            const categories = Object.values(categoryData).sort((a, b) => b.sales - a.sales);
            
            if (categories.length === 0) {
                container.innerHTML = '<p class="empty-state">No category data</p>';
                return;
            }
            
            container.innerHTML = `
                <div class="chart-container">
                    <canvas id="categoriesChart"></canvas>
                </div>
                
                <table class="report-table">
                    <thead><tr><th>Category</th><th>Items Sold</th><th>Sales</th></tr></thead>
                    <tbody>
                        ${categories.map(c => `
                            <tr>
                                <td><strong>${c.name}</strong></td>
                                <td>${c.qty}</td>
                                <td>${Utils.formatCurrency(c.sales)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            this.destroyChart();
            const ctx = document.getElementById('categoriesChart').getContext('2d');
            this.chart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: categories.map(c => c.name),
                    datasets: [{
                        data: categories.map(c => c.sales),
                        backgroundColor: ['#D4894A', '#3498db', '#27ae60', '#e74c3c', '#9b59b6', '#f39c12', '#1abc9c', '#34495e']
                    }]
                },
                options: { responsive: true }
            });
            
        } catch (error) {
            console.error('Error loading categories report:', error);
            container.innerHTML = '<p class="error">Failed to load report</p>';
        }
    },

    // View detailed shift + payment breakdown for a specific day
    async viewDayDetails(dateKey) {
        try {
            const sales = await DB.getAll('sales');
            const imports = await DB.getAll('salesImports');
            
            // POS sales for this date
            const daySales = sales.filter(s => s.dateKey === dateKey);
            
            // Group by shift
            const shifts = {};
            let posSalesTotal = 0;
            let posDiscountTotal = 0;
            
            // Grand totals by payment method
            const grandPayments = { cash: 0, gcash: 0, grab: 0, charge: 0 };
            let grandItemCount = 0;
            
            daySales.forEach(sale => {
                const shiftNum = sale.shiftNumber || 0;
                const shiftKey = shiftNum || 'unassigned';
                const cashier = sale.cashierName || sale.createdByName || 'Unknown';
                const method = (sale.paymentMethod || 'cash').toLowerCase();
                
                if (!shifts[shiftKey]) {
                    shifts[shiftKey] = {
                        shiftNumber: shiftNum,
                        cashier: cashier,
                        totalSales: 0,
                        payments: { cash: 0, gcash: 0, grab: 0, charge: 0 },
                        itemCount: 0,
                        discount: 0,
                        transactionCount: 0
                    };
                }
                
                const saleTotal = sale.total || 0;
                const saleDiscount = sale.totalDiscount || 0;
                const itemQty = sale.items ? sale.items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
                
                shifts[shiftKey].totalSales += saleTotal;
                shifts[shiftKey].discount += saleDiscount;
                shifts[shiftKey].itemCount += itemQty;
                shifts[shiftKey].transactionCount++;
                
                // Accumulate payment by method
                if (shifts[shiftKey].payments.hasOwnProperty(method)) {
                    shifts[shiftKey].payments[method] += saleTotal;
                } else {
                    shifts[shiftKey].payments.cash += saleTotal; // fallback
                }
                
                // Update cashier name (use latest)
                if (cashier !== 'Unknown') {
                    shifts[shiftKey].cashier = cashier;
                }
                
                posSalesTotal += saleTotal;
                posDiscountTotal += saleDiscount;
                grandItemCount += itemQty;
                
                if (grandPayments.hasOwnProperty(method)) {
                    grandPayments[method] += saleTotal;
                } else {
                    grandPayments.cash += saleTotal;
                }
            });
            
            // Imported sales total
            let importSalesTotal = 0;
            imports.forEach(imp => {
                if (imp.dailySummaries) {
                    imp.dailySummaries.forEach(day => {
                        const dk = this.parseDate(day.date);
                        if (dk === dateKey) importSalesTotal += day.netSales || 0;
                    });
                }
                if (imp.items) {
                    imp.items.forEach(item => {
                        const dk = this.parseDate(item.date || imp.dateKey || '');
                        if (dk === dateKey) importSalesTotal += item.netSales || 0;
                    });
                }
            });
            
            const grandTotal = posSalesTotal + importSalesTotal;
            
            // Sort shifts by number
            const sortedShifts = Object.values(shifts).sort((a, b) => (a.shiftNumber || 99) - (b.shiftNumber || 99));
            
            // Helper to render payment badge
            const payBadge = (label, amount, color) => {
                if (amount <= 0) return '';
                return `<span style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.8rem;margin:2px;">${label}: ${Utils.formatCurrency(amount)}</span>`;
            };
            
            // Build modal content
            let content = '';
            
            if (sortedShifts.length === 0 && importSalesTotal === 0) {
                content = '<p style="text-align:center;color:#999;padding:20px;">No sales data for this date</p>';
            } else {
                // Grand Summary Cards
                content = `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                        <div style="background:#1a3a4a;padding:12px;border-radius:8px;text-align:center;">
                            <div style="font-size:1.4rem;font-weight:bold;color:#D4894A;">${Utils.formatNumber(grandItemCount)}</div>
                            <div style="font-size:0.8rem;color:#aaa;">Items Sold</div>
                        </div>
                        <div style="background:#1a3a4a;padding:12px;border-radius:8px;text-align:center;">
                            <div style="font-size:1.4rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(grandTotal)}</div>
                            <div style="font-size:0.8rem;color:#aaa;">Grand Total</div>
                        </div>
                    </div>
                `;
                
                // Discount info
                if (posDiscountTotal > 0) {
                    content += `
                        <div style="background:#2d3748;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:0.85rem;color:#f6ad55;">
                            💰 Total Discounts: ${Utils.formatCurrency(posDiscountTotal)}
                        </div>
                    `;
                }
                
                // Per-shift breakdown
                content += '<div style="max-height:500px;overflow-y:auto;">';
                
                sortedShifts.forEach(shift => {
                    const shiftLabel = shift.shiftNumber ? `Shift ${shift.shiftNumber}` : 'Unassigned Shift';
                    content += `
                        <div style="background:#0d2137;border:1px solid #1a3a4a;border-radius:10px;padding:14px;margin-bottom:12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                <div>
                                    <span style="font-size:1.1rem;font-weight:bold;color:#D4894A;">🕐 ${shiftLabel}</span>
                                    <span style="display:block;font-size:0.85rem;color:#8ab4d6;margin-top:2px;">👤 ${shift.cashier}</span>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:1.2rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(shift.totalSales)}</div>
                                    <div style="font-size:0.75rem;color:#aaa;">${shift.transactionCount} txns · ${Utils.formatNumber(shift.itemCount)} items</div>
                                </div>
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                ${payBadge('💵 Cash', shift.payments.cash, '#2d6a4f')}
                                ${payBadge('📱 GCash', shift.payments.gcash, '#1a56db')}
                                ${payBadge('🛵 Grab', shift.payments.grab, '#00b14f')}
                                ${payBadge('📝 Charge', shift.payments.charge, '#b45309')}
                            </div>
                            ${shift.discount > 0 ? `<div style="font-size:0.8rem;color:#f6ad55;margin-top:6px;">💰 Discount: ${Utils.formatCurrency(shift.discount)}</div>` : ''}
                        </div>
                    `;
                });
                
                // Imported sales section (if any)
                if (importSalesTotal > 0) {
                    content += `
                        <div style="background:#0d2137;border:1px solid #1a3a4a;border-radius:10px;padding:14px;margin-bottom:12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-size:1.1rem;font-weight:bold;color:#3498db;">📥 Imported (Loyverse)</span>
                                <span style="font-size:1.2rem;font-weight:bold;color:#3498db;">${Utils.formatCurrency(importSalesTotal)}</span>
                            </div>
                        </div>
                    `;
                }
                
                // Grand Total Payment Summary
                if (posSalesTotal > 0) {
                    content += `
                        <div style="background:#1a2940;border:2px solid #D4894A;border-radius:10px;padding:14px;margin-bottom:8px;">
                            <div style="font-size:1rem;font-weight:bold;color:#D4894A;margin-bottom:10px;text-align:center;">📊 Grand Total by Payment Method</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                <div style="background:#0d2137;padding:8px;border-radius:6px;text-align:center;">
                                    <div style="font-size:0.75rem;color:#aaa;">💵 Cash</div>
                                    <div style="font-size:1.1rem;font-weight:bold;color:#2d6a4f;">${Utils.formatCurrency(grandPayments.cash)}</div>
                                </div>
                                <div style="background:#0d2137;padding:8px;border-radius:6px;text-align:center;">
                                    <div style="font-size:0.75rem;color:#aaa;">📱 GCash</div>
                                    <div style="font-size:1.1rem;font-weight:bold;color:#1a56db;">${Utils.formatCurrency(grandPayments.gcash)}</div>
                                </div>
                                <div style="background:#0d2137;padding:8px;border-radius:6px;text-align:center;">
                                    <div style="font-size:0.75rem;color:#aaa;">🛵 Grab</div>
                                    <div style="font-size:1.1rem;font-weight:bold;color:#00b14f;">${Utils.formatCurrency(grandPayments.grab)}</div>
                                </div>
                                <div style="background:#0d2137;padding:8px;border-radius:6px;text-align:center;">
                                    <div style="font-size:0.75rem;color:#aaa;">📝 Charge</div>
                                    <div style="font-size:1.1rem;font-weight:bold;color:#b45309;">${Utils.formatCurrency(grandPayments.charge)}</div>
                                </div>
                            </div>
                            <div style="text-align:center;margin-top:10px;padding-top:10px;border-top:1px solid #2d3748;">
                                <div style="font-size:0.8rem;color:#aaa;">Grand Total (POS)</div>
                                <div style="font-size:1.3rem;font-weight:bold;color:#27ae60;">${Utils.formatCurrency(posSalesTotal)}</div>
                            </div>
                        </div>
                    `;
                }
                
                content += '</div>';
            }
            
            // Show modal
            Modal.open({
                title: `📋 Daily Sales Report - ${dateKey}`,
                content: content,
                width: '550px',
                showCancel: false,
                cancelText: null,
                saveText: 'Close'
            });
            
        } catch (error) {
            console.error('Error loading day details:', error);
            alert('Failed to load details: ' + error.message);
        }
    }
};
