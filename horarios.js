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
        if (plantoesCache.length === 0) {
            horariosContainer.innerHTML = "<p>Nenhum plantão criado. Crie um plantão primeiro na página de Gerenciador de Plantões.</p>";
            return;
        }

        let html = `
            <div class="horarios-section">
                <h2 class="horarios-section-title">Horários Padrão (Segunda a Sexta)</h2>
                ${generateSectionHtml('padrao', horarios, userRole)}
            </div>
            <div class="horarios-section">
                <h2 class="horarios-section-title">Horários Especiais (Sábados, Domingos e Feriados)</h2>
                ${generateSectionHtml('especial', horarios, userRole)}
            </div>
        `;
        
        horariosContainer.innerHTML = html;
        if (userRole === 'admin') {
            adminActions.style.display = 'block';
        }
    }

    function generateSectionHtml(section, horarios, userRole) {
        let sectionHtml = '';
        const turnos = {
            manha: { label: 'Manhã', default: { inicio: '08:00', fim: '12:00' } },
            tarde: { label: 'Tarde', default: { inicio: '12:00', fim: '18:00' } },
            noite: { label: 'Noite', default: { inicio: '18:00', fim: '22:00' } }
        };

        plantoesCache.forEach(plantao => {
            sectionHtml += `<div class="plantao-card"><h3>${plantao.nome}</h3><div class="turno-container">`;

            for (const turno in turnos) {
                const horario = horarios[plantao.id]?.[section]?.[turno] || turnos[turno].default;
                
                if (userRole === 'admin') {
                    sectionHtml += `
                        <div class="horario-edit">
                            <label for="${plantao.id}-${section}-${turno}-inicio">${turnos[turno].label}:</label>
                            <input type="time" id="${plantao.id}-${section}-${turno}-inicio" value="${horario.inicio}">
                            <span>às</span>
                            <input type="time" id="${plantao.id}-${section}-${turno}-fim" value="${horario.fim}">
                        </div>`;
                } else {
                    sectionHtml += `
                        <div class="horario-display">
                            <label>${turnos[turno].label}:</label>
                            <span>${horario.inicio}</span>
                            <span>às</span>
                            <span>${horario.fim}</span>
                        </div>`;
                }
            }
            sectionHtml += `</div></div>`;
        });

        return sectionHtml;
    }

    async function saveHorarios() {
        const novosHorarios = {};
        const sections = ['padrao', 'especial'];
        const turnos = ['manha', 'tarde', 'noite'];

        plantoesCache.forEach(plantao => {
            novosHorarios[plantao.id] = {};
            sections.forEach(section => {
                novosHorarios[plantao.id][section] = {};
                turnos.forEach(turno => {
                    const inicio = document.getElementById(`${plantao.id}-${section}-${turno}-inicio`).value;
                    const fim = document.getElementById(`${plantao.id}-${section}-${turno}-fim`).value;
                    novosHorarios[plantao.id][section][turno] = { inicio, fim };
                });
            });
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

    await loadPlantoes();
    await loadHorarios();
}
