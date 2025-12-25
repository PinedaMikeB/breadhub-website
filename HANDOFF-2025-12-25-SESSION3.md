# HANDOFF: BreadHub POS Emergency Purchase System
**Date:** December 25, 2025 - Session 3
**Project:** BreadHub POS & ProofMaster Integration
**Location:** `/Volumes/Wotg Drive Mike/GitHub/Breadhub-website`

---

## 🎯 SESSION SUMMARY

This session completed the **Emergency Purchase** feature in the POS End Shift workflow, allowing cashiers to record emergency stock purchases that automatically update ProofMaster inventory.

---

## ✅ COMPLETED FEATURES

### 1. Change Fund Separation from Sales
- **Change Fund is now tracked separately** from cash sales
- Expected Cash = Cash Sales ONLY (not including change fund)
- Change Fund has its own editable field with shortage detection
- If change fund is used for purchases, shortage is reported to owner
- Change fund amount passes to next shift

### 2. Emergency Purchase Modal (ProofMaster-Style)
**Location:** `pos/js/auth.js` - `openExpenseModal()` and `showExpenseListModal()`

Features:
- **Search box** at top for quick filtering
- **Full item details** displayed:
  - Item name
  - Category (Filling, Topping, Packaging)
  - Price per package (₱295 / 1kg)
  - Default supplier (Baking And Home Depot)
  - Current stock level
- **Multi-select** with checkboxes
- **Qty input** with auto-check when value entered
- **Unit dropdown** - auto-fills based on package size:
  - Package ≥ 1000g → defaults to "kg"
  - Package < 1000g → defaults to "g"
  - Packaging → defaults to "pcs"
- **Amount Paid** field for actual purchase price

### 3. Data Integration with ProofMaster

**Collections Used:**
| Collection | Purpose |
|------------|---------|
| `ingredients` | Master ingredient list with currentStock |
| `packagingMaterials` | Packaging items |
| `suppliers` | Supplier master data |
| `ingredientPrices` | **KEY:** Links ingredients to suppliers with prices |
| `pendingPurchases` | Emergency purchases awaiting processing |

**ingredientPrices Structure:**
```javascript
{
  id: "...",
  ingredientId: "yrWR8VoVWBJ5VLt0IoYm",
  ingredientName: "Mayonnaise Kewpie Mayo",
  supplierId: "hKuUVHaYCm9PKya8CAdS",
  supplierName: "Baking And Home Depot",
  purchasePrice: 295,
  packageSize: 1000,  // in grams
  costPerGram: 0.295,
  lastPurchaseDate: "2025-12-10T17:42:11.581Z"
}
```

### 4. Inventory Update on Shift End

**Flow:**
```
1. Cashier adds emergency purchase (e.g., 1 kg Mayo @ ₱295)
2. End Shift → Generate Report → Done & Logout
3. System calls updateInventoryFromPurchases()
4. Unit conversion: 1 kg → 1000g
5. Firebase update: ingredients/{id}/currentStock += 1000
6. Confirmation modal shows: "0 g → 1.00 kg"
7. ProofMaster reflects new stock immediately
```

**Unit Conversion Logic:**
```javascript
if (unit === 'kg') {
    addedQtyInGrams = qty * 1000;
} else if (unit === 'g') {
    addedQtyInGrams = qty;
} else if (unit === 'sack') {
    addedQtyInGrams = qty * 25000; // 25kg sack
}
```

### 5. DB Helper Added
**File:** `pos/js/firebase-init.js`
```javascript
// Get sub-collection documents
async getSubcollection(collectionName, docId, subcollectionName) {
    const snapshot = await db.collection(collectionName)
        .doc(docId)
        .collection(subcollectionName)
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
```

---

## 🔗 SYSTEM CONNECTIONS

### Emergency Purchase → ProofMaster Stock Flow
```
┌─────────────────────────────────────────────────────────────┐
│                    POS EMERGENCY PURCHASE                    │
├─────────────────────────────────────────────────────────────┤
│  Cashier selects: Mayonnaise Kewpie Mayo                    │
│  Qty: 1, Unit: kg, Amount Paid: ₱295                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              SHIFT END - finishAndLogout()                  │
├─────────────────────────────────────────────────────────────┤
│  1. updateInventoryFromPurchases()                          │
│     - Convert 1 kg → 1000g                                  │
│     - Update ingredients/{id}/currentStock                  │
│                                                             │
│  2. Create pendingPurchases record                          │
│     - For ProofMaster approval/tracking                     │
│                                                             │
│  3. Mark shift completed                                    │
│  4. Send email report to owner                              │
│  5. Show inventory confirmation modal                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    PROOFMASTER                               │
├─────────────────────────────────────────────────────────────┤
│  Ingredients page shows:                                    │
│  - Mayonnaise Kewpie Mayo: Stock: 1,000 g (was 0)          │
│  - Last updated: emergency_purchase                         │
│                                                             │
│  Pending Purchases shows:                                   │
│  - Mayo purchase for approval/reconciliation                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 NEXT SESSION: PENDING ITEMS

### 1. **Last Purchase Price Update** (IMPORTANT)
When emergency purchase is made with a DIFFERENT price than the stored price:
- Update `ingredientPrices` collection with new price
- Recalculate `costPerGram`
- This affects recipe costing and profit margins

**Example:**
```
Current: Mayo ₱295 / 1kg → costPerGram = ₱0.295
Emergency Purchase: Mayo ₱320 / 1kg (price increased!)
Should Update: 
  - ingredientPrices/{id}/purchasePrice = 320
  - ingredientPrices/{id}/costPerGram = 0.32
  - ingredientPrices/{id}/lastPurchaseDate = now
