# 🚀 BreadHub AI Content Generator - Setup Guide

## ✅ Phase 1 Complete!

Your AI-powered SEO content generator is now installed and ready to use!

---

## 📋 SETUP STEPS

### Step 1: Create Your `.env` File

1. In your website root folder, create a file called `.env`
2. Add your Claude API key:

```
CLAUDE_API_KEY=sk-ant-api03-your-actual-api-key-here
```

3. Save the file

**IMPORTANT:** 
- Replace `sk-ant-api03-your-actual-api-key-here` with your real API key
- Never commit this file to Git (it's already in `.gitignore`)
- Never share this file publicly

---

### Step 2: Upload Files to Hostinger

Upload these NEW files:

```
/api/
├── generate-content.php    ← Main API endpoint
├── .htaccess              ← Security rules
├── usage.log              ← Will be created automatically
└── daily_calls.json       ← Will be created automatically

/.env                      ← Your API key (create this manually)
/.env.example              ← Example file (optional)
```

Upload these UPDATED files:

```
/admin.html               ← Now has AI generator button
```

---

### Step 3: Test Security

1. Try accessing: `https://breadhub.shop/.env`
   - Should get **403 Forbidden** ✅

2. Try accessing: `https://breadhub.shop/api/usage.log`
   - Should get **403 Forbidden** ✅

3. Test API endpoint works:
   - Go to `admin.html`
   - Try generating content
   - Should work! ✅

---

## 🎯 HOW TO USE

### In Admin Panel:

1. **Go to:** `breadhub.shop/admin.html`

2. **Fill in basic info:**
   ```
   Product Name: Chocolate Donut
   Price: 35
   Category: Donuts
   ```

3. **Optional - Add quick note:**
   ```
   Quick Note: Rich dark chocolate with espresso ganache
   ```

4. **Click:** "✨ Generate SEO Content with AI"

5. **Wait 10-15 seconds** while AI generates:
   - Short description (80 chars)
   - Full SEO description (350-450 words)
   - Keyword-optimized content
   - Structured sections

6. **Review generated content** in the description fields

7. **Edit if needed** (you can modify the AI-generated text)

8. **Save product!**

---

## 🔒 SECURITY FEATURES

✅ **API Key Protection:**
- Stored in `.env` file (not in code)
- `.env` is blocked from web access
- Never exposed to browser/frontend

✅ **Rate Limiting:**
- 20 requests per hour per session
- Prevents abuse and excessive API costs

✅ **CORS Protection:**
- Only your domain can call the API
- Blocks external requests

✅ **Input Validation:**
- All inputs sanitized
- Prevents injection attacks

✅ **Usage Tracking:**
- Logs every API call
- Monitors daily usage
- Tracks costs

---

## 💰 COST MONITORING

### Check Your Usage:

**File:** `/api/usage.log`
```
2025-12-18 17:30:15 | Chocolate Donut | Donuts | Success
2025-12-18 17:32:41 | Pandesal | Pandesal | Success
2025-12-18 17:35:22 | Cinnamon Roll | Cinnamon Rolls | Success
```

**File:** `/api/daily_calls.json`
```json
{
  "2025-12-18": 3,
  "2025-12-19": 5,
  "2025-12-20": 2
}
```

### Estimated Costs:

- **Per product:** ~$0.01-0.02
- **50 products:** ~$0.50-1.00
- **100 products:** ~$1.00-2.00
- **Monthly (updating 20 products):** ~$0.20-0.40
- **Yearly:** ~$10-20

Very affordable! 💰✅

---

## 🎨 WHAT AI GENERATES

### Short Description (80 chars):
```
"Rich chocolate donut with dark ganache. A chocolate lover's dream treat!"
```

### Full Description (350-450 words):
```markdown
Indulge in our signature Chocolate Donut, a decadent treat that's perfect for 
chocolate lovers in Taytay, Rizal. Made with premium Belgian chocolate and 
baked fresh daily...

### What Makes It Special
- Premium Belgian dark chocolate (70% cocoa)
- Light, fluffy yeast-raised dough
- Hand-dipped for perfect coverage
- Baked fresh every morning in Taytay
- Perfect for breakfast or afternoon snack

### Perfect Pairings
Try our Chocolate Donut with our Premium Coffee for the ultimate breakfast 
combo, or pair with our Cinnamon Roll for a sweet variety pack...

[etc... 350+ words total]
```

**Includes:**
- ✅ SEO keywords ("chocolate donut taytay", "donuts rizal")
- ✅ Location mentions (Taytay, Cainta, Angono, Rizal)
- ✅ Structured sections (### headings)
- ✅ Sensory descriptions
- ✅ Call-to-action
- ✅ Internal link placeholders

---

## 🐛 TROUBLESHOOTING

### Error: "API key not configured"
**Solution:** Create `.env` file with your API key

### Error: "Rate limit exceeded"
**Solution:** Wait 1 hour or increase limit in `generate-content.php` (line 42)

### Error: "Forbidden origin"
**Solution:** Add your domain to allowed origins in `generate-content.php` (line 12-17)

### Error: "Method not allowed"
**Solution:** Endpoint only accepts POST requests (this is correct)

### AI generates in wrong format
**Solution:** The code handles this automatically - fallback parsing is built-in

### Button says "Generating..." forever
**Solution:** 
1. Check browser console for errors (F12)
2. Check if `/api/generate-content.php` is accessible
3. Check if `.env` file has correct API key

---

## 📊 MONITORING DASHBOARD

### Check Usage in Admin:

After successful generation, you'll see:
```
✅ Success! Generated 78 char short description and 412 word full description.
   (3 calls today, 17 remaining this hour)
```

This tells you:
- Generation succeeded
- Content length
- Daily usage count
- Remaining requests this hour

---

## 🔧 ADVANCED CONFIGURATION

### Increase Rate Limit:

Edit `/api/generate-content.php` line 42:
```php
$rateLimit = 20;  // Change to 50, 100, etc.
```

### Change Content Length:

Edit `/api/generate-content.php` prompt section:
```
2. FULL DESCRIPTION (for SEO product pages):
   - 350-450 words  // Change to 500-700 words, etc.
```

### Add More Allowed Domains:

Edit `/api/generate-content.php` lines 12-17:
```php
$allowedOrigins = [
    'https://breadhub.shop',
    'http://breadhub.shop',
    'http://localhost',
    'https://your-staging-domain.com',  // Add more here
];
```

---

## 📝 NEXT STEPS

### Use AI for All Products:

1. Go through existing products
2. Click "Edit" on each
3. Click "Generate SEO Content"
4. Review and save

**Time saved:** 15 minutes per product → 2 minutes with AI! ⚡

### Create New Products Faster:

1. Fill basic info (30 seconds)
2. Generate AI content (15 seconds)
3. Upload image (30 seconds)
4. Save (5 seconds)

**Total: ~90 seconds per product!** 🚀

---

## ✅ PHASE 1 CHECKLIST

- [ ] `.env` file created with API key
- [ ] Files uploaded to Hostinger
- [ ] Security tested (`.env` blocked)
- [ ] AI generation tested in admin
- [ ] Generated content looks good
- [ ] Content saved to Firebase successfully
- [ ] Usage logs working

Once all checked, Phase 1 is complete! 🎉

---

## 🚀 WHAT'S NEXT (Phase 2)

After Phase 1 is stable, we can add:

1. **SERP Tracking**
   - Daily keyword monitoring
   - Rank change alerts
   - Competitor analysis

2. **Auto Blog Generator**
   - AI-written blog posts
   - DALL-E featured images
   - Auto-publishing

3. **SEO Suggestions Engine**
   - AI analyzes your rankings
   - Suggests improvements
   - Auto-implements changes

4. **Full Automation**
   - Runs while you sleep
   - Daily reports
   - Approval-based improvements

**Timeline:** 6-8 weeks after Phase 1

---

## 💡 TIPS FOR BEST RESULTS

### 1. Use Descriptive Product Names
- ✅ "Chocolate Donut with Dark Ganache"
- ❌ "Choco D"

### 2. Add Quick Notes
- ✅ "Rich Belgian chocolate, espresso notes, light texture"
- ❌ "chocolate"

### 3. Review AI Content
- AI is smart but not perfect
- Check for accuracy
- Edit as needed
- Keep your brand voice

### 4. Regenerate if Needed
- Don't like the result? Click generate again!
- AI will create different content each time
- Try 2-3 times to get perfect result

---

## 📞 SUPPORT

If you run into issues:

1. Check troubleshooting section above
2. Check browser console (F12) for errors
3. Check `/api/usage.log` for API errors
4. Verify `.env` file exists and has correct key

---

**🎉 Congratulations! Your AI SEO content generator is ready to use!**

Start generating amazing content and watch your SEO improve! 🚀🍞📈
