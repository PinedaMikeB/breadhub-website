/**
 * BreadHub POS - Receipt Printing Module v2
 * 
 * Supports:
 * - WiFi/Network printers (via browser print)
 * - USB printers (via Web Serial API)
 * - Bluetooth printers (via Web Bluetooth - limited)
 * - Auto-print on sale completion
 */

const ReceiptPrinter = {
    // Printer settings
    settings: {
        enabled: true,
        autoPrint: true,
        printerType: 'browser', // 'browser', 'serial', 'network'
        paperWidth: '58mm', // '58mm' or '80mm'
        networkIP: '',
        networkPort: 9100
    },
    
    // Connection state
    port: null,
    writer: null,
    isConnected: false,
    printerWidth: 32, // characters for 58mm, 48 for 80mm
    
    // ESC/POS Commands
    ESC: 0x1B,
    GS: 0x1D,
    
    // Initialize - load settings
    async init() {
        await this.loadSettings();
        console.log('Printer initialized:', this.settings);
    },
    
    async loadSettings() {
        try {
            const settings = await DB.get('settings', 'printer');
            if (settings) {
                this.settings = { ...this.settings, ...settings };
                this.printerWidth = this.settings.paperWidth === '80mm' ? 48 : 32;
            }
        } catch (e) {
            console.log('Using default printer settings');
        }
    },
    
    async saveSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.printerWidth = this.settings.paperWidth === '80mm' ? 48 : 32;
        
        try {
            await DB.set('settings', 'printer', this.settings);
            Toast.success('Printer settings saved');
        } catch (e) {
            console.error('Failed to save printer settings:', e);
            Toast.error('Failed to save settings');
        }
    },
    
    // Show printer settings modal
    showSettings() {
        Modal.open({
            title: '🖨️ Printer Settings',
            content: `
                <div class="printer-settings">
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="printerEnabled" ${this.settings.enabled ? 'checked' : ''}>
                            <span>Enable Printing</span>
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="autoPrint" ${this.settings.autoPrint ? 'checked' : ''}>
                            <span>Auto-print on Sale Complete</span>
                        </label>
                        <small class="form-hint">Automatically print receipt when checkout is completed</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Paper Width</label>
                        <select id="paperWidth" class="form-input">
                            <option value="58mm" ${this.settings.paperWidth === '58mm' ? 'selected' : ''}>58mm (Small)</option>
                            <option value="80mm" ${this.settings.paperWidth === '80mm' ? 'selected' : ''}>80mm (Standard)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Printer Type</label>
                        <select id="printerType" class="form-input" onchange="ReceiptPrinter.onPrinterTypeChange(this.value)">
                            <option value="browser" ${this.settings.printerType === 'browser' ? 'selected' : ''}>WiFi/System Printer (Recommended)</option>
                            <option value="serial" ${this.settings.printerType === 'serial' ? 'selected' : ''}>USB Serial (Chrome only)</option>
                        </select>
                        <small class="form-hint">WiFi printers work through your device's system print dialog</small>
                    </div>
                    
                    <div id="serialOptions" style="display: ${this.settings.printerType === 'serial' ? 'block' : 'none'}">
                        <div class="form-group">
                            <button type="button" class="btn btn-secondary" onclick="ReceiptPrinter.connectSerial()">
                                🔌 Connect USB Printer
                            </button>
                            <span id="serialStatus" class="status-text">${this.isConnected ? '✅ Connected' : '❌ Not connected'}</span>
                        </div>
                    </div>
                    
                    <div class="printer-test">
                        <h4>Test Print</h4>
                        <button type="button" class="btn btn-primary" onclick="ReceiptPrinter.testPrint()">
                            🖨️ Print Test Receipt
                        </button>
                    </div>
                </div>
            `,
            saveText: '💾 Save Settings',
            onSave: () => {
                const newSettings = {
                    enabled: document.getElementById('printerEnabled').checked,
                    autoPrint: document.getElementById('autoPrint').checked,
                    paperWidth: document.getElementById('paperWidth').value,
                    printerType: document.getElementById('printerType').value
                };
                this.saveSettings(newSettings);
                return true;
            }
        });
    },
    
    onPrinterTypeChange(type) {
        document.getElementById('serialOptions').style.display = type === 'serial' ? 'block' : 'none';
    },
    
    // Connect to USB Serial printer
    async connectSerial() {
        try {
            if (!('serial' in navigator)) {
                Toast.error('Web Serial not supported in this browser');
                return false;
            }
            
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 9600 });
            this.writer = this.port.writable.getWriter();
            this.isConnected = true;
            
            document.getElementById('serialStatus').textContent = '✅ Connected';
            Toast.success('Printer connected!');
            return true;
        } catch (error) {
            console.error('Printer connection error:', error);
            Toast.error('Could not connect to printer');
            return false;
        }
    },
    
    async disconnectSerial() {
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
        this.isConnected = false;
    },
    
    // Test print
    async testPrint() {
        const testSale = {
            saleId: 'TEST-001',
            timestamp: new Date().toISOString(),
            items: [
                { productName: 'Test Item 1', quantity: 2, lineTotal: 50 },
                { productName: 'Test Item 2', quantity: 1, lineTotal: 35 }
            ],
            subtotal: 85,
            totalDiscount: 0,
            total: 85,
            paymentMethod: 'cash',
            cashReceived: 100,
            change: 15,
            cashierName: 'Test Cashier'
        };
        
        await this.printReceipt(testSale);
        Toast.success('Test print sent!');
    },

    // Main print function
    async printReceipt(sale) {
        if (!this.settings.enabled) {
            console.log('Printing disabled');
            return;
        }
        
        if (this.settings.printerType === 'serial' && this.isConnected) {
            await this.printThermal(sale);
        } else {
            this.printBrowser(sale);
        }
    },
    
    // Auto-print (called after sale completion)
    async autoPrint(sale) {
        if (this.settings.enabled && this.settings.autoPrint) {
            await this.printReceipt(sale);
        }
    },

    // Send raw bytes to thermal printer
    async sendBytes(bytes) {
        if (!this.isConnected || !this.writer) return false;
        try {
            await this.writer.write(new Uint8Array(bytes));
            return true;
        } catch (error) {
            console.error('Print error:', error);
            return false;
        }
    },
    
    // Thermal ESC/POS commands
    async initPrinter() {
        return this.sendBytes([this.ESC, 0x40]);
    },
    
    async feedAndCut() {
        await this.sendBytes([0x0A, 0x0A, 0x0A, 0x0A]);
        await this.sendBytes([this.GS, 0x56, 0x00]);
    },
    
    async setBold(on) {
        return this.sendBytes([this.ESC, 0x45, on ? 1 : 0]);
    },
    
    async setAlign(align) {
        const codes = { left: 0, center: 1, right: 2 };
        return this.sendBytes([this.ESC, 0x61, codes[align] || 0]);
    },
    
    async setTextSize(width, height) {
        const size = (width - 1) << 4 | (height - 1);
        return this.sendBytes([this.GS, 0x21, size]);
    },
    
    async printText(text) {
        const encoder = new TextEncoder();
        await this.sendBytes([...encoder.encode(text), 0x0A]);
    },
    
    async printLine() {
        await this.printText('-'.repeat(this.printerWidth));
    },
    
    formatPriceLine(name, price) {
        const priceStr = price.toString();
        const maxNameLen = this.printerWidth - priceStr.length - 1;
        const truncName = name.length > maxNameLen ? name.substring(0, maxNameLen - 2) + '..' : name;
        return truncName.padEnd(this.printerWidth - priceStr.length) + priceStr;
    },

    // Thermal printer receipt (ESC/POS)
    async printThermal(sale) {
        await this.initPrinter();
        
        await this.setAlign('center');
        await this.setTextSize(2, 2);
        await this.printText(CONFIG.pos?.receiptHeader || 'BreadHub');
        await this.setTextSize(1, 1);
        await this.printText('Taytay, Rizal');
        await this.printText('');
        
        await this.setAlign('left');
        await this.printText(`Receipt: ${sale.saleId}`);
        await this.printText(new Date(sale.timestamp).toLocaleString('en-PH'));
        await this.printText(`Cashier: ${sale.cashierName || 'Staff'}`);
        await this.printLine();
        
        for (const item of sale.items) {
            const name = item.variantName 
                ? `${item.productName} (${item.variantName})`
                : item.productName;
            await this.printText(`${item.quantity}x ${name}`);
            await this.setAlign('right');
            await this.printText(`P${item.lineTotal.toFixed(2)}`);
            await this.setAlign('left');
            
            if (item.discountName) {
                await this.printText(`  ${item.discountName} -${item.discountPercent}%`);
            }
        }
        
        await this.printLine();

        if (sale.totalDiscount > 0) {
            await this.printText(this.formatPriceLine('Subtotal:', `P${sale.subtotal.toFixed(2)}`));
            await this.printText(this.formatPriceLine('Discount:', `-P${sale.totalDiscount.toFixed(2)}`));
        }
        
        await this.setBold(true);
        await this.setTextSize(1, 2);
        await this.printText(this.formatPriceLine('TOTAL:', `P${sale.total.toFixed(2)}`));
        await this.setTextSize(1, 1);
        await this.setBold(false);
        
        if (sale.paymentMethod === 'cash' && sale.cashReceived) {
            await this.printText(this.formatPriceLine('Cash:', `P${sale.cashReceived.toFixed(2)}`));
            await this.printText(this.formatPriceLine('Change:', `P${sale.change.toFixed(2)}`));
        } else {
            await this.printText(`Payment: ${(sale.paymentMethod || 'cash').toUpperCase()}`);
        }
        
        await this.printLine();
        await this.setAlign('center');
        await this.printText(CONFIG.pos?.receiptFooter || 'Thank you for your purchase!');
        await this.printText('');
        
        await this.feedAndCut();
    },
    
    // Browser print (for WiFi printers / RawBT)
    printBrowser(sale) {
        const receiptHtml = this.generateReceiptHtml(sale);
        
        // Create a hidden iframe for printing (works better with RawBT)
        let printFrame = document.getElementById('printFrame');
        if (!printFrame) {
            printFrame = document.createElement('iframe');
            printFrame.id = 'printFrame';
            printFrame.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;border:none;';
            document.body.appendChild(printFrame);
        }
        
        const frameDoc = printFrame.contentWindow || printFrame.contentDocument;
        const doc = frameDoc.document || frameDoc;
        
        doc.open();
        doc.write(receiptHtml);
        doc.close();
        
        // Wait for content to load, then print
        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                console.error('Print error:', e);
                // Fallback to window.open method
                this.printBrowserFallback(sale);
            }
        }, 500);
    },
    
    // Fallback print method
    printBrowserFallback(sale) {
        const receiptHtml = this.generateReceiptHtml(sale);
        const printWindow = window.open('', '_blank', 'width=350,height=600');
        
        if (!printWindow) {
            Toast.error('Pop-up blocked. Please allow pop-ups for printing.');
            return;
        }
        
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            printWindow.onafterprint = () => printWindow.close();
            setTimeout(() => {
                if (!printWindow.closed) printWindow.close();
            }, 10000);
        }, 300);
    },
    
    generateReceiptHtml(sale) {
        const paperWidth = this.settings.paperWidth === '80mm' ? '80mm' : '58mm';
        const charWidth = this.settings.paperWidth === '80mm' ? 48 : 32;
        
        const itemsHtml = sale.items.map(item => {
            const name = item.variantName 
                ? `${item.productName} (${item.variantName})`
                : item.productName;
            let html = `
                <div class="item">
                    <span class="qty">${item.quantity}x</span>
                    <span class="name">${name}</span>
                    <span class="price">P${item.lineTotal.toFixed(2)}</span>
                </div>
            `;
            if (item.discountName) {
                html += `<div class="discount-line">  ${item.discountName} -${item.discountPercent}%</div>`;
            }
            return html;
        }).join('');
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Receipt</title>
    <style>
        @page {
            size: ${paperWidth} auto;
            margin: 0mm;
        }
        @media print {
            html, body {
                width: ${paperWidth};
                margin: 0;
                padding: 0;
            }
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: monospace;
            font-size: 11px;
            line-height: 1.3;
            width: ${paperWidth};
            max-width: ${paperWidth};
            padding: 2mm;
            background: white;
            color: black;
        }
        .header {
            text-align: center;
            margin-bottom: 3mm;
        }
        .store-name {
            font-size: 14px;
            font-weight: bold;
        }
        .info {
            margin: 2mm 0;
            font-size: 10px;
        }
        .divider {
            border-top: 1px dashed #000;
            margin: 2mm 0;
        }
        .items {
            margin: 2mm 0;
        }
        .item {
            display: flex;
            justify-content: space-between;
            margin: 1mm 0;
            font-size: 10px;
        }
        .item .qty {
            min-width: 20px;
        }
        .item .name {
            flex: 1;
            padding: 0 2px;
            word-break: break-word;
        }
        .item .price {
            text-align: right;
            min-width: 50px;
        }
        .discount-line {
            font-size: 9px;
            color: #333;
            padding-left: 20px;
        }
        .totals {
            margin: 2mm 0;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            padding: 1mm 0;
            font-size: 10px;
        }
        .total-row.grand-total {
            font-size: 13px;
            font-weight: bold;
            border-top: 1px solid #000;
            padding-top: 2mm;
            margin-top: 1mm;
        }
        .payment {
            margin: 10px 0;
            font-size: 11px;
        }
        .footer {
            text-align: center;
            margin-top: 15px;
            font-size: 11px;
        }
        @media print {
            body {
                width: ${paperWidth};
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="store-name">${CONFIG.pos?.receiptHeader || 'BreadHub'}</div>
        <div>Taytay, Rizal</div>
    </div>
    
    <div class="info">
        <div>Receipt: ${sale.saleId}</div>
        <div>${new Date(sale.timestamp).toLocaleString('en-PH')}</div>
        <div>Cashier: ${sale.cashierName || 'Staff'}</div>
    </div>
    
    <div class="divider"></div>
    
    <div class="items">
        ${itemsHtml}
    </div>
    
    <div class="divider"></div>
    
    <div class="totals">
        ${sale.totalDiscount > 0 ? `
            <div class="total-row">
                <span>Subtotal</span>
                <span>₱${sale.subtotal.toFixed(2)}</span>
            </div>
            <div class="total-row">
                <span>Discount</span>
                <span>-₱${sale.totalDiscount.toFixed(2)}</span>
            </div>
        ` : ''}
        <div class="total-row grand-total">
            <span>TOTAL</span>
            <span>₱${sale.total.toFixed(2)}</span>
        </div>
    </div>
    
    <div class="payment">
        ${sale.paymentMethod === 'cash' && sale.cashReceived ? `
            <div class="total-row">
                <span>Cash</span>
                <span>₱${sale.cashReceived.toFixed(2)}</span>
            </div>
            <div class="total-row">
                <span>Change</span>
                <span>₱${sale.change.toFixed(2)}</span>
            </div>
        ` : `
            <div>Payment: ${(sale.paymentMethod || 'Cash').toUpperCase()}</div>
        `}
    </div>
    
    <div class="divider"></div>
    
    <div class="footer">
        <p>${CONFIG.pos?.receiptFooter || 'Thank you for your purchase!'}</p>
        <p>Please come again!</p>
    </div>
</body>
</html>
        `;
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    ReceiptPrinter.init();
});
