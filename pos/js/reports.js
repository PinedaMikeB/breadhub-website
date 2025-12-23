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
                        <tr><th>Date</th><th>POS Sales</th><th>Imported Sales</th><th>Total</th><th>Source</th></tr>
                    </thead>
                    <tbody>
                        ${days.slice().reverse().slice(0, 30).map(d => `
                            <tr>
                                <td>${d.date}</td>
                                <td>${d.posSales > 0 ? Utils.formatCurrency(d.posSales) : '-'}</td>
                                <td>${d.importSales > 0 ? Utils.formatCurrency(d.importSales) : '-'}</td>
                                <td><strong>${Utils.formatCurrency(d.posSales + d.importSales)}</strong></td>
                                <td><span class="source-badge ${d.source}">${d.source}</span></td>
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
                            // Find product info
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
            
            const top10 = allProducts.slice(0, 10);
            const totalSales = allProducts.reduce((s, p) => s + p.sales, 0);
            const totalQty = allProducts.reduce((s, p) => s + p.qty, 0);
            
            container.innerHTML = `
                <div class="report-filters">
                    <label>Main Category:</label>
                    <select id="filterMainCat" onchange="Reports.filterProductsTable()">
                        <option value="all">All</option>
                        ${[...mainCategories].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <label>Sub-Category:</label>
                    <select id="filterSubCat" onchange="Reports.filterProductsTable()">
                        <option value="all">All</option>
                        ${[...categories].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                
                <div class="chart-container">
                    <canvas id="productsChart"></canvas>
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
                
                <h3>🏆 Best Sellers</h3>
                <table class="report-table" id="productsTable">
                    <thead><tr><th>#</th><th>Product</th><th>Main</th><th>Category</th><th>Qty Sold</th><th>Sales</th></tr></thead>
                    <tbody>
                        ${allProducts.slice(0, 50).map((p, i) => `
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
            
            // Store for filtering
            this.productsData = allProducts;
            
            this.destroyChart();
            const ctx = document.getElementById('productsChart').getContext('2d');
            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: top10.map(p => p.name.substring(0, 15)),
                    datasets: [{
                        label: 'Sales (₱)',
                        data: top10.map(p => p.sales),
                        backgroundColor: '#D4894A'
                    }]
                },
                options: { indexAxis: 'y', responsive: true }
            });
            
        } catch (error) {
            console.error('Error loading products report:', error);
            container.innerHTML = '<p class="error">Failed to load report</p>';
        }
    },
    
    filterProductsTable() {
        const mainCat = document.getElementById('filterMainCat').value;
        const subCat = document.getElementById('filterSubCat').value;
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
    }
};
