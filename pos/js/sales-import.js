/**
 * BreadHub POS - Loyverse Import System
 * 
 * RULES:
 * 1. ProofMaster product names = FINAL (never overwritten)
 * 2. ProofMaster costs = TRUE (Loyverse COGS ignored)
 * 3. Loyverse provides: quantity, sales amounts, dates only
 */

const SalesImport = {
    productMapping: {},  // loyverseName -> { productId, variantIndex }
    pendingImport: null,
    
    async init() {
        await this.loadMapping();
        this.renderHistory();
    },
    
    // ========== PRODUCT MAPPING ==========
    
    async loadMapping() {
        try {
            const mappings = await DB.getAll('productMapping');
            this.productMapping = {};
            mappings.forEach(m => {
                this.productMapping[m.loyverseName.toLowerCase()] = {
                    id: m.id,
                    productId: m.productId,
                    productName: m.productName,
                    variantIndex: m.variantIndex || null,
                    variantName: m.variantName || null
                };
            });
            console.log(`Loaded ${mappings.length} product mappings`);
        } catch (error) {
            console.error('Error loading mappings:', error);
        }
    },
    
    async saveMapping(loyverseName, productId, variantIndex = null) {
        const product = POS.products.find(p => p.id === productId);
        if (!product) return false;
        
        const key = loyverseName.toLowerCase();
        const variantName = variantIndex !== null && product.variants?.[variantIndex]
            ? product.variants[variantIndex].name : null;
        
        const data = {
            loyverseName,
            productId,
            productName: product.name,
            variantIndex,
            variantName,
            category: product.category,
            mainCategory: product.mainCategory,
            createdAt: new Date().toISOString()
        };
        
        try {
            if (this.productMapping[key]?.id) {
                await DB.update('productMapping', this.productMapping[key].id, data);
            } else {
                const id = await DB.add('productMapping', data);
                data.id = id;
            }
            this.productMapping[key] = data;
            return true;
        } catch (error) {
            console.error('Error saving mapping:', error);
            return false;
        }
    },
    
    getMappedProduct(loyverseName) {
        const key = loyverseName.toLowerCase();
        const mapping = this.productMapping[key];
        if (!mapping) return null;
        
        const product = POS.products.find(p => p.id === mapping.productId);
        if (!product) return null;
        
        return { product, variantIndex: mapping.variantIndex, variantName: mapping.variantName };
    },
    
    // ========== CSV PARSING ==========
    
    async parseFiles() {
        const itemFile = document.getElementById('importItemFile')?.files[0];
        const dailyFile = document.getElementById('importDailyFile')?.files[0];
        const label = document.getElementById('importLabel')?.value || `Import ${new Date().toLocaleDateString()}`;
        
        if (!itemFile) {
            Toast.error('Please select the Item Sales CSV file');
            return;
        }
        
        try {
            const itemText = await itemFile.text();
            const itemData = this.parseCSV(itemText);
            
            let dailyData = [];
            if (dailyFile) {
                const dailyText = await dailyFile.text();
                dailyData = this.parseCSV(dailyText);
            }
            
            this.showMappingPreview(itemData, dailyData, label);
            
        } catch (error) {
            console.error('Error parsing files:', error);
            Toast.error('Failed to parse CSV files');
        }
    },
    
    parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        return lines.slice(1).map(line => {
            const values = this.parseCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => obj[h] = values[i]?.trim().replace(/"/g, '') || '');
            return obj;
        });
    },
    
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);
        return values;
    },

    // ========== MAPPING PREVIEW ==========
    
    showMappingPreview(itemData, dailyData, label) {
        const unmapped = [];
        const mapped = [];
        
        itemData.forEach(item => {
            const name = item['Item name'];
            const result = this.getMappedProduct(name);
            
            if (result) {
                mapped.push({
                    loyverseName: name,
                    productName: result.product.name,
                    variantName: result.variantName,
                    qty: parseFloat(item['Items sold']) || 0,
                    netSales: parseFloat(item['Net sales']) || 0
                });
            } else {
                unmapped.push({
                    loyverseName: name,
                    sku: item['SKU'],
                    category: item['Category'],
                    qty: parseFloat(item['Items sold']) || 0,
                    netSales: parseFloat(item['Net sales']) || 0
                });
            }
        });
        
        unmapped.sort((a, b) => b.netSales - a.netSales);
        this.pendingImport = { itemData, dailyData, label, unmapped, mapped };
        
        const totalSales = itemData.reduce((sum, i) => sum + (parseFloat(i['Net sales']) || 0), 0);
        const preview = document.getElementById('importPreview');
        
        preview.style.display = 'block';
        preview.innerHTML = `
            <h3>📊 Import Preview</h3>
            
            <div class="import-stats">
                <div class="stat-box">
                    <div class="stat-value">${itemData.length}</div>
                    <div class="stat-label">Total Items</div>
                </div>
                <div class="stat-box success">
                    <div class="stat-value">${mapped.length}</div>
                    <div class="stat-label">Mapped ✓</div>
                </div>
                <div class="stat-box ${unmapped.length > 0 ? 'warning' : 'success'}">
                    <div class="stat-value">${unmapped.length}</div>
                    <div class="stat-label">Need Mapping</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${Utils.formatCurrency(totalSales)}</div>
                    <div class="stat-label">Total Sales</div>
                </div>
            </div>
            
            ${unmapped.length > 0 ? `
                <h4>⚠️ Unmapped Products (${unmapped.length})</h4>
                <div class="mapping-table-wrapper">
                    <table class="mapping-table">
                        <thead>
                            <tr>
                                <th>Loyverse Name</th>
                                <th>Category</th>
                                <th>Sales</th>
                                <th>Map To ProofMaster Product</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${unmapped.map((item, idx) => `
                                <tr>
                                    <td>
                                        <strong>${item.loyverseName}</strong>
                                        <br><small>SKU: ${item.sku}</small>
                                    </td>
                                    <td>${item.category}</td>
                                    <td>${Utils.formatCurrency(item.netSales)}</td>
                                    <td>
                                        <select class="form-select mapping-select" data-idx="${idx}">
                                            <option value="">-- Select --</option>
                                            <option value="__skip__">⏭️ Skip</option>
                                            ${this.getProductOptions(item.loyverseName)}
                                        </select>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="mapping-actions">
                    <button class="btn btn-secondary" onclick="SalesImport.autoMap()">🔮 Auto-Map Similar</button>
                    <button class="btn btn-secondary" onclick="SalesImport.skipAll()">⏭️ Skip All</button>
                </div>
            ` : `
                <div class="success-box">✅ All products are mapped!</div>
            `}
            
            ${mapped.length > 0 ? `
                <details>
                    <summary>✅ Already Mapped (${mapped.length})</summary>
                    <div class="mapped-list">
                        ${mapped.slice(0, 20).map(m => `
                            <div class="mapped-item">
                                <span class="loy-name">${m.loyverseName}</span>
                                <span class="arrow">→</span>
                                <span class="pm-name">${m.productName}${m.variantName ? ` (${m.variantName})` : ''}</span>
                            </div>
                        `).join('')}
                        ${mapped.length > 20 ? `<div class="more">...and ${mapped.length - 20} more</div>` : ''}
                    </div>
                </details>
            ` : ''}
            
            <div class="import-actions">
                <button class="btn btn-primary btn-lg" onclick="SalesImport.executeImport()">
                    ${unmapped.length > 0 ? '💾 Save Mappings & Import' : '📥 Import Now'}
                </button>
            </div>
        `;
    },
    
    getProductOptions(loyverseName) {
        let html = '';
        const byCategory = {};
        
        POS.products.forEach(p => {
            const cat = p.category || 'other';
            if (!byCategory[cat]) byCategory[cat] = [];
            
            byCategory[cat].push({ id: p.id, name: p.name, variantIndex: null });
            
            if (p.hasVariants && p.variants) {
                p.variants.forEach((v, idx) => {
                    byCategory[cat].push({
                        id: p.id, name: `${p.name} (${v.name})`, variantIndex: idx
                    });
                });
            }
        });
        
        Object.keys(byCategory).sort().forEach(cat => {
            html += `<optgroup label="${cat}">`;
            byCategory[cat].forEach(p => {
                const val = p.variantIndex !== null ? `${p.id}|${p.variantIndex}` : p.id;
                html += `<option value="${val}">${p.name}</option>`;
            });
            html += '</optgroup>';
        });
        
        return html;
    },
    
    autoMap() {
        const selects = document.querySelectorAll('.mapping-select');
        let count = 0;
        
        selects.forEach((select, idx) => {
            if (select.value) return;
            
            const item = this.pendingImport.unmapped[idx];
            const loyName = item.loyverseName.toLowerCase();
            
            for (const p of POS.products) {
                const pName = p.name.toLowerCase();
                if (loyName.includes(pName) || pName.includes(loyName)) {
                    select.value = p.id;
                    count++;
                    break;
                }
                
                if (p.hasVariants && p.variants) {
                    for (let i = 0; i < p.variants.length; i++) {
                        const vName = p.variants[i].name.toLowerCase();
                        if (loyName.includes(pName) && loyName.includes(vName)) {
                            select.value = `${p.id}|${i}`;
                            count++;
                            break;
                        }
                    }
                }
            }
        });
        
        Toast.success(`Auto-mapped ${count} products`);
    },
    
    skipAll() {
        document.querySelectorAll('.mapping-select').forEach(s => {
            if (!s.value) s.value = '__skip__';
        });
        Toast.info('All unmapped items set to skip');
    },

    // ========== EXECUTE IMPORT ==========
    
    async executeImport() {
        const { itemData, dailyData, label, unmapped } = this.pendingImport;
        
        // Save new mappings first
        const selects = document.querySelectorAll('.mapping-select');
        let mappingSaved = 0;
        
        for (let i = 0; i < selects.length; i++) {
            const value = selects[i].value;
            const item = unmapped[i];
            
            if (!value || value === '__skip__') continue;
            
            let productId, variantIndex = null;
            if (value.includes('|')) {
                [productId, variantIndex] = value.split('|');
                variantIndex = parseInt(variantIndex);
            } else {
                productId = value;
            }
            
            await this.saveMapping(item.loyverseName, productId, variantIndex);
            mappingSaved++;
        }
        
        if (mappingSaved > 0) {
            Toast.success(`Saved ${mappingSaved} mappings`);
        }
        
        // Reload mappings
        await this.loadMapping();
        
        // Process items - USE TRUE COSTS FROM PROOFMASTER
        const importedItems = [];
        let skipped = 0;
        let totalQty = 0;
        let totalNetSales = 0;
        
        for (const item of itemData) {
            const name = item['Item name'];
            const qty = parseFloat(item['Items sold']) || 0;
            const grossSales = parseFloat(item['Gross sales']) || 0;
            const netSales = parseFloat(item['Net sales']) || 0;
            const discounts = parseFloat(item['Discounts']) || 0;
            
            const mapped = this.getMappedProduct(name);
            
            if (!mapped) {
                skipped++;
                continue;
            }
            
            // Get TRUE cost from ProofMaster product
            const trueCost = this.getTrueCostFromProduct(mapped.product, mapped.variantIndex);
            const totalCost = trueCost * qty;
            const trueProfit = netSales - totalCost;
            
            importedItems.push({
                loyverseName: name,
                loyverseSKU: item['SKU'],
                loyverseCategory: item['Category'],
                
                // ProofMaster product info
                productId: mapped.product.id,
                productName: mapped.product.name,
                category: mapped.product.category,
                mainCategory: mapped.product.mainCategory,
                variantIndex: mapped.variantIndex,
                variantName: mapped.variantName,
                
                // Sales data from Loyverse
                quantity: qty,
                grossSales,
                discounts,
                netSales,
                
                // TRUE costs from ProofMaster (Loyverse COGS ignored!)
                trueCostPerUnit: trueCost,
                trueTotalCost: totalCost,
                trueProfit,
                trueMargin: netSales > 0 ? (trueProfit / netSales) * 100 : 0
            });
            
            totalQty += qty;
            totalNetSales += netSales;
        }
        
        // Process daily summaries
        const dailySummaries = [];
        if (dailyData.length > 0) {
            for (const day of dailyData) {
                const gross = parseFloat(day['Gross sales']) || 0;
                if (gross === 0) continue;
                
                dailySummaries.push({
                    date: day['Date'],
                    grossSales: gross,
                    netSales: parseFloat(day['Net sales']) || 0,
                    discounts: parseFloat(day['Discounts']) || 0,
                    // Loyverse COGS ignored - will calculate from items
                    loyverseCOGS: parseFloat(day['Cost of goods']) || 0
                });
            }
        }
        
        // Save import record
        const importRecord = {
            label,
            importedAt: new Date().toISOString(),
            source: 'loyverse',
            
            summary: {
                totalItems: itemData.length,
                importedItems: importedItems.length,
                skippedItems: skipped,
                totalQuantity: totalQty,
                totalNetSales,
                daysCount: dailySummaries.length
            },
            
            items: importedItems,
            dailySummaries,
            
            importedBy: Auth.userData?.id || 'unknown',
            importedByName: Auth.userData?.name || 'Unknown'
        };
        
        try {
            await DB.add('salesImports', importRecord);
            
            Toast.success(`Imported ${importedItems.length} items, skipped ${skipped}`);
            
            // Clear form and refresh
            document.getElementById('importItemFile').value = '';
            document.getElementById('importDailyFile').value = '';
            document.getElementById('importLabel').value = '';
            document.getElementById('importPreview').style.display = 'none';
            
            this.renderHistory();
            
        } catch (error) {
            console.error('Error saving import:', error);
            Toast.error('Failed to save import');
        }
    },
    
    // Get TRUE cost from ProofMaster product (not Loyverse!)
    getTrueCostFromProduct(product, variantIndex) {
        // If variant has recipe with calculated cost, use it
        if (variantIndex !== null && product.variants?.[variantIndex]) {
            const variant = product.variants[variantIndex];
            if (variant.recipe?.calculatedCost) {
                return variant.recipe.calculatedCost;
            }
        }
        
        // Fall back to product-level cost
        if (product.costs?.totalCost) {
            return product.costs.totalCost;
        }
        
        // Last resort: estimate from margin
        if (product.finalSRP && product.pricing?.markupPercent) {
            const markup = product.pricing.markupPercent / 100;
            return product.finalSRP / (1 + markup);
        }
        
        return 0;
    },

    // ========== IMPORT HISTORY ==========
    
    async renderHistory() {
        const container = document.getElementById('importHistoryList');
        if (!container) return;
        
        try {
            const imports = await DB.getAll('salesImports');
            imports.sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
            
            if (imports.length === 0) {
                container.innerHTML = '<p class="empty-state">No imports yet</p>';
                return;
            }
            
            container.innerHTML = imports.map(imp => `
                <div class="import-history-item">
                    <div class="import-info">
                        <strong>${imp.label}</strong>
                        <span class="import-date">${Utils.formatDateTime(imp.importedAt)}</span>
                    </div>
                    <div class="import-stats-mini">
                        <span>${imp.summary?.importedItems || 0} items</span>
                        <span>${Utils.formatCurrency(imp.summary?.totalNetSales || 0)}</span>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="SalesImport.viewImport('${imp.id}')">
                        View
                    </button>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading import history:', error);
            container.innerHTML = '<p class="empty-state">Error loading history</p>';
        }
    },
    
    async viewImport(importId) {
        try {
            const imp = await DB.get('salesImports', importId);
            if (!imp) {
                Toast.error('Import not found');
                return;
            }
            
            Modal.open({
                title: `📥 ${imp.label}`,
                content: `
                    <div class="import-detail">
                        <div class="import-summary">
                            <p><strong>Imported:</strong> ${Utils.formatDateTime(imp.importedAt)}</p>
                            <p><strong>By:</strong> ${imp.importedByName}</p>
                            <p><strong>Source:</strong> ${imp.source}</p>
                        </div>
                        
                        <div class="import-stats">
                            <div class="stat-box">
                                <div class="stat-value">${imp.summary?.importedItems || 0}</div>
                                <div class="stat-label">Items Imported</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${imp.summary?.totalQuantity || 0}</div>
                                <div class="stat-label">Total Qty</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${Utils.formatCurrency(imp.summary?.totalNetSales || 0)}</div>
                                <div class="stat-label">Net Sales</div>
                            </div>
                        </div>
                        
                        <h4>Top Items</h4>
                        <div class="import-items-list">
                            ${(imp.items || []).slice(0, 10).map(item => `
                                <div class="import-item-row">
                                    <span class="item-name">${item.productName}${item.variantName ? ` (${item.variantName})` : ''}</span>
                                    <span class="item-qty">${item.quantity} sold</span>
                                    <span class="item-sales">${Utils.formatCurrency(item.netSales)}</span>
                                </div>
                            `).join('')}
                            ${(imp.items?.length || 0) > 10 ? `<div class="more">...and ${imp.items.length - 10} more</div>` : ''}
                        </div>
                    </div>
                `,
                showFooter: false,
                width: '600px'
            });
            
        } catch (error) {
            console.error('Error viewing import:', error);
            Toast.error('Failed to load import details');
        }
    }
};
