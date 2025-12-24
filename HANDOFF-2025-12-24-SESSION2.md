# BreadHub Development Handoff - December 24, 2025

## Project Locations

### Home (Mac Mini)
- **Website/POS:** `/Volumes/Wotg Drive Mike/GitHub/Breadhub-website`
- **ProofMaster:** `/Volumes/Wotg Drive Mike/GitHub/BreadHub ProofMaster`

### Store (Tablet/Mac)
- **Website/POS:** `/Users/mike/Documents/Github/BreadHub-Website`

### Live URLs
- **POS System:** https://breadhub.shop/pos/
- **E-commerce Website:** https://breadhub.shop/

### Firebase Project
- **Project:** breadhub-proofmaster
- **Console:** https://console.firebase.google.com/project/breadhub-proofmaster

---

## What We Accomplished Today (Dec 24, 2025)

### 1. ✅ Add-ons Category Filter
- Added "🎁 Add-ons" button to main category filter in POS
- Sub-categories: Boxes, Creamers, Sugar, Extras
- Products with category containing "box", "creamer", "sugar", "extras", "addon" appear here

### 2. ✅ Device Restriction Security System
- Only registered devices can access POS (when enabled)
- Admin/Owner can bypass restriction and register new devices
- Device Management in Admin Panel → "📱 Device Security"
- Settings stored in Firebase: `settings/pos/deviceRestrictionEnabled`
- Devices stored in: `authorizedDevices` collection

**Registered Devices:**
- Mac Mini Home: `DEV-mjjslbxj-7zzrnbrht`
- Store Tablet 1: `DEV-mjkObfp0-gvdl9lg4x`

**Emergency Reset:** Set `settings/pos/deviceRestrictionEnabled` to `false` in Firebase

### 3. ✅ Printer Settings & Receipt Printing
- Added Printer Settings in Admin Panel → "🖨️ Printer Settings"
- Settings: Enable/disable printing, auto-print on sale, paper width (58mm/80mm)
- Works with RawBT app for Bluetooth thermal printers
- Receipt auto-prints when sale is completed

**Printer Setup on Store Tablet:**
- App: RawBT (installed and configured)
- Printer: "Btraw pos" (POS58DB0E0) via Bluetooth
- RawBT enabled in Android Settings → Printing

### 4. ✅ Firebase DB.set() Fix
- Added `DB.set()` method to firebase-init.js
- Creates document if doesn't exist (unlike update which fails)
- Used for settings that may not exist yet

---

## Previous Session Features (Still Active)

### Discount System with ID Verification
- Senior Citizen (20%), PWD (20%), Employee (10%), Promo (15%)
- **Mandatory ID photo capture** for Senior/PWD discounts
- Multiple ID photos supported per transaction
- Admin can view ID photos in shift details

### Shift Management
- PIN-based login for staff
- Shift start/end with cash tracking
- Cash vs GCash sales separation
- PDF shift reports with email auto-send
- Unclosed shift handling

### Admin Features
- Staff management with roles (Owner, Manager, Cashier, Baker)
- Today's Shifts with 30-second auto-refresh
- Transaction history with discount and ID photo viewing
- Change Fund settings

---

## Known Issues / Notes

### Cash Drawer
- Cash drawer kick command NOT working via RawBT
- RawBT doesn't support ESC/POS drawer commands
- **Workaround:** Use Loyverse to kick drawer, or manual key

### Device Registration Loop (SOLVED)
- **Cause:** Clearing "Cookies and site data" deletes device ID
- **Solution:** When clearing browser data, UNCHECK "Cookies and site data"
- Only clear "Cached images and files" for updates

### Refreshing for Updates
- Don't need to clear all browsing data
- Just uncheck "Cookies and site data" when clearing
- Or just refresh the page - cache busters (`?v=XX`) handle updates

---

## File Versions (Current)

| File | Version |
|------|---------|
| pos.js | v11 |
| auth.js | v20 |
| admin.js | v10 |
| firebase-init.js | v3 |
| receipt-printer.js | v3 |
| pos-styles.css | v27 |

---

## Git Status

Both repos are up to date with origin/main:
- Website: `5b94101` - "Improve receipt printing for RawBT"
- ProofMaster: `040d72f` - "Packaging materials, sales module, handoff updates"

---

## Next Steps / TODO

1. **Add-ons Products** - Need to add actual add-on products in ProofMaster with proper categories
2. **Cash Drawer** - Investigate NokoPrint or other apps for drawer kick
3. **PWA** - Consider adding PWA support when POS is stable
4. **Reports** - Enhanced reporting features

---

## Quick Commands

```bash
# Pull latest at home
cd "/Volumes/Wotg Drive Mike/GitHub/Breadhub-website" && git pull

# Pull latest at store
cd /Users/mike/Documents/Github/BreadHub-Website && git pull

# Check git status
git status && git log --oneline -5
```

---

*Last updated: December 24, 2025 11:30 PM*
