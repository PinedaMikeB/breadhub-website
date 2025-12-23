# BreadHub - Comprehensive Handoff Document
## Date: December 23, 2024
## Status: POS System Complete, Ready for Phase 2

---

# QUICK ANSWERS TO KEY QUESTIONS

## Q1: Are POS products the same as ProofMaster?
**YES!** All three apps share the SAME Firebase database:
- **ProofMaster** = Where you ADD/EDIT products (source of truth)
- **POS** = READS products in real-time
- **Website** = READS products (published ones)

When you edit a product in ProofMaster → It's INSTANTLY available in POS and Website!

## Q2: Per-Item Discount like Loyverse?
**DONE!** Implemented exactly like Loyverse:
- Quick discount buttons: Senior (20%), PWD (20%), Employee (10%), Promo (15%)
- Toggle discount ON → Add items → They get discount automatically
- Click 🏷️ on any cart item to toggle its discount OFF
- "Apply All" and "Clear All" bulk actions
- Discounts tracked per-item in sales records

## Q3: Backoffice/Admin?
**DONE!** Added to POS (role-based access):
- 🛍️ Online Orders - Process orders from website
- ⚠️ Low Stock Alerts - Ingredients & packaging
- 👥 Staff Shifts - Clock in/out
- 📱 Product Availability - Toggle on/off for online
- 🏷️ Discount Presets - Manage discount types
- 📊 Today's Stats - Real-time dashboard

---

# PROJECT FILE LOCATIONS

```
/Volumes/Wotg Drive Mike/GitHub/
├── BreadHub ProofMaster/     ← Production & Inventory Management
│   ├── index.html
│   ├── js/
│   │   ├── app.js
│   │   ├── products.js
│   │   ├── ingredients.js
│   │   ├── packaging-materials.js  ← NEW
│   │   └── ...
│   └── HANDOFF-2024-12-23-POS-INVENTORY.md
│
├── Breadhub-POS/             ← Point of Sale System (NEW)
│   ├── index.html
│   ├── css/pos-styles.css
│   └── js/
│       ├── app.js            - Main controller
│       ├── pos.js            - POS + per-item discounts
│       ├── orders.js         - Online order management
│       ├── admin.js          - Admin panel
│       ├── sales-import.js   - Loyverse CSV import
│       ├── reports.js        - Sales reports
│       ├── auth.js           - Authentication
│       ├── config.js         - Firebase config
│       ├── firebase-init.js  - DB connection
│       ├── modal.js          - Modal component
│       └── utils.js          - Utilities
│
└── Breadhub-website/         ← E-commerce Website
    └── (breadhub.shop)
```

---

# GITHUB REPOSITORIES

| Project | Repository | Status |
|---------|------------|--------|
| ProofMaster | https://github.com/PinedaMikeB/BreadHub-ProofMaster | Existing |
| POS | https://github.com/PinedaMikeB/breadhub-pos.git | ✅ Just pushed |
| Website | https://github.com/PinedaMikeB/Breadhub-website | Existing |

---

# FIREBASE DATABASE STRUCTURE

**Project:** breadhub-proofmaster (SHARED by all apps)

```
Firebase Collections:
├── users                  # Authentication (shared)
├── products               # Products (source of truth)
│   └── {productId}
│       ├── name, category, mainCategory
│       ├── finalSRP, costs
│       ├── hasVariants, variants[]
│       ├── shop: { published, available, imageUrl }
│       └── recipe
│
├── ingredients            # Raw ingredients
├── ingredientPrices       # Supplier pricing
├── packagingMaterials     # Cups, bags, boxes
├── doughs                 # Dough recipes
├── fillings               # Filling recipes
├── toppings               # Topping recipes
├── suppliers              # Supplier info
│
├── sales                  # POS transactions
│   └── {saleId}
│       ├── saleId, dateKey, timestamp
│       ├── items[] (with per-item discount)
│       ├── subtotal, totalDiscount, total
│       ├── paymentMethod, source: "pos"
│       └── createdBy
│
├── orders                 # Online orders (from website)
│   └── {orderId}
│       ├── orderNumber, status
│       ├── customerName, customerPhone
│       ├── items[], total
│       ├── deliveryMethod
│       └── createdAt
│
├── salesImports           # Loyverse import batches
├── productMapping         # Loyverse → ProofMaster mapping
├── discountPresets        # Senior, PWD, custom discounts
├── shifts                 # Staff clock in/out
└── productionRuns         # Production history
```

---

# WHAT WAS COMPLETED THIS SESSION

## 1. Packaging Materials Module (ProofMaster)
- Full CRUD for packaging items
- 9 categories: cups, lids, straws, bags, pouches, boxes, containers, labels, other
- Stock tracking with reorder alerts
- Bulk import of 38 common items
- File: `/BreadHub ProofMaster/js/packaging-materials.js`

## 2. BreadHub POS System (Complete)

