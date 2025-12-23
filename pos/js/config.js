/**
 * BreadHub POS - Configuration
 * SHARES DATABASE with ProofMaster
 */

const CONFIG = {
    // SAME Firebase config as ProofMaster - shared database
    firebase: {
        apiKey: "AIzaSyAj2szYv9ynVFrxdH0tpUsOg7JmJn6Wq0g",
        authDomain: "breadhub-proofmaster.firebaseapp.com",
        projectId: "breadhub-proofmaster",
        storageBucket: "breadhub-proofmaster.firebasestorage.app",
        messagingSenderId: "222137689770",
        appId: "1:222137689770:web:645c552afa835732c852d3"
    },
    
    app: {
        name: "BreadHub POS",
        version: "1.0.0",
        currency: "₱",
        locale: "en-PH"
    },
    
    pos: {
        defaultPaymentMethod: "cash",
        paymentMethods: ["cash", "gcash", "card"],
        allowNegativeStock: true,  // Allow sales even if stock is 0
        receiptHeader: "BreadHub Bakery",
        receiptFooter: "Thank you for your purchase!"
    }
};
