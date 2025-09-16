firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists && userDoc.data().role === 'admin') {
            document.body.style.display = 'block';
            initializeApp();
        } else {
            window.location.replace('index.html');
        }
    } else {
        window.location.replace('index.html');
    }
});

async function initializeApp() {
    const logsContainer = document.getElementById('logs-container');

    try {
        const snapshot = await db.collection('logs').orderBy('timestamp', 'desc').limit(200).get();
        
        if (snapshot.empty) {
            logsContainer.innerHTML = '<p>Nenhum registro de alteração encontrado.</p>';
            return;
        }

        let logsHtml = '<ul>';
        snapshot.forEach(doc => {
            const log = doc.data();
            const date = log.timestamp.toDate().toLocaleString('pt-BR');
            logsHtml += `
                <li>
                    <span class="log-date">${date}</span>
                    <span class="log-user">${log.userEmail}</span>
                    <span class="log-action">${log.action}</span>
                    <div class="log-details">${log.details}</div>
                </li>
            `;
        });
        logsHtml += '</ul>';

        logsContainer.innerHTML = logsHtml;

    } catch (error) {
        console.error("Erro ao carregar logs: ", error);
        logsContainer.innerHTML = "<p style='color:red;'>Não foi possível carregar o histórico de alterações.</p>";
    }
}
