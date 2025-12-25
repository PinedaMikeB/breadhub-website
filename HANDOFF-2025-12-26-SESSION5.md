# HANDOFF - Session 5: GCash Photo Capture & Feature Toggles
**Date:** December 26, 2025
**Status:** Ready for Phase 2 (OCR Implementation)

---

## 📁 PROJECT LOCATIONS

```
/Volumes/Wotg Drive Mike/GitHub/
├── Breadhub-website/          ← Main website + POS
│   ├── pos/
│   │   ├── index.html         ← POS interface
│   │   └── js/
│   │       ├── pos.js         ← v20 - GCash capture, feature toggles
│   │       ├── admin.js       ← v12 - Feature toggle controls
│   │       ├── auth.js        ← v44 - Shift management
│   │       ├── receipt-printer.js
│   │       └── db.js          ← Firebase wrapper
│   └── HANDOFF-*.md           ← Previous session handoffs
│
├── BreadHub ProofMaster/      ← Inventory & recipe management
│   └── js/
│       ├── ingredient-prices.js
│       └── purchase-requests.js
│
└── breadhub-pos/              ← (Legacy, not primary)
```

---

## ✅ COMPLETED THIS SESSION

### 1. GCash Payment Photo Capture (Phase 1)
- Camera opens when GCash payment selected
- Cashier photographs customer's GCash confirmation screen
- Manual entry: Reference No, Customer Mobile, Sender Name
- Photo + data saved to sale record as `sale.gcashPayment`

### 2. Photo Display Locations
- **Cashier Receipt Modal** - Shows verification after sale
- **Cashier Transaction History** - Click Orders → Click sale → See photo
- **Admin Panel** - Shift Details → Sale Details → GCash section

### 3. Senior/PWD ID Photo Fix
- Fixed: Camera now triggers based on discount NAME not just ID
- Checks for "senior" or "pwd" in name (case-insensitive)

### 4. Admin Feature Toggles
- **📸 Senior/PWD ID Photo Capture** - Enable/Disable
- **📱 GCash Payment Photo Capture** - Enable/Disable
- Emergency fallback if camera issues occur
- Settings saved to Firebase `settings/pos`

### 5. Bug Fixes
- Discount presets no longer reappear after deletion
- Shift sync across devices (ghost shift fix)
- Syntax errors in GCash modal fixed

---

## 📊 DATA STRUCTURE

### GCash Payment in Sale Record
```javascript
// Firebase: sales/{saleId}
{
  saleId: "S-20251226-008",
  paymentMethod: "gcash",
  gcashPayment: {
    photoData: "data:image/jpeg;base64,...",  // Base64 image
    refNo: "7567",                             // Reference number
    amount: 289.4,                             // Payment amount
    customerMobile: "09602965868",             // Optional
    senderName: "JE****O B.",                  // Optional
    verifiedAt: "2025-12-26T01:42:00.000Z"
  },
  discountInfo: {
    hasDiscount: true,
    idPhoto: {
      photos: [{photoData: "base64...", capturedAt: "..."}],
      photoCount: 1
    }
  }
  // ... other sale fields
}
```

### Feature Settings
```javascript
// Firebase: settings/pos
{
  changeFund: 1700,
  discountIdCapture: true,   // Toggle for ID photos
  gcashCapture: true,        // Toggle for GCash photos
  deviceRestrictionEnabled: false
}
```

---

## 🎯 NEXT SESSION: Phase 2 - OCR Implementation

### Goal
Auto-extract from GCash screenshot:
- **Amount:** ₱3,000.00
- **Reference No:** 3036128587755
- **Customer Mobile:** +63 960 296 5868
- **Date/Time:** Dec 24, 2025 7:33 PM
- **Sender Name:** JE****O B.

### Recommended Approach
1. **Tesseract.js** - Free, runs in browser
   ```bash
   # CDN
   https://unpkg.com/tesseract.js@4/dist/tesseract.min.js
   ```

2. **Flow:**
   ```
   Capture Photo → Run OCR → Extract fields → Pre-fill form → Cashier verifies
   ```