```

**Impact on Recipes:**
- All recipes using Mayo will have higher ingredient cost
- Profit margin decreases if selling price stays same
- ProofMaster should alert: "Ingredient cost increased by 8.5%"

### 2. **Test Adding New Ingredient Flow**
```
1. ProofMaster → Ingredients → + Add Ingredient
2. ProofMaster → Prices → + Add Supplier Price
3. POS → Emergency Purchase → Should see new ingredient
```

### 3. **ProofMaster Pending Purchases Page**
- View all emergency purchases from POS
- Approve/reject purchases
- Reconcile with actual receipts

---

## 📁 KEY FILES MODIFIED

| File | Changes |
|------|---------|
| `pos/js/auth.js` (v42) | Emergency purchase modal, unit conversion, inventory update |
| `pos/js/firebase-init.js` (v4) | Added getSubcollection() method |
| `pos/css/pos-styles.css` (v30) | Emergency purchase modal styles |
| `pos/index.html` | Version updates |

---

## 🔧 TECHNICAL NOTES

### ingredientPrices Collection (165 records)
This is the **key collection** that links ingredients to suppliers with pricing:
- One ingredient can have multiple supplier prices
- System picks the first one (or one marked isDefault)
- Contains: `ingredientId`, `supplierId`, `supplierName`, `purchasePrice`, `packageSize`, `costPerGram`

### Stock Unit Standard
- **Ingredients:** Stock always stored in GRAMS
- **Packaging:** Stock stored in their native unit (pcs, box, etc.)
- POS converts kg → grams before updating

### Shift Report Data
```javascript
shiftReport = {
  // Sales (separate from change fund)
  expectedCashFromSales,
  actualCashSales,
  cashToRemit,
  salesVariance,
  
  // Change Fund (tracked separately)
  setChangeFund,
  actualChangeFund,
  changeFundShortage,
  changeFundForNextShift,
  
  // Expenses
  expenses: totalExpenses,
  expensesDetails: [...purchases]
}
```

---

## 🧪 TESTING CHECKLIST

- [x] Emergency Purchase modal shows price/supplier from ingredientPrices
- [x] Search filters items correctly
- [x] Unit dropdown auto-fills based on package size
- [x] Multiple items can be selected and added
- [x] Returns to End Shift modal with expenses listed
- [x] End Shift calculates variance correctly (sales only, not change fund)
- [x] Change Fund tracked separately with shortage detection
- [ ] **Inventory updates in Firebase on shift end** (needs testing)
- [ ] **ProofMaster shows updated stock** (needs testing)
- [ ] **Last purchase price updates ingredientPrices** (TODO next session)

---

## 📝 COMMITS THIS SESSION

1. `77b4492` - Separate change fund from cash sales
2. `12d884a` - Redesign Emergency Purchase modal like ProofMaster
3. `af4c7dd` - Load supplier prices from ingredientPrices collection
4. `dfc59a1` - Use ingredientPrices collection for supplier and price data
5. `fae5e1d` - Fix unit conversion (kg to grams) for inventory updates
6. `fb6c78c` - Auto-fill unit dropdown based on package size

---

## 💡 KEY INSIGHT FOR NEXT SESSION

**Last Purchase Price Logic:**

When cashier enters Amount Paid that differs from stored price:
```javascript
// In addSelectedExpenses() or finishAndLogout()
if (purchase.amount !== storedPrice) {
    // Update ingredientPrices
    await DB.update('ingredientPrices', priceDocId, {
        purchasePrice: purchase.amount,
        packageSize: convertToGrams(purchase.qty, purchase.unit),
        costPerGram: purchase.amount / convertToGrams(purchase.qty, purchase.unit),
        lastPurchaseDate: new Date().toISOString(),
        lastPurchaseShiftId: shiftId,
        priceHistory: firebase.firestore.FieldValue.arrayUnion({
            price: purchase.amount,
            date: new Date().toISOString(),
            source: 'emergency_purchase'
        })
    });
}
```

This ensures:
1. Recipe costs stay accurate
2. Margin calculations reflect actual costs
3. Price history is maintained for analysis

---

**End of Handoff**
