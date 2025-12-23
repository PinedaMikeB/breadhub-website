/**
 * BreadHub POS - Authentication
 * Uses same auth as ProofMaster
 */

const Auth = {
    currentUser: null,
    userData: null,
    
    init() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadUserData(user.uid);
                this.showPOS();
            } else {
                this.currentUser = null;
                this.userData = null;
                this.showLogin();
            }
        });
    },
    
    async loadUserData(uid) {
        try {
            const doc = await db.collection('users').doc(uid).get();
            if (doc.exists) {
                this.userData = { id: doc.id, ...doc.data() };
                document.getElementById('currentUserName').textContent = this.userData.name || 'User';
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    },
    
    async signIn() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            Toast.error('Please enter email and password');
            return;
        }
        
        try {
            await auth.signInWithEmailAndPassword(email, password);
            Toast.success('Signed in successfully');
        } catch (error) {
            console.error('Sign in error:', error);
            Toast.error(error.message || 'Sign in failed');
        }
    },
    
    async signOut() {
        try {
            await auth.signOut();
            Toast.info('Signed out');
        } catch (error) {
            console.error('Sign out error:', error);
        }
    },
    
    showLogin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('posContainer').style.display = 'none';
    },
    
    showPOS() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('posContainer').style.display = 'block';
        App.loadData();
    },
    
    hasRole(role) {
        if (!this.userData) return false;
        const roles = ['staff', 'baker', 'manager', 'admin'];
        const userRoleIndex = roles.indexOf(this.userData.role || 'staff');
        const requiredIndex = roles.indexOf(role);
        return userRoleIndex >= requiredIndex;
    }
};
