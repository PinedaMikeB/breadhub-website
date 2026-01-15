/**
 * BreadHub POS - Version Checker
 * Notifies users when a new version is available
 */

const VersionChecker = {
    // Update this version number with each deployment
    currentVersion: '2.1.0',
    versionKey: 'breadhub_pos_version',
    lastCheckKey: 'breadhub_pos_last_check',
    checkInterval: 30 * 60 * 1000, // Check every 30 minutes
    
    async init() {
        // Check on startup
        await this.checkForUpdate();
        
        // Periodic check
        setInterval(() => this.checkForUpdate(), this.checkInterval);
        
        // Check when app becomes visible (user returns to tab)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkForUpdate();
            }
        });
        
        console.log(`BreadHub POS v${this.currentVersion}`);
    },
    
    async checkForUpdate() {
        try {
            // Fetch version file with cache-busting
            const response = await fetch(`/pos/version.json?t=${Date.now()}`);
            if (!response.ok) return;
            
            const data = await response.json();
            const latestVersion = data.version;
            
            if (this.isNewerVersion(latestVersion, this.currentVersion)) {
                this.showUpdatePrompt(latestVersion, data.changes || []);
            }
        } catch (error) {
            // Silent fail - don't bother user if version check fails
            console.log('Version check skipped');
        }
    },
    
    isNewerVersion(latest, current) {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            if (latestParts[i] > currentParts[i]) return true;
            if (latestParts[i] < currentParts[i]) return false;
        }
        return false;
    },
    
    showUpdatePrompt(newVersion, changes) {
        // Don't show if already showing
        if (document.getElementById('updatePrompt')) return;
        
        const changesList = changes.length > 0 
            ? `<ul style="text-align:left;margin:12px 0;padding-left:20px;font-size:0.9rem;">
                ${changes.slice(0, 3).map(c => `<li>${c}</li>`).join('')}
               </ul>`
            : '';
        
        const prompt = document.createElement('div');
        prompt.id = 'updatePrompt';
        prompt.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;">
                <div style="background:white;border-radius:16px;padding:24px;max-width:350px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                    <div style="font-size:3rem;margin-bottom:12px;">🔄</div>
                    <h3 style="margin:0 0 8px 0;color:#333;">Update Available!</h3>
                    <p style="color:#666;margin:0 0 12px 0;">
                        Version ${newVersion} is ready
                    </p>
                    ${changesList}
                    <p style="color:#888;font-size:0.85rem;margin-bottom:16px;">
                        Current: v${this.currentVersion}
                    </p>
                    <div style="display:flex;gap:12px;justify-content:center;">
                        <button onclick="VersionChecker.dismissUpdate()" 
                                style="padding:12px 24px;border:1px solid #ddd;background:white;border-radius:8px;cursor:pointer;font-size:1rem;">
                            Later
                        </button>
                        <button onclick="VersionChecker.applyUpdate()" 
                                style="padding:12px 24px;border:none;background:#8B4513;color:white;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;">
                            Update Now
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(prompt);
    },
    
    dismissUpdate() {
        const prompt = document.getElementById('updatePrompt');
        if (prompt) prompt.remove();
        
        // Don't show again for 1 hour
        localStorage.setItem(this.lastCheckKey, Date.now().toString());
    },
    
    applyUpdate() {
        // Clear all caches and reload
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        
        // Clear service worker cache
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(registration => {
                    registration.update();
                });
            });
        }
        
        // Force reload from server
        window.location.reload(true);
    },
    
    // Manual check (can be called from console or UI)
    forceCheck() {
        localStorage.removeItem(this.lastCheckKey);
        this.checkForUpdate();
    }
};

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    VersionChecker.init();
});
