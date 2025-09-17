firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore(); 
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    errorMessage.textContent = '';

    auth.signInWithEmailAndPassword(email, password)
        .then(async (userCredential) => {
            const user = userCredential.user;
            const userDocRef = db.collection('users').doc(user.uid);
            const userDoc = await userDocRef.get();

            if (userDoc.exists) {
                const userRole = userDoc.data().role;

               
                if (userRole === 'admin') {
                    window.location.href = 'distribuicao.html';
                } else if (userRole === 'corretor' || userRole === 'corretores') { 
                    window.location.href = 'plantao.html';
                } else if (userRole === 'recepcao') { // <-- NOVA CONDIÇÃO
                    window.location.href = 'distribuicao.html';
                } else {
                   
                    errorMessage.textContent = 'Você não tem permissão para acessar o sistema.';
                    auth.signOut();
                }
            } else {
                
                errorMessage.textContent = 'Usuário não encontrado no sistema de permissões.';
                auth.signOut();
            }
        })
        .catch((error) => {
            
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMessage.textContent = 'Email ou senha inválidos.';
            } else {
                errorMessage.textContent = 'Ocorreu um erro. Tente novamente.';
            }
            console.error("Erro de login:", error);
        });
});
