/**
 * BreadHub Website Admin - ProofMaster Integration
 * Handles prefill from ProofMaster launch button
 */

// Check for prefill parameters on page load
function checkPrefillFromProofMaster() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('prefill') === 'true') {
        const name = urlParams.get('name') || '';
        const price = urlParams.get('price') || '';
        const category = urlParams.get('category') || '';
        const proofmasterId = urlParams.get('proofmasterId') || '';
        
        console.log('Prefilling from ProofMaster:', { name, price, category, proofmasterId });
        
        // Check if this product already exists in shopProducts
        findAndEditOrPrefill(name, price, category, proofmasterId);
    }
}

async function findAndEditOrPrefill(name, price, category, proofmasterId) {
    try {
        showLoading(true);
        
        // First try to find by proofmasterId
        let existingDoc = null;
        
        if (proofmasterId) {
            const snapshot = await db.collection('shopProducts')
                .where('proofmasterProductId', '==', proofmasterId)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                existingDoc = snapshot.docs[0];
            }
        }
        
        // If not found by ID, try by name
        if (!existingDoc && name) {
            const nameSnapshot = await db.collection('shopProducts')
                .where('name', '==', name)
                .limit(1)
                .get();
            
            if (!nameSnapshot.empty) {
                existingDoc = nameSnapshot.docs[0];
            }
        }
        
        showLoading(false);
        
        if (existingDoc) {
            // Edit existing product
            showToast('Found existing product - loading for edit...', 'success');
            await editProduct(existingDoc.id);
            
            // Update price if different
            if (price && parseFloat(price) > 0) {
                document.getElementById('productPrice').value = price;
            }
        } else {
            // Prefill new product form
            resetForm();
            
            if (name) document.getElementById('productName').value = name;
            if (price) document.getElementById('productPrice').value = price;
            if (category) document.getElementById('productCategory').value = category;
            
            // Handle category change for drinks variants
            handleCategoryChange();
            
            document.getElementById('formTitle').textContent = '✨ New Product from ProofMaster';
            document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });
            
            showToast('Product pre-filled from ProofMaster! Add images and SEO description.', 'success');
        }
        
        // Clear URL params without reload
        window.history.replaceState({}, document.title, window.location.pathname);
        
    } catch (error) {
        console.error('Error during prefill:', error);
        showLoading(false);
        
        // Still prefill the form even if lookup failed
        resetForm();
        if (name) document.getElementById('productName').value = name;
        if (price) document.getElementById('productPrice').value = price;
        if (category) document.getElementById('productCategory').value = category;
        handleCategoryChange();
    }
}
