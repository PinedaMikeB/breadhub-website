/**
 * BreadHub POS - Firebase Initialization
 * SHARES DATABASE with ProofMaster
 */

let app = null;
let db = null;
let auth = null;

function initFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK not loaded');
            return false;
        }
        
        if (firebase.apps.length > 0) {
            app = firebase.apps[0];
        } else {
            app = firebase.initializeApp(CONFIG.firebase);
        }
        
        db = firebase.firestore();
        auth = firebase.auth();
        
        // Enable offline persistence
        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn('Persistence:', err.code);
        });
        
        console.log('Firebase initialized - connected to ProofMaster database');
        return true;
        
    } catch (error) {
        console.error('Firebase init error:', error);
        return false;
    }
}

// Database helper
const DB = {
    collection: (name) => db.collection(name),
    
    async getAll(collectionName) {
        const snapshot = await db.collection(collectionName).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    async get(collectionName, docId) {
        const doc = await db.collection(collectionName).doc(docId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    
    async add(collectionName, data) {
        const docRef = await db.collection(collectionName).add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    },
    
    async update(collectionName, docId, data) {
        await db.collection(collectionName).doc(docId).update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },
    
    // Set document (creates if doesn't exist, merges if exists)
    async set(collectionName, docId, data, merge = true) {
        await db.collection(collectionName).doc(docId).set({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: merge });
    },
    
    async delete(collectionName, docId) {
        await db.collection(collectionName).doc(docId).delete();
    },
    
    async query(collectionName, field, operator, value) {
        const snapshot = await db.collection(collectionName)
            .where(field, operator, value)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    // Force fetch from server (bypass cache)
    async queryFresh(collectionName, field, operator, value) {
        const snapshot = await db.collection(collectionName)
            .where(field, operator, value)
            .get({ source: 'server' });
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    // Get all fresh from server
    async getAllFresh(collectionName) {
        const snapshot = await db.collection(collectionName).get({ source: 'server' });
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    // Get next sale number for today
    async getNextSaleNumber() {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.collection('sales')
            .where('dateKey', '==', today)
            .get();
        return snapshot.size + 1;
    },
    
    // Get sub-collection documents (e.g., ingredients/{id}/prices)
    async getSubcollection(collectionName, docId, subcollectionName) {
        const snapshot = await db.collection(collectionName)
            .doc(docId)
            .collection(subcollectionName)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
};
