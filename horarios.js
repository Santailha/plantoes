firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userRole = userDoc.data().role;
            if (userRole === 'admin' || userRole === 'corretor' || userRole === 'corretores') {
                document.body.style.display = 'block';
                initializeApp(userRole);
            } else {
                window.location.replace('index.html');
            }
        } else {
            window.location.replace('index.html');
        }
    } else {
        window.location.replace('index.html');
    }
});

async function initializeApp(userRole) {
    const horariosContainer = document.getElementById('horarios-container');
    const adminActions = document.getElementById('admin-actions');
    const saveButton = document.getElementById('save-horarios-btn');
    const successMessage = document.getElementById('success-message');

    const horariosRef = db.collection('configuracoes').doc('horarios');
    let plantoesCache = [];

    // Função para carregar a lista de plantões
    async function loadPlantoes() {
        const snapshot = await db.collection('plantoes').orderBy('nome').get();
        plantoesCache = [];
        snapshot.forEach(doc => {
            plantoesCache.push({ id: doc.id, ...doc.data() });
        });
    }

    async function loadHorarios() {
        try {
            const doc = await horariosRef.get();
            const horariosData = doc.exists ? doc.data() : {};
            renderHorarios(horariosData);
        } catch (error) {
            console.error("Erro ao carregar horários: ", error);
            horariosContainer.innerHTML = "<p style='color:red;'>Não foi possível carregar os horários.</p>";
        }
    }

    function renderHorarios(horarios) {
        let html = '';
        if (plantoesCache.length === 0) {
            horariosContainer.innerHTML = "<p>Nenhum plantão criado. Crie um plantão primeiro na página de Gerenciador de Plantões.</p>";
            return;
        }

        plantoesCache.forEach(plantao => {
            // Usa o ID do plantão como chave para buscar o horário
            const horario = horarios[plantao.id] || { inicio: '08:00', fim: '18:00' };
            html += `<div class="turno-card"><h3>${plantao.nome}</h3>`;
            if (userRole === 'admin') {
                html += `
                    <div class="horario-edit">
                        <input type="time" id="${plantao.id}-inicio" value="${horario.inicio}">
                        <span>às</span>
                        <input type="time" id="${plantao.id}-fim" value="${horario.fim}">
                    </div>`;
                adminActions.style.display = 'block';
            } else {
                html += `
                    <div class="horario-display">
                        <span>${horario.inicio}</span>
                        <span>às</span>
                        <span>${horario.fim}</span>
                    </div>`;
            }
            html += `</div>`;
        });
        horariosContainer.innerHTML = html;
    }

    async function saveHorarios() {
        const novosHorarios = {};
        plantoesCache.forEach(plantao => {
            const inicio = document.getElementById(`${plantao.id}-inicio`).value;
            const fim = document.getElementById(`${plantao.id}-fim`).value;
            novosHorarios[plantao.id] = { inicio, fim };
        });

        try {
            await horariosRef.set(novosHorarios, { merge: true });
            successMessage.textContent = 'Horários salvos com sucesso!';
            setTimeout(() => successMessage.textContent = '', 3000);
        } catch (error) {
            console.error("Erro ao salvar horários: ", error);
            successMessage.textContent = 'Erro ao salvar. Tente novamente.';
            successMessage.style.color = 'red';
            setTimeout(() => {
                successMessage.textContent = '';
                successMessage.style.color = 'green';
            }, 3000);
        }
    }

    if (userRole === 'admin') {
        saveButton.addEventListener('click', saveHorarios);
    }

    // Carrega primeiro a lista de plantões, depois os horários
    await loadPlantoes();
    await loadHorarios();
}
