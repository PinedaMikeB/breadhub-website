/**
 * BreadHub POS - Receipt Printing Module
 * 
 * Supports:
 * - Thermal printers (58mm/80mm) via Web USB/Serial
 * - Browser print dialog fallback
 * - ESC/POS commands for thermal printers
 */

const ReceiptPrinter = {
    // Printer connection
    port: null,
    writer: null,
    isConnected: false,
    printerWidth: 32, // characters for 58mm, 48 for 80mm
    
    // ESC/POS Commands
    ESC: 0x1B,
    GS: 0x1D,
    
    // Initialize printer connection
    async connect() {
        try {
            // Try Web Serial API (Chrome/Edge)
            if ('serial' in navigator) {
                this.port = await navigator.serial.requestPort();
                await this.port.open({ baudRate: 9600 });
                this.writer = this.port.writable.getWriter();
                this.isConnected = true;
                Toast.success('Printer connected!');
                return true;
            } else {
                Toast.warning('Web Serial not supported. Using browser print.');
                return false;
            }
        } catch (error) {
            console.error('Printer connection error:', error);
            Toast.error('Could not connect to printer');
            return false;
        }
    },
    
    async disconnect() {
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

    // Send raw bytes to printer
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
    
    // Initialize printer
    async init() {
        return this.sendBytes([this.ESC, 0x40]); // ESC @
    },
    
    // Feed and cut paper
    async feedAndCut() {
        await this.sendBytes([0x0A, 0x0A, 0x0A]); // Line feeds
        await this.sendBytes([this.GS, 0x56, 0x00]); // Full cut
    },
    
    // Text formatting
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
    
    // Print text
    async printText(text) {
        const encoder = new TextEncoder();
        await this.sendBytes([...encoder.encode(text), 0x0A]);
    },
    
    // Print line
    async printLine() {
        await this.printText('-'.repeat(this.printerWidth));
    },
    
    // Format price line (name on left, price on right)
    formatPriceLine(name, price) {
        const priceStr = price.toString();
        const maxNameLen = this.printerWidth - priceStr.length - 1;
        const truncName = name.length > maxNameLen ? name.substring(0, maxNameLen - 2) + '..' : name;
        return truncName.padEnd(this.printerWidth - priceStr.length) + priceStr;
    },

    // Print full receipt
    async printReceipt(sale) {
        if (this.isConnected) {
            await this.printThermal(sale);
        } else {
            this.printBrowser(sale);
        }
    },
    
    // Thermal printer receipt
    async printThermal(sale) {
        await this.init();
        
        // Header
        await this.setAlign('center');
        await this.setTextSize(2, 2);
        await this.printText(CONFIG.pos.receiptHeader || 'BreadHub');
        await this.setTextSize(1, 1);
        await this.printText('Taytay, Rizal');
        await this.printText('');
        
        // Sale info
        await this.setAlign('left');
        await this.printText(`Receipt: ${sale.saleId}`);
        await this.printText(new Date(sale.timestamp).toLocaleString('en-PH'));
        await this.printLine();
        
        // Items
        for (const item of sale.items) {
            const name = item.variantName 
                ? `${item.productName} (${item.variantName})`
                : item.productName;
            const qty = `${item.quantity}x`;
            const price = `P${item.lineTotal.toFixed(2)}`;
            
            await this.printText(`${qty} ${name}`);
            if (item.discountName) {
                await this.printText(`   -${item.discountName} ${item.discountPercent}%`);
            }
            await this.setAlign('right');
            await this.printText(price);
            await this.setAlign('left');
        }
        
        await this.printLine();

        // Totals
        if (sale.totalDiscount > 0) {
            await this.printText(this.formatPriceLine('Subtotal:', `P${sale.subtotal.toFixed(2)}`));
            await this.printText(this.formatPriceLine('Discount:', `-P${sale.totalDiscount.toFixed(2)}`));
        }
        
        await this.setBold(true);
        await this.setTextSize(1, 2);
        await this.printText(this.formatPriceLine('TOTAL:', `P${sale.total.toFixed(2)}`));
        await this.setTextSize(1, 1);
        await this.setBold(false);
        
        // Payment
        if (sale.paymentMethod === 'cash') {
            await this.printText(this.formatPriceLine('Cash:', `P${sale.cashReceived.toFixed(2)}`));
            await this.printText(this.formatPriceLine('Change:', `P${sale.change.toFixed(2)}`));
        } else {
            await this.printText(`Payment: ${sale.paymentMethod.toUpperCase()}`);
        }
        
        await this.printLine();
        
        // Footer
        await this.setAlign('center');
        await this.printText(CONFIG.pos.receiptFooter || 'Thank you!');
        await this.printText('');
        
        await this.feedAndCut();
    },
    
    // Browser print fallback
    printBrowser(sale) {
        const receiptHtml = this.generateReceiptHtml(sale);
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    },

    // Generate HTML receipt for browser printing
    generateReceiptHtml(sale) {
        const items = sale.items.map(item => {
            const name = item.variantName 
                ? `${item.productName} (${item.variantName})`
                : item.productName;
            const discount = item.discountName 
                ? `<div class="discount">-${item.discountName} ${item.discountPercent}%</div>` 
                : '';
            return `
                <div class="item">
                    <span>${item.quantity}x ${name}</span>
                    <span>₱${item.lineTotal.toFixed(2)}</span>
                </div>
                ${discount}
            `;
        }).join('');
        
        const discountSection = sale.totalDiscount > 0 ? `
            <div class="row">
                <span>Subtotal</span>
                <span>₱${sale.subtotal.toFixed(2)}</span>
            </div>
            <div class="row discount">
                <span>Discount</span>
                <span>-₱${sale.totalDiscount.toFixed(2)}</span>
            </div>
        ` : '';
        
        const paymentSection = sale.paymentMethod === 'cash' ? `
            <div class="row">
                <span>Cash</span>
                <span>₱${sale.cashReceived.toFixed(2)}</span>
            </div>
            <div class="row">
                <span>Change</span>
                <span>₱${sale.change.toFixed(2)}</span>
            </div>
        ` : `
            <div class="row">
                <span>Payment</span>
                <span>${sale.paymentMethod.toUpperCase()}</span>
            </div>
        `;

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 12px; 
            width: 58mm; 
            padding: 5mm;
        }
        .header { text-align: center; margin-bottom: 10px; }
        .header h1 { font-size: 18px; margin-bottom: 2px; }
        .header p { font-size: 10px; }
        .info { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
        .items { border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
        .item { display: flex; justify-content: space-between; margin: 3px 0; }
        .item .discount { font-size: 10px; color: #666; padding-left: 15px; }
        .totals { margin-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .row.total { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 3px; }
        .row.discount { color: #c00; }
        .footer { text-align: center; margin-top: 15px; font-size: 11px; }
        @media print { body { width: auto; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>🍞 ${CONFIG.pos.receiptHeader || 'BreadHub'}</h1>
        <p>Taytay, Rizal</p>
    </div>
    <div class="info">
        <div>${sale.saleId}</div>
        <div>${new Date(sale.timestamp).toLocaleString('en-PH')}</div>
        <div>Cashier: ${sale.createdByName || 'Staff'}</div>
    </div>
    <div class="items">${items}</div>
    <div class="totals">
        ${discountSection}
        <div class="row total">
            <span>TOTAL</span>
            <span>₱${sale.total.toFixed(2)}</span>
        </div>
        ${paymentSection}
    </div>
    <div class="footer">
        <p>${CONFIG.pos.receiptFooter || 'Thank you for your purchase!'}</p>
        <p style="margin-top:5px;font-size:10px;">Visit us at breadhub.shop</p>
    </div>
</body>
</html>`;
    }
};
