/**
 * BreadHub POS - Firebase Version Manager
 * Real-time update notifications via Firebase
 * 
 * No more cache clearing headaches!
 * Firebase pushes updates, app listens and prompts user.
 */

const VersionManager = {
    // Current app version (update with each release)
    currentVersion: '2.2.0',
    appId: 'pos', // 'pos' or 'proofmaster'
    
    // State
    unsubscribe: null,
    updateShown: false,
    
    async init() {
        console.log(`VersionManager: Starting v${this.currentVersion}`);
        
        // Wait for Firebase
        if (typeof db === 'undefined' || !db) {
            console.log('VersionManager: Waiting for Firebase...');
            await new Promise(r => setTimeout(r, 1000));
        }
        
        if (!db) {
            console.error('VersionManager: Firebase not available');
            return;
        }
        
        // Listen for version updates
        this.setupListener();
        
        // Register this device/version
        this.registerDevice();
    },
    
    setupListener() {
        // Listen to appConfig/{appId} for version changes
        this.unsubscribe = db.collection('appConfig').doc(this.appId)
            .onSnapshot(doc => {
                if (!doc.exists) {
                    console.log('VersionManager: No config doc, creating...');
                    this.createConfigDoc();
                    return;
                }
                
                const config = doc.data();
                console.log('VersionManager: Config received', config);
                
                this.checkVersion(config);
            }, error => {
                console.error('VersionManager: Listener error', error);
            });
    },
    
    async createConfigDoc() {
        try {
            await db.collection('appConfig').doc(this.appId).set({
                version: this.currentVersion,
                forceUpdate: false,
                releaseNotes: 'Initial release',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.log('VersionManager: Could not create config', e);
        }
    },
    
    checkVersion(config) {
        const latestVersion = config.version;
        const forceUpdate = config.forceUpdate || false;
        
        if (this.isNewerVersion(latestVersion, this.currentVersion)) {
            console.log(`VersionManager: Update available! ${this.currentVersion} → ${latestVersion}`);
            this.showUpdatePrompt(latestVersion, config.releaseNotes, forceUpdate);
        }
    },
    
    isNewerVersion(latest, current) {
        if (!latest || !current) return false;
        
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            const l = latestParts[i] || 0;
            const c = currentParts[i] || 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    },
    
    showUpdatePrompt(newVersion, releaseNotes, forceUpdate) {
        // Don't show multiple times
        if (this.updateShown) return;
        this.updateShown = true;
        
        const prompt = document.createElement('div');
        prompt.id = 'versionUpdatePrompt';
        prompt.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;">
                <div style="background:white;border-radius:20px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                    <div style="font-size:4rem;margin-bottom:16px;">🚀</div>
                    <h2 style="margin:0 0 8px 0;color:#333;font-size:1.5rem;">Update Available!</h2>
                    <p style="color:#666;margin:0 0 16px 0;font-size:1.1rem;">
                        Version <strong>${newVersion}</strong> is ready
                    </p>
                    ${releaseNotes ? `
                        <div style="background:#F5F5F5;padding:12px 16px;border-radius:10px;margin-bottom:20px;text-align:left;">
                            <div style="font-size:0.85rem;color:#888;margin-bottom:4px;">What's new:</div>
                            <div style="color:#333;font-size:0.95rem;">${releaseNotes}</div>
                        </div>
                    ` : ''}
                    <p style="color:#999;font-size:0.85rem;margin-bottom:20px;">
                        Current version: ${this.currentVersion}
                    </p>
                    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                        ${!forceUpdate ? `
                            <button onclick="VersionManager.dismissUpdate()" 
                                    style="padding:14px 28px;border:2px solid #ddd;background:white;border-radius:12px;cursor:pointer;font-size:1rem;color:#666;">
                                Later
                            </button>
                        ` : ''}
                        <button onclick="VersionManager.applyUpdate()" 
                                style="padding:14px 28px;border:none;background:linear-gradient(135deg,#8B4513,#A0522D);color:white;border-radius:12px;cursor:pointer;font-size:1rem;font-weight:600;box-shadow:0 4px 15px rgba(139,69,19,0.3);">
                            🔄 Update Now
                        </button>
                    </div>
                    ${forceUpdate ? `
                        <p style="color:#C62828;font-size:0.85rem;margin-top:16px;">
                            ⚠️ This update is required to continue using the app.
                        </p>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(prompt);
    },
    
    dismissUpdate() {
        const prompt = document.getElementById('versionUpdatePrompt');
        if (prompt) prompt.remove();
        this.updateShown = false;
        
        // Will show again on next Firebase update or page reload
    },
    
    async applyUpdate() {
        const prompt = document.getElementById('versionUpdatePrompt');
        if (prompt) {
            prompt.querySelector('div > div').innerHTML = `
                <div style="padding:40px;text-align:center;">
                    <div style="font-size:3rem;margin-bottom:16px;">⏳</div>
                    <h3 style="margin:0 0 8px 0;">Updating...</h3>
                    <p style="color:#666;margin:0;">Please wait while we refresh the app.</p>
                </div>
            `;
        }
        
        try {
            // 1. Unregister all service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                    console.log('Service worker unregistered');
                }
            }
            
            // 2. Clear all caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                for (const name of cacheNames) {
                    await caches.delete(name);
                    console.log('Cache deleted:', name);
                }
            }
            
            // 3. Clear localStorage version info
            localStorage.removeItem('app_version');
            
            // 4. Force reload from server (bypass all caches)
            await new Promise(r => setTimeout(r, 500)); // Brief pause to show "Updating..."
            
            // Use cache-busting URL
            const url = new URL(window.location.href);
            url.searchParams.set('v', Date.now());
            window.location.replace(url.toString());
            
        } catch (error) {
            console.error('Update failed:', error);
            // Fallback: simple reload
            window.location.reload(true);
        }
    },
    
    // Register this device for analytics
    async registerDevice() {
        try {
            const deviceId = this.getDeviceId();
            await db.collection('appDevices').doc(deviceId).set({
                appId: this.appId,
                version: this.currentVersion,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: navigator.userAgent,
                platform: navigator.platform
            }, { merge: true });
        } catch (e) {
            // Silent fail - not critical
        }
    },
    
    getDeviceId() {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    },
    
    // Admin: Push update notification to all devices
    async pushUpdate(newVersion, releaseNotes, forceUpdate = false) {
        await db.collection('appConfig').doc(this.appId).set({
            version: newVersion,
            releaseNotes: releaseNotes,
            forceUpdate: forceUpdate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`Update pushed: v${newVersion}`);
    }
};

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to let Firebase init first
    setTimeout(() => VersionManager.init(), 1500);
});
