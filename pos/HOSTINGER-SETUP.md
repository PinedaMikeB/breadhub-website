# BreadHub POS - Hostinger Setup Guide

## 1. Create Subdomain on Hostinger

1. Login to Hostinger Panel (hpanel.hostinger.com)
2. Go to **Domains** → **Subdomains**
3. Click **Create Subdomain**
4. Enter: `pos` (creates pos.breadhub.shop)
5. Document root: `public_html/pos.breadhub.shop`
6. Click **Create**

## 2. Setup Git Repository

### Option A: Git Deployment (Recommended)

1. In Hostinger Panel, go to **Files** → **Git**
2. Click **Create Repository**
3. Repository URL: `https://github.com/PinedaMikeB/breadhub-pos.git`
4. Branch: `main`
5. Installation directory: `public_html/pos.breadhub.shop`
6. Click **Create**

### Option B: Manual Upload

If Git isn't available:
1. Go to **File Manager**
2. Navigate to `public_html/pos.breadhub.shop`
3. Upload all files from the BreadHub-POS folder

## 3. Configure Webhook Auto-Deployment

### On Hostinger:
1. Navigate to `public_html/pos.breadhub.shop/deploy/`
2. Open `webhook.php`
3. Change `WEBHOOK_SECRET` to a secure random string
4. Save the file

### On GitHub:
1. Go to your repo: github.com/PinedaMikeB/breadhub-pos
2. Click **Settings** → **Webhooks** → **Add webhook**
3. Payload URL: `https://pos.breadhub.shop/deploy/webhook.php`
4. Content type: `application/json`
5. Secret: (same as WEBHOOK_SECRET in webhook.php)
6. Events: Select "Just the push event"
7. Click **Add webhook**

## 4. Enable SSL

1. In Hostinger Panel, go to **SSL**
2. Find `pos.breadhub.shop` 
3. Click **Install SSL** (free Let's Encrypt)
4. Wait for activation (usually instant)

## 5. Test Deployment

1. Make a small change to any file in the repo
2. Commit and push to main branch
3. Check `pos.breadhub.shop/deploy/deploy.log` for status
4. Visit `https://pos.breadhub.shop` to verify

## 6. Deploy Log Location

Access deployment logs at:
- File: `public_html/pos.breadhub.shop/deploy/deploy.log`
- View via File Manager or SFTP

## Troubleshooting

### Webhook not triggering?
- Check GitHub webhook delivery history (Settings → Webhooks → Recent Deliveries)
- Verify secret matches exactly
- Check deploy.log for errors

### Files not updating?
- Check if git fetch succeeded in deploy.log
- Verify repository permissions
- Try manual git pull via SSH

### 403/404 errors?
- Check file permissions (should be 644 for files, 755 for directories)
- Verify .htaccess isn't blocking access

---

## Quick Links

| Resource | URL |
|----------|-----|
| POS System | https://pos.breadhub.shop |
| GitHub Repo | https://github.com/PinedaMikeB/breadhub-pos |
| Main Website | https://breadhub.shop |
| Hostinger Panel | https://hpanel.hostinger.com |

