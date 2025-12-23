/**
 * BreadHub POS - Loyverse Import System v3 - Fixed undefined mainCategory
 * 
 * RULES:
 * 1. ProofMaster product names = FINAL (never overwritten)
 * 2. ProofMaster costs = TRUE (Loyverse COGS ignored)
 * 3. Loyverse provides: quantity, sales amounts, dates only
 * 4. Skip duplicate dates (no double-counting)
 * 5. Better auto-mapping with fuzzy matching
 */

const SalesImport = {
    productMapping: {},
    pendingImport: null,
    existingDates: new Set(),
    
    async init() {
        await this.loadMapping();
        await this.loadExistingDates();
        this.renderHistory();
    },
    
    // Load all dates that have been imported to prevent duplicates
    async loadExistingDates() {
        try {
            const imports = await DB.getAll('salesImports');
            this.existingDates = new Set();
            imports.forEach(imp => {
                if (imp.dailySummaries) {
                    imp.dailySummaries.forEach(day => {
                        const dateKey = this.parseDate(day.date);
                        this.existingDates.add(dateKey);
                    });
                }
            });
            console.log(`Loaded ${this.existingDates.size} existing dates`);
        } catch (error) {
            console.error('Error loading existing dates:', error);
        }
    },
    
    parseDate(dateStr) {
        if (dateStr.includes('/')) {
            const [m, d, y] = dateStr.split('/');
            const year = y.length === 2 ? `20${y}` : y;
            return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return dateStr;
    },

    // ========== PRODUCT MAPPING ==========
    
    async loadMapping() {
        try {
            const mappings = await DB.getAll('productMapping');
            this.productMapping = {};
            mappings.forEach(m => {
                this.productMapping[m.loyverseName.toLowerCase().trim()] = {
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
        
        const key = loyverseName.toLowerCase().trim();
        const variantName = variantIndex !== null && product.variants?.[variantIndex]
            ? product.variants[variantIndex].name : null;
        
        const data = {
            loyverseName: loyverseName.trim(),
            productId,
            productName: product.name,
            variantIndex: variantIndex !== null ? variantIndex : null,
            variantName: variantName || null,
            category: product.category || 'other',
            createdAt: new Date().toISOString()
        };
        // Only add mainCategory if it exists (Firebase doesn't allow undefined)
        if (product.mainCategory) {
            data.mainCategory = product.mainCategory;
        }
        
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
        const key = loyverseName.toLowerCase().trim();
        const mapping = this.productMapping[key];
        if (!mapping) return null;
        
        const product = POS.products.find(p => p.id === mapping.productId);
        if (!product) return null;
        
        return { product, variantIndex: mapping.variantIndex, variantName: mapping.variantName };
    },
    
    // Normalize name for comparison
    normalizeName(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/\s+/g, '');
    },
    
    // Calculate similarity between two strings
    similarity(str1, str2) {
        const s1 = this.normalizeName(str1);
        const s2 = this.normalizeName(str2);
        
        if (s1 === s2) return 1;
        if (s1.includes(s2) || s2.includes(s1)) return 0.9;
        
        // Simple character match ratio
        let matches = 0;
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        
        for (let char of shorter) {
            if (longer.includes(char)) matches++;
        }
        return matches / longer.length;
    },

    // Find best matching product for a Loyverse name
    findBestMatch(loyverseName) {
        let bestMatch = null;
        let bestScore = 0;
        
        for (const product of POS.products) {
            // Check main product name
            const score = this.similarity(loyverseName, product.name);
            if (score > bestScore && score >= 0.7) {
                bestScore = score;
                bestMatch = { product, variantIndex: null, score };
            }
            
            // Check variants
            if (product.hasVariants && product.variants) {
                for (let i = 0; i < product.variants.length; i++) {
                    const v = product.variants[i];
                    const fullName = `${product.name} ${v.name}`;
                    const variantScore = this.similarity(loyverseName, fullName);
                    if (variantScore > bestScore && variantScore >= 0.7) {
                        bestScore = variantScore;
                        bestMatch = { product, variantIndex: i, score: variantScore };
                    }
                }
            }
        }
        
        return bestMatch;
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
            
            // Check for duplicate dates
            const newDates = [];
            const skipDates = [];
            
            dailyData.forEach(day => {
                const dateKey = this.parseDate(day['Date']);
                if (this.existingDates.has(dateKey)) {
                    skipDates.push(dateKey);
                } else {
                    newDates.push(dateKey);
                }
            });
            
            if (skipDates.length > 0 && newDates.length === 0) {
                Toast.error(`All ${skipDates.length} dates already imported! Nothing new to import.`);
                return;
            }
            
            this.showMappingPreview(itemData, dailyData, label, skipDates, newDates);
            
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
    
    showMappingPreview(itemData, dailyData, label, skipDates, newDates) {
        const unmapped = [];
        const mapped = [];
        const autoMapped = [];
        
        itemData.forEach(item => {
            const name = item['Item name'];
            if (!name) return;
            
            // Check existing mapping
            let result = this.getMappedProduct(name);
            
            // Try auto-match if not mapped
            if (!result) {
                const match = this.findBestMatch(name);
                if (match && match.score >= 0.8) {
                    autoMapped.push({
                        loyverseName: name,
                        product: match.product,
                        variantIndex: match.variantIndex,
                        score: match.score,
                        qty: parseFloat(item['Items sold']) || 0,
                        netSales: parseFloat(item['Net sales']) || 0
                    });
                    return;
                }
            }
            
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
                    netSales: parseFloat(item['Net sales']) || 0,
                    suggestedMatch: this.findBestMatch(name)
                });
            }
        });
        
        unmapped.sort((a, b) => b.netSales - a.netSales);
        this.pendingImport = { itemData, dailyData, label, unmapped, mapped, autoMapped, skipDates, newDates };
        
        const totalSales = itemData.reduce((sum, i) => sum + (parseFloat(i['Net sales']) || 0), 0);
        const preview = document.getElementById('importPreview');
        
        preview.style.display = 'block';

        preview.innerHTML = `
            <h3>📊 Import Preview</h3>
            
            ${skipDates.length > 0 ? `
                <div class="warning-box">
                    ⚠️ <strong>${skipDates.length} dates already imported</strong> - will be skipped to avoid duplicates.
                    ${newDates.length > 0 ? `<br>✅ ${newDates.length} new dates will be imported.` : ''}
                </div>
            ` : ''}
            
            <div class="import-stats">
                <div class="stat-box">
                    <div class="stat-value">${itemData.length}</div>
                    <div class="stat-label">Total Items</div>
                </div>
                <div class="stat-box success">
                    <div class="stat-value">${mapped.length}</div>
                    <div class="stat-label">Already Mapped</div>
                </div>
                <div class="stat-box success">
                    <div class="stat-value">${autoMapped.length}</div>
                    <div class="stat-label">Auto-Matched</div>
                </div>
                <div class="stat-box ${unmapped.length > 0 ? 'warning' : 'success'}">
                    <div class="stat-value">${unmapped.length}</div>
                    <div class="stat-label">Need Review</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${Utils.formatCurrency(totalSales)}</div>
                    <div class="stat-label">Total Sales</div>
                </div>
            </div>
            
            ${autoMapped.length > 0 ? `
                <details open>
                    <summary>🤖 Auto-Matched (${autoMapped.length}) - Review & Confirm</summary>
                    <div class="mapping-table-wrapper">
                        <table class="mapping-table">
                            <thead>
                                <tr><th>Loyverse Name</th><th>Match Score</th><th>→ ProofMaster Product</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                ${autoMapped.map((item, idx) => `
                                    <tr>
                                        <td><strong>${item.loyverseName}</strong></td>
                                        <td><span class="score-badge">${Math.round(item.score * 100)}%</span></td>
                                        <td>${item.product.name}${item.variantIndex !== null ? ` (${item.product.variants[item.variantIndex].name})` : ''}</td>
                                        <td>
                                            <label><input type="checkbox" class="auto-accept" data-idx="${idx}" checked> Accept</label>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>
            ` : ''}

            ${unmapped.length > 0 ? `
                <details ${autoMapped.length === 0 ? 'open' : ''}>
                    <summary>⚠️ Unmapped Products (${unmapped.length})</summary>
                    <div class="mapping-table-wrapper">
                        <table class="mapping-table">
                            <thead>
                                <tr><th>Loyverse Name</th><th>Category</th><th>Sales</th><th>Map To</th></tr>
                            </thead>
                            <tbody>
                                ${unmapped.map((item, idx) => `
                                    <tr>
                                        <td>
                                            <strong>${item.loyverseName}</strong>
                                            ${item.suggestedMatch ? `<br><small class="suggestion">Suggested: ${item.suggestedMatch.product.name} (${Math.round(item.suggestedMatch.score * 100)}%)</small>` : ''}
                                        </td>
                                        <td>${item.category}</td>
                                        <td>${Utils.formatCurrency(item.netSales)}</td>
                                        <td>
                                            <select class="form-select mapping-select" data-idx="${idx}">
                                                <option value="">-- Select --</option>
                                                <option value="__skip__">⏭️ Skip this item</option>
                                                ${this.getProductOptions(item.loyverseName, item.suggestedMatch)}
                                            </select>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="mapping-actions">
                        <button class="btn btn-secondary" onclick="SalesImport.acceptSuggestions()">✅ Accept All Suggestions</button>
                        <button class="btn btn-secondary" onclick="SalesImport.skipAllUnmapped()">⏭️ Skip All Unmapped</button>
                    </div>
                </details>
            ` : ''}
            
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
                    📥 Import Data
                </button>
            </div>
        `;
    },

    getProductOptions(loyverseName, suggestedMatch) {
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
                const selected = suggestedMatch && suggestedMatch.product.id === p.id && suggestedMatch.variantIndex === p.variantIndex ? 'selected' : '';
                html += `<option value="${val}" ${selected}>${p.name}</option>`;
            });
            html += '</optgroup>';
        });
        
        return html;
    },
    
    acceptSuggestions() {
        document.querySelectorAll('.mapping-select').forEach(select => {
            // The suggested option should already be selected, just confirm it's not empty
            if (!select.value && select.querySelector('option[selected]')) {
                select.value = select.querySelector('option[selected]').value;
            }
        });
        Toast.success('Accepted all suggestions');
    },
    
    skipAllUnmapped() {
        document.querySelectorAll('.mapping-select').forEach(s => {
            if (!s.value) s.value = '__skip__';
        });
        Toast.info('All unmapped items set to skip');
    },

    // ========== EXECUTE IMPORT ==========
    
    async executeImport() {
        const { itemData, dailyData, label, unmapped, autoMapped, skipDates } = this.pendingImport;
        
        // Save auto-matched mappings
        let mappingSaved = 0;
        const acceptCheckboxes = document.querySelectorAll('.auto-accept:checked');
        
        for (const checkbox of acceptCheckboxes) {
            const idx = parseInt(checkbox.dataset.idx);
            const item = autoMapped[idx];
            if (item) {
                await this.saveMapping(item.loyverseName, item.product.id, item.variantIndex);
                mappingSaved++;
            }
        }
        
        // Save manual mappings
        const selects = document.querySelectorAll('.mapping-select');
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
            Toast.success(`Saved ${mappingSaved} new mappings`);
            await this.loadMapping();
        }

        // Process items - USE TRUE COSTS FROM PROOFMASTER
        const importedItems = [];
        let skipped = 0;
        let totalQty = 0;
        let totalNetSales = 0;
        
        for (const item of itemData) {
            const name = item['Item name'];
            if (!name) continue;
            
            const qty = parseFloat(item['Items sold']) || 0;
            const grossSales = parseFloat(item['Gross sales']) || 0;
            const netSales = parseFloat(item['Net sales']) || 0;
            const discounts = parseFloat(item['Discounts']) || 0;
            
            const mapped = this.getMappedProduct(name);
            
            if (!mapped) {
                skipped++;
                continue;
            }
            
            const trueCost = this.getTrueCostFromProduct(mapped.product, mapped.variantIndex);
            const totalCost = trueCost * qty;
            const trueProfit = netSales - totalCost;
            
            const itemRecord = {
                loyverseName: name,
                loyverseSKU: item['SKU'] || '',
                loyverseCategory: item['Category'] || '',
                productId: mapped.product.id,
                productName: mapped.product.name,
                category: mapped.product.category || 'other',
                variantIndex: mapped.variantIndex !== null ? mapped.variantIndex : null,
                variantName: mapped.variantName || null,
                quantity: qty,
                grossSales,
                discounts,
                netSales,
                trueCostPerUnit: trueCost,
                trueTotalCost: totalCost,
                trueProfit,
                trueMargin: netSales > 0 ? (trueProfit / netSales) * 100 : 0
            };
            // Only add mainCategory if it exists
            if (mapped.product.mainCategory) {
                itemRecord.mainCategory = mapped.product.mainCategory;
            }
            importedItems.push(itemRecord);
            
            totalQty += qty;
            totalNetSales += netSales;
        }
        
        // Process daily summaries - SKIP EXISTING DATES
        const dailySummaries = [];
        let skippedDays = 0;
        
        for (const day of dailyData) {
            const dateKey = this.parseDate(day['Date']);
            
            // Skip if date already imported
            if (this.existingDates.has(dateKey)) {
                skippedDays++;
                continue;
            }
            
            const gross = parseFloat(day['Gross sales']) || 0;
            if (gross === 0) continue;
            
            dailySummaries.push({
                date: day['Date'],
                dateKey,
                grossSales: gross,
                netSales: parseFloat(day['Net sales']) || 0,
                discounts: parseFloat(day['Discounts']) || 0,
                loyverseCOGS: parseFloat(day['Cost of goods']) || 0
            });
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
                daysCount: dailySummaries.length,
                skippedDays: skippedDays
            },
            
            items: importedItems,
            dailySummaries,
            
            importedBy: Auth.userData?.id || 'unknown',
            importedByName: Auth.userData?.name || 'Unknown'
        };
        
        try {
            await DB.add('salesImports', importRecord);
            
            // Update existing dates cache
            dailySummaries.forEach(d => this.existingDates.add(d.dateKey));
            
            Toast.success(`Imported ${importedItems.length} items, ${dailySummaries.length} days. Skipped ${skipped} unmapped items, ${skippedDays} duplicate days.`);
            
            // Clear form
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
    
    getTrueCostFromProduct(product, variantIndex) {
        if (variantIndex !== null && product.variants?.[variantIndex]) {
            const variant = product.variants[variantIndex];
            if (variant.recipe?.calculatedCost) return variant.recipe.calculatedCost;
        }
        if (product.costs?.totalCost) return product.costs.totalCost;
        if (product.finalSRP && product.pricing?.markupPercent) {
            return product.finalSRP / (1 + product.pricing.markupPercent / 100);
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
                        <span>${imp.summary?.daysCount || 0} days</span>
                        <span>${Utils.formatCurrency(imp.summary?.totalNetSales || 0)}</span>
                    </div>
                    <div class="import-actions-mini">
                        <button class="btn btn-secondary btn-sm" onclick="SalesImport.viewImport('${imp.id}')">View</button>
                        <button class="btn btn-danger btn-sm" onclick="SalesImport.deleteImport('${imp.id}')">🗑️</button>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading import history:', error);
        }
    },

    async deleteImport(importId) {
        if (!confirm('Delete this import? This will remove all data from this import batch.')) return;
        
        try {
            await DB.delete('salesImports', importId);
            Toast.success('Import deleted');
            await this.loadExistingDates(); // Reload dates
            this.renderHistory();
        } catch (error) {
            console.error('Error deleting import:', error);
            Toast.error('Failed to delete import');
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
                        </div>
                        
                        <div class="import-stats">
                            <div class="stat-box">
                                <div class="stat-value">${imp.summary?.importedItems || 0}</div>
                                <div class="stat-label">Items</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${imp.summary?.daysCount || 0}</div>
                                <div class="stat-label">Days</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${Utils.formatCurrency(imp.summary?.totalNetSales || 0)}</div>
                                <div class="stat-label">Net Sales</div>
                            </div>
                        </div>
                        
                        <h4>Top Items</h4>
                        <div class="import-items-list">
                            ${(imp.items || []).sort((a,b) => b.netSales - a.netSales).slice(0, 15).map(item => `
                                <div class="import-item-row">
                                    <span class="item-name">${item.productName}${item.variantName ? ` (${item.variantName})` : ''}</span>
                                    <span class="item-qty">${item.quantity} sold</span>
                                    <span class="item-sales">${Utils.formatCurrency(item.netSales)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `,
                showFooter: false
            });
            
        } catch (error) {
            console.error('Error viewing import:', error);
            Toast.error('Failed to load import details');
        }
    },
    
    // Clear all imports (for fixing data)
    async clearAllImports() {
        if (!confirm('⚠️ Delete ALL import data? This cannot be undone!')) return;
        if (!confirm('Are you REALLY sure? Type "DELETE" to confirm.')) return;
        
        try {
            const imports = await DB.getAll('salesImports');
            for (const imp of imports) {
                await DB.delete('salesImports', imp.id);
            }
            this.existingDates = new Set();
            Toast.success('All imports cleared');
            this.renderHistory();
        } catch (error) {
            console.error('Error clearing imports:', error);
            Toast.error('Failed to clear imports');
        }
    }
};