### Core POS Features
- Product grid with category filtering
- Variant support (sizes)
- Cart management with quantity controls
- Cash/GCash/Card payments
- Quick cash buttons (₱50, ₱100, ₱200, ₱500, ₱1000)
- Receipt preview

### Per-Item Discount System (Like Loyverse)
- Discount bar with preset buttons
- Active discount auto-applies to new items
- Per-item toggle (🏷️ button)
- Bulk apply/remove all
- Tracks discount per item in sales record

### Online Orders Management
- Real-time order notifications (with sound)
- Order status flow: Pending → Confirmed → Ready → Completed
- Badge shows pending count
- Creates sale record when completed

### Admin Panel (Manager Only)
- Today's summary (sales, transactions, avg ticket)
- Low stock alerts for ingredients & packaging
- Staff shift tracking (start/end)
- Product availability toggle for online orders
- Discount preset management

### Loyverse Import
- Import item sales CSV
- Product mapping interface
- Auto-map similar names
- TRUE costs from ProofMaster (Loyverse COGS ignored)
- Import history

### Reports
- Daily sales (POS + Imported)
- Monthly breakdown
- Product performance
- Category analysis

---

# LOYVERSE DATA ANALYSIS (Oct 13 - Dec 22, 2025)

| Metric | Value |
|--------|-------|
| Total Gross Sales | ₱635,592 |
| Total Net Sales | ₱632,317 |
| Days with Sales | 59 |
| Average Daily | ₱10,773 |
| Best Day | Dec 16 - ₱17,679 |
| Average Margin | 55.9% |

**Top Products:**
1. Malunggay Cheese Pandesal - 20,191 sold
2. Spanish Bread - 1,850 sold (77.7% margin!)
3. Coffee Bun - 664 sold
4. Pan De Coco - 1,481 sold (79.5% margin!)

---

# NEXT PHASE - TO DO

## 1. Setup Hostinger Subdomain & Webhook
- Create subdomain (e.g., pos.breadhub.shop)
- Setup webhook for auto-deployment from GitHub
- Configure SSL

## 2. Add Receipt Printing Support
- Thermal printer integration (58mm/80mm)
- Print format with logo, items, totals
- Optional: Email/SMS receipt

## 3. Inventory Deduction on Sales
- When sale completes → Deduct ingredients used
- Use product recipes to calculate quantities
- Update `ingredients.currentStock`
- Update `packagingMaterials.currentStock`
- Trigger low stock alerts

## 4. Connect Website Checkout to Firebase
- Website cart → Create order in `orders` collection
- Order appears in POS immediately (real-time)
- Customer gets order confirmation
- Status updates sync to website

---

# ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                      BreadHub Ecosystem                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ ProofMaster  │   │     POS      │   │      Website         │ │
│  │   (Bakers)   │   │  (Cashiers)  │   │    (Customers)       │ │
│  ├──────────────┤   ├──────────────┤   ├──────────────────────┤ │
│  │ • Products   │   │ • Sell       │   │ • Browse products    │ │
│  │ • Recipes    │   │ • Discounts  │   │ • Add to cart        │ │
│  │ • Inventory  │   │ • Orders     │   │ • Checkout           │ │
│  │ • Costs      │   │ • Admin      │   │ • Track order        │ │
│  │ • Production │   │ • Reports    │   │                      │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘ │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                            │                                     │
│                   ┌────────▼────────┐                            │
│                   │    Firebase     │                            │
│                   │  (Shared DB)    │                            │
│                   │                 │                            │
│                   │ • products      │                            │
│                   │ • ingredients   │                            │
│                   │ • sales         │                            │
│                   │ • orders        │                            │
│                   └─────────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# HOW TO TEST

## POS System
1. Open: `/Volumes/Wotg Drive Mike/GitHub/Breadhub-POS/index.html`
2. Login with ProofMaster credentials
3. Try adding products, applying discounts, checkout

## Import Loyverse Data
1. In POS, click "📥 Import"
2. Upload the CSV files from `/mnt/user-data/uploads/`
3. Map products to ProofMaster
4. Import

---

# CREDENTIALS & URLS

| Service | URL/Info |
|---------|----------|
| Firebase Console | https://console.firebase.google.com (breadhub-proofmaster) |
| Website | https://breadhub.shop |
| GitHub POS | https://github.com/PinedaMikeB/breadhub-pos |
| Hostinger | (To be configured for POS subdomain) |

---

# FILES UPLOADED THIS SESSION

Located in `/mnt/user-data/uploads/`:
- `sales-summary-2025-10-13-2025-12-22.csv` (daily totals)
- `item-sales-summary-2025-10-13-2025-12-22.csv` (160 products)
- `category-sales-summary-2025-10-13-2025-12-22.csv` (17 categories)

---

*Generated: December 23, 2024*
*Session: POS System Complete, Pushed to GitHub*
*Next: Hostinger setup, Printing, Inventory deduction, Website integration*