3. **Key GCash Screen Elements to Parse:**
   - "Amount" followed by number
   - "Ref No." followed by 13-digit number
   - Phone number format: +63 XXX XXX XXXX
   - Name at top (masked format: XX****X X.)

### Sample GCash Screenshot Data Points
From the uploaded screenshot (IMG_3164.JPG):
```
Sender: JE****O B.
Mobile: +63 960 296 5868
Amount: 3,000.00
Total Amount Sent: ₱3000.00
Ref No: 3036128587755
Date: Dec 24, 2025 7:33 PM
```

### Future Enhancement: Customer SMS
Once mobile numbers are captured:
1. Build customer database from GCash payments
2. Send thank you SMS after purchase
3. Send promo notifications
4. Options: Semaphore API, Globe Labs, or Twilio

---

## 🔧 KEY CODE LOCATIONS

### GCash Verification Modal
**File:** `/pos/js/pos.js` (lines ~400-520)
```javascript
showGcashVerificationModal(total, totalDiscount) { ... }
captureGcashPhoto() { ... }
confirmGcashPayment(total, totalDiscount) { ... }
```

### Feature Toggle Check
**File:** `/pos/js/pos.js`
```javascript
// Check before opening camera
if (POS.gcashCaptureEnabled) {
    POS.showGcashVerificationModal(...)
}
```

### Admin Toggle Functions
**File:** `/pos/js/admin.js` (end of file)
```javascript
loadFeatureToggles() { ... }
toggleFeature(feature, enabled) { ... }
```

### Transaction History Display
**File:** `/pos/js/pos.js` (lines ~1550-1620)
```javascript
showTransactionDetails(saleId) { ... }  // Shows both ID and GCash photos
```

---

## 📝 COMMITS THIS SESSION

```
d600e1d - Add admin toggles to enable/disable ID and GCash photo capture
1ecd8f4 - Fix Senior/PWD ID camera trigger - check by name not just ID
6e088d8 - Add GCash photo to cashier transaction history details
cd5cb4c - Add GCash verification display to cashier receipt modal
fd76ae1 - Fix GCash: checkout() should be showCheckoutModal()
b51b5a3 - Fix syntax error in GCash modal - use stored checkout totals
fc5fdf2 - Fix GCash flow: camera opens immediately when GCash selected
3bc8014 - Add GCash payment photo verification (Phase 1)
ebcba8d - Fix discount presets reappearing and shift sync across devices
```

---

## ⚠️ NOTES FOR NEXT SESSION

1. **OCR Accuracy:** GCash screens have consistent layout, but:
   - Amount field is prominent (large font)
   - Ref No is clearly labeled
   - Phone number format is standard PH format
   - May need image preprocessing (contrast, crop)

2. **Base64 Image:** Already captured as `this.gcashCapturedPhoto`
   - Format: `data:image/jpeg;base64,...`
   - Can be passed directly to Tesseract.js

3. **Validation:** After OCR extraction:
   - Verify amount matches sale total
   - Validate ref no format (13 digits)
   - Validate phone format (+63 or 09)

4. **Customer Database Consideration:**
   - Create `customers` collection?
   - Or just mine from sales records?
   - Consider GDPR/privacy for PH

---

## 🧪 TESTING CHECKLIST

- [x] GCash photo capture works
- [x] Photo shows in transaction history
- [x] Photo shows in Admin sale details
- [x] Senior/PWD ID camera triggers correctly
- [x] Admin can disable photo capture features
- [x] Disabled features allow sales without photos
- [ ] OCR extraction (Phase 2)
- [ ] Auto-fill form from OCR (Phase 2)
- [ ] Customer SMS thank you (Future)

---

## 📞 QUICK REFERENCE

**Firebase Project:** ProofMaster (shared database)
**Live POS:** File-based (local) or hosted
**Admin Access:** Backoffice tab in POS

**Key Files to Edit for OCR:**
1. `/pos/js/pos.js` - Add Tesseract integration
2. `/pos/index.html` - Add Tesseract.js script tag
3. `showGcashVerificationModal()` - Add OCR button/auto-trigger
4. `confirmGcashPayment()` - Use OCR-extracted values
