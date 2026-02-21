/**
 * BreadHub POS - Install Instructions Modal
 * Adapted from Go Mission install system
 * Flow: Device Selection → Read Instructions Notice → All Steps (Scrollable)
 */

const InstallModal = {
    currentDevice: null,
    currentScreen: 'device',
    isInstalled: false,
    
    steps: {
        android: [
            { key: 'and1', icon: '⋮', title: 'Tap the Menu Button', desc: 'Look for the 3 dots (⋮) at the top right corner of Chrome' },
            { key: 'and2', icon: '➕', title: 'Tap "Add to Home Screen"', desc: 'Or tap "Install App" if you see it in the menu' },
            { key: 'and3', icon: '✓', title: 'Tap "Install" or "Add"', desc: 'Confirm to add the app to your home screen' },
            { key: 'and4', icon: 'logo', title: 'Open from Home Screen', desc: 'Find the BreadHub icon on your home screen and tap it' }
        ],
        iphone: [
            { key: 'iph1', icon: 'share', title: 'Tap the Share Button', desc: 'Look for this icon (📤) at the bottom of Safari' },
            { key: 'iph2', icon: '➕', title: 'Tap "Add to Home Screen"', desc: 'Scroll down in the share menu to find this option' },
            { key: 'iph3', icon: '✓', title: 'Tap "Add"', desc: 'Located at the top right corner of the screen' },
            { key: 'iph4', icon: 'logo', title: 'Open from Home Screen', desc: 'Find the BreadHub icon on your home screen and tap it' }
        ],
        windows: [
            { key: 'win1', icon: '⊕', title: 'Click the Install Icon', desc: 'Look for this icon (⊕) in the address bar on the right side' },
            { key: 'win2', icon: '✓', title: 'Click "Install"', desc: 'Confirm the installation when the popup appears' },
            { key: 'win3', icon: 'logo', title: 'Open the App', desc: 'Find BreadHub POS in your apps, taskbar, or desktop' }
        ]
    },
    
    checkIfInstalled() {
        if (window.matchMedia('(display-mode: standalone)').matches) return true;
        if (window.navigator.standalone === true) return true;
        return false;
    },
    
    isDesktop() {
        const ua = navigator.userAgent;
        return !(/iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua));
    },
    
    init() {
        this.isInstalled = this.checkIfInstalled();
        const params = new URLSearchParams(window.location.search);
        const forceInstall = params.has('install');
        
        // If already installed as PWA, skip
        if (this.isInstalled) {
            if (this.isFirstLaunchAsPWA()) {
                setTimeout(() => this.showWelcome(), 500);
            }
            return;
        }
        
        // Show install guide for browser users
        if (forceInstall || !this.isInstalled) {
            setTimeout(() => this.show(), 800);
        }
        
        if (forceInstall) {
            const url = new URL(window.location);
            url.searchParams.delete('install');
            window.history.replaceState({}, '', url);
        }
    },
    
    isFirstLaunchAsPWA() {
        const hasSeenWelcome = localStorage.getItem('breadhub_welcomeShown');
        return this.checkIfInstalled() && !hasSeenWelcome;
    },
    
    showWelcome() {
        const modal = document.createElement('div');
        modal.id = 'installWelcomeModal';
        modal.innerHTML = `
            <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;">
                <div style="position:absolute;inset:0;background:rgba(10,25,41,0.95);"></div>
                <div style="position:relative;z-index:2;background:linear-gradient(135deg,#0d2137 0%,#1a2940 100%);border:2px solid rgba(212,137,74,0.4);border-radius:24px;padding:24px;max-width:360px;width:100%;text-align:center;color:#fff;">
                    <img src="icons/icon-192.png" alt="BreadHub" style="width:72px;height:72px;border-radius:18px;box-shadow:0 8px 30px rgba(212,137,74,0.4);margin-bottom:12px;">
                    <h1 style="font-size:24px;font-weight:800;color:#D4894A;margin:0 0 4px 0;">🎉 BreadHub Installed!</h1>
                    <p style="font-size:16px;color:#8ab4d6;margin:0 0 16px 0;">The app is now on your device.</p>
                    <div style="background:rgba(212,137,74,0.1);border:1px solid rgba(212,137,74,0.2);border-radius:14px;padding:12px;margin-bottom:16px;">
                        <p style="font-size:13px;color:#8ab4d6;margin:0 0 8px 0;">Find it on your home screen:</p>
                        <img src="icons/icon-192.png" alt="BreadHub" style="width:52px;height:52px;border-radius:14px;">
                        <p style="font-size:14px;font-weight:600;color:#fff;margin:6px 0 0 0;">BreadHub POS</p>
                    </div>
                    <button onclick="InstallModal.closeWelcome()" style="width:100%;padding:16px;background:linear-gradient(135deg,#D4894A 0%,#b5713a 100%);border:none;border-radius:14px;color:#0a1929;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px rgba(212,137,74,0.4);">
                        Let's Go! 🍞
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
    },
    
    closeWelcome() {
        localStorage.setItem('breadhub_welcomeShown', 'true');
        const el = document.getElementById('installWelcomeModal');
        if (el) el.remove();
        document.body.style.overflow = '';
    },
    
    show() {
        this.currentDevice = null;
        this.currentScreen = 'device';
        this.render();
    },
    
    render() {
        const existing = document.getElementById('installModal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'installModal';
        
        if (this.currentScreen === 'device') {
            modal.innerHTML = this.renderDeviceSelection();
        } else if (this.currentScreen === 'notice') {
            modal.innerHTML = this.renderNotice();
        } else if (this.currentScreen === 'steps') {
            modal.innerHTML = this.renderAllSteps();
        }
        
        this.addStyles();
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
    },
    
    renderDeviceSelection() {
        const ua = navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isAndroid = /Android/i.test(ua);
        let detected = '';
        if (isIOS) detected = 'iphone';
        else if (isAndroid) detected = 'android';
        
        return `
            <div class="install-overlay"></div>
            <div class="install-content">
                <div style="text-align:center;margin-bottom:20px;">
                    <img src="icons/icon-192.png" alt="BreadHub" style="width:72px;height:72px;border-radius:18px;box-shadow:0 4px 20px rgba(212,137,74,0.3);margin-bottom:12px;">
                    <h2 style="font-size:22px;font-weight:800;color:#D4894A;margin:0 0 4px 0;">🍞 Install BreadHub POS</h2>
                    <p style="font-size:14px;color:#8ab4d6;margin:0;">Your Bakery Management System</p>
                </div>
                
                <p class="install-subtitle">Choose your device:</p>
                
                <div class="device-buttons">
                    <button class="device-btn ${detected === 'android' ? 'detected' : ''}" onclick="InstallModal.selectDevice('android')">
                        <span class="device-icon">🤖</span>
                        <span class="device-name">Android</span>
                    </button>
                    <button class="device-btn ${detected === 'iphone' ? 'detected' : ''}" onclick="InstallModal.selectDevice('iphone')">
                        <span class="device-icon">🍎</span>
                        <span class="device-name">iPhone</span>
                    </button>
                </div>
                
                <button style="background:transparent;border:none;color:#64748b;font-size:13px;cursor:pointer;margin-top:16px;width:100%;text-align:center;" onclick="InstallModal.close()">
                    Skip for now
                </button>
            </div>
        `;
    },
    
    renderNotice() {
        return `
            <div class="install-overlay"></div>
            <div class="install-content" style="padding:32px 24px;">
                <div style="font-size:64px;margin-bottom:16px;text-align:center;">📖</div>
                <h2 style="font-size:24px;font-weight:800;color:#D4894A;margin:0 0 16px 0;text-align:center;">Before Installing</h2>
                <p style="color:#e2e8f0;font-size:16px;line-height:1.6;margin:0 0 16px 0;text-align:center;">
                    Please READ ALL the instructions first before you begin. This will help you install the app correctly.
                </p>
                <p style="color:#8ab4d6;font-size:14px;margin:0 0 24px 0;padding:12px;background:rgba(212,137,74,0.1);border-radius:12px;text-align:center;">
                    💡 Tip: You can scroll down to see all the steps.
                </p>
                <button class="primary-btn" onclick="InstallModal.showSteps()">
                    I Understand, Show Steps →
                </button>
                <button style="background:transparent;border:none;color:#64748b;font-size:14px;cursor:pointer;margin-top:12px;display:block;width:100%;text-align:center;" onclick="InstallModal.backToDevice()">
                    ← Back
                </button>
            </div>
        `;
    },
    
    renderAllSteps() {
        const deviceSteps = this.steps[this.currentDevice];
        
        let stepsHtml = deviceSteps.map((step, index) => {
            const iconHtml = this.getStepIcon(step.icon);
            return `
                <div class="step-card">
                    <div class="step-num">${index + 1}</div>
                    <div class="step-body">
                        <div class="step-icon-container">${iconHtml}</div>
                        <div class="step-text-box">
                            <h4>${step.title}</h4>
                            <p>${step.desc}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (this.currentDevice === 'iphone') {
            stepsHtml += `<div style="background:rgba(212,137,74,0.15);border:1px solid rgba(212,137,74,0.3);padding:12px;border-radius:12px;text-align:center;color:#D4894A;font-size:13px;margin-bottom:16px;">📱 Requires iOS 16.4 or newer for full features</div>`;
        }
        
        const beginText = this.currentDevice === 'android' 
            ? 'Now tap the Menu (⋮) button above and click "Add to Home Screen"'
            : this.currentDevice === 'windows'
                ? 'Now click the Install icon (⊕) above'
                : 'Now tap the Share (📤) button below and click "Add to Home Screen"';
        
        const pointDir = (this.currentDevice === 'android' || this.currentDevice === 'windows') ? 'up' : 'down';
        const pointEmoji = pointDir === 'up' ? '☝️' : '👇';
        
        return `
            <div class="install-overlay"></div>
            <div class="install-content steps-content">
                <div class="steps-header">
                    <button style="background:transparent;border:none;color:#D4894A;font-size:14px;cursor:pointer;" onclick="InstallModal.backToDevice()">← Back</button>
                    <h2 style="font-size:16px;font-weight:700;color:#D4894A;margin:0;">Installation Steps</h2>
                    <div style="width:50px;"></div>
                </div>
                <div class="steps-scroll">
                    ${stepsHtml}
                    <div class="begin-section">
                        <div style="font-size:48px;margin-bottom:12px;">✅</div>
                        <h3 style="font-size:20px;font-weight:800;color:#4ade80;margin:0 0 8px 0;">Ready to Install!</h3>
                        <p style="font-size:16px;color:#e2e8f0;margin:0 0 16px 0;font-weight:600;">${beginText}</p>
                        <div class="point-${pointDir}"><span style="font-size:48px;">${pointEmoji}</span></div>
                    </div>
                </div>
            </div>
        `;
    },
    
    getStepIcon(icon) {
        if (icon === 'share') {
            return `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#007AFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
        } else if (icon === 'logo') {
            return `<img src="icons/icon-192.png" alt="BreadHub" style="width:40px;height:40px;border-radius:10px;">`;
        }
        return `<span style="font-size:28px;">${icon}</span>`;
    },
    
    selectDevice(device) {
        this.currentDevice = device;
        this.currentScreen = 'notice';
        this.render();
    },
    
    showSteps() {
        this.currentScreen = 'steps';
        this.render();
    },
    
    backToDevice() {
        this.currentDevice = null;
        this.currentScreen = 'device';
        this.render();
    },
    
    close() {
        const modal = document.getElementById('installModal');
        if (modal) modal.remove();
        document.body.style.overflow = '';
    },
    
    addStyles() {
        const oldStyle = document.getElementById('installModalStyles');
        if (oldStyle) oldStyle.remove();
        
        const style = document.createElement('style');
        style.id = 'installModalStyles';
        style.textContent = `
            #installModal {
                position: fixed; inset: 0; z-index: 99999;
                display: flex; align-items: center; justify-content: center; padding: 12px;
            }
            #installModal .install-overlay {
                position: absolute; inset: 0; background: rgba(0,0,0,0.95);
            }
            #installModal .install-content {
                position: relative;
                background: #0a1929;
                border: 1px solid rgba(212, 137, 74, 0.3);
                border-radius: 24px; padding: 24px;
                max-width: 420px; width: 100%;
                max-height: 90vh; overflow-y: auto;
                color: #fff; text-align: center;
            }
            #installModal .install-subtitle {
                color: #8ab4d6; margin-bottom: 16px; font-size: 14px;
            }
            #installModal .device-buttons {
                display: flex; flex-direction: column; gap: 10px;
            }
            #installModal .device-btn {
                display: flex; align-items: center; gap: 16px;
                padding: 14px 18px;
                background: rgba(255,255,255,0.05);
                border: 2px solid rgba(255,255,255,0.1);
                border-radius: 14px; color: #fff;
                font-size: 16px; cursor: pointer; transition: all 0.2s;
            }
            #installModal .device-btn.detected {
                border-color: #D4894A; background: rgba(212, 137, 74, 0.1);
            }
            #installModal .device-btn:hover { border-color: #D4894A; }
            #installModal .device-icon { font-size: 28px; }
            #installModal .device-name { font-weight: 600; }
            #installModal .primary-btn {
                width: 100%; padding: 16px;
                background: linear-gradient(135deg, #D4894A 0%, #b5713a 100%);
                border: none; border-radius: 14px;
                color: #0a1929; font-size: 16px; font-weight: 700; cursor: pointer;
            }
            #installModal .steps-content {
                padding: 16px; max-height: 90vh;
                display: flex; flex-direction: column;
            }
            #installModal .steps-header {
                display: flex; align-items: center; justify-content: space-between;
                padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);
                margin-bottom: 12px; flex-shrink: 0;
            }
            #installModal .steps-scroll {
                overflow-y: auto; flex: 1; padding-right: 4px;
            }
            #installModal .step-card {
                display: flex; gap: 12px; padding: 16px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 16px; margin-bottom: 12px; text-align: left;
            }
            #installModal .step-num {
                width: 32px; height: 32px;
                background: #D4894A; color: #0a1929;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: 800; font-size: 16px; flex-shrink: 0;
            }
            #installModal .step-body {
                flex: 1; display: flex; gap: 12px; align-items: flex-start;
            }
            #installModal .step-icon-container {
                flex-shrink: 0; width: 50px; height: 50px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.05); border-radius: 12px;
            }
            #installModal .step-text-box { flex: 1; }
            #installModal .step-text-box h4 {
                font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 4px 0;
            }
            #installModal .step-text-box p {
                font-size: 13px; color: #8ab4d6; margin: 0; line-height: 1.4;
            }
            #installModal .begin-section {
                background: linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%);
                border: 2px solid rgba(34,197,94,0.3);
                border-radius: 20px; padding: 24px 20px;
                text-align: center; margin-top: 8px;
            }
            #installModal .point-down { display:flex;justify-content:center;animation:bounce-down 1s infinite; }
            #installModal .point-up { display:flex;justify-content:center;animation:bounce-up 1s infinite; }
            @keyframes bounce-down { 0%,100%{transform:translateY(0)} 50%{transform:translateY(10px)} }
            @keyframes bounce-up { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        `;
        document.head.appendChild(style);
    }
};

window.InstallModal = InstallModal;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => InstallModal.init());
} else {
    InstallModal.init();
}
