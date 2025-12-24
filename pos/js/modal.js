/**
 * BreadHub POS - Modal Component v2
 * Added: customFooter and hideFooter support
 */

const Modal = {
    overlay: null,
    modal: null,
    onSaveCallback: null,
    onCancelCallback: null,
    
    init() {
        this.overlay = document.getElementById('modalOverlay');
        this.modal = document.getElementById('modal');
    },
    
    open(options = {}) {
        if (!this.overlay) this.init();
        
        document.getElementById('modalTitle').textContent = options.title || 'Modal';
        document.getElementById('modalBody').innerHTML = options.content || '';
        
        const footer = document.getElementById('modalFooter');
        const saveBtn = document.getElementById('modalSaveBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');
        
        // Handle custom footer
        if (options.customFooter) {
            footer.innerHTML = options.customFooter;
            footer.style.display = 'block';
            footer.className = 'modal-footer custom-footer';
        } else if (options.hideFooter) {
            footer.style.display = 'none';
        } else {
            // Reset to default footer
            footer.style.display = 'flex';
            footer.className = 'modal-footer';
            footer.innerHTML = `
                <button class="btn btn-outline" id="modalCancelBtn">Cancel</button>
                <button class="btn btn-primary" id="modalSaveBtn">Save</button>
            `;
            
            const newSaveBtn = document.getElementById('modalSaveBtn');
            const newCancelBtn = document.getElementById('modalCancelBtn');
            
            newSaveBtn.textContent = options.saveText || 'Save';
            newSaveBtn.className = `btn ${options.saveClass || 'btn-primary'}`;
            newSaveBtn.onclick = () => this.save();
            
            if (options.cancelText === null) {
                newCancelBtn.style.display = 'none';
            } else {
                newCancelBtn.textContent = options.cancelText || 'Cancel';
                newCancelBtn.onclick = () => this.cancel();
            }
        }
        
        this.onSaveCallback = options.onSave;
        this.onCancelCallback = options.onCancel;
        
        if (options.width) {
            this.modal.style.maxWidth = options.width;
        } else {
            this.modal.style.maxWidth = '500px';
        }
        
        this.overlay.classList.add('active');
    },
    
    close() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
        }
        this.onSaveCallback = null;
        this.onCancelCallback = null;
    },
    
    cancel() {
        if (this.onCancelCallback) {
            this.onCancelCallback();
        }
        this.close();
    },
    
    async save() {
        if (this.onSaveCallback) {
            const result = await this.onSaveCallback();
            if (result !== false) {
                this.close();
            }
        } else {
            this.close();
        }
    },
    
    getFormData() {
        const form = this.modal.querySelector('form');
        if (!form) return {};
        
        const data = {};
        const formData = new FormData(form);
        formData.forEach((value, key) => {
            data[key] = value;
        });
        return data;
    }
};
