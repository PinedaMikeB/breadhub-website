/**
 * BreadHub POS - Modal Component
 */

const Modal = {
    overlay: null,
    modal: null,
    onSaveCallback: null,
    
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
        
        if (options.showFooter === false) {
            footer.style.display = 'none';
        } else {
            footer.style.display = 'flex';
            saveBtn.textContent = options.saveText || 'Save';
            saveBtn.className = `btn ${options.saveClass || 'btn-primary'}`;
        }
        
        this.onSaveCallback = options.onSave;
        saveBtn.onclick = () => this.save();
        
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
