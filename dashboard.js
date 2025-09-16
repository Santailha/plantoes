firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        
        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (userDoc.exists && userDoc.data().role === 'admin') {
            
            document.body.style.display = 'block';
            initializeApp();
        } else {
            
            console.error("Acesso negado: o utilizador não é um administrador.");
            alert("Acesso negado. Você não tem permissão para ver esta página.");
            window.location.replace('plantao.html'); 
        }
    } else {
        
        window.location.replace('index.html');
    }
});

function initializeApp() {
    const monthFilter = document.getElementById('month-filter');
    const dateFilter = document.getElementById('date-filter');
    const clearDateFilterBtn = document.getElementById('clear-date-filter');
    const corretorFilter = document.getElementById('corretor-filter');
    const dashboardContainer = document.getElementById('dashboard-container');
    const leadDetailsModal = document.getElementById('lead-details-modal');
    const closeModalBtn = leadDetailsModal.querySelector('.close-btn');

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    monthFilter.value = `${year}-${month}`;

    monthFilter.addEventListener('change', () => {
        // Ao mudar o mês, limpa o filtro de data
        dateFilter.value = '';
        renderDashboard();
    });
    dateFilter.addEventListener('change', renderDashboard);
    clearDateFilterBtn.addEventListener('click', () => {
        dateFilter.value = '';
        renderDashboard();
    });
    corretorFilter.addEventListener('change', renderDashboard);
    closeModalBtn.addEventListener('click', () => leadDetailsModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target == leadDetailsModal) {
            leadDetailsModal.style.display = 'none';
        }
    });

    let statsCache = {};

    async function getCorretores() {
        const snapshot = await db.collection('corretores').orderBy('nome').get();
        const corretores = {};
        corretorFilter.innerHTML = '<option value="todos">Todos os corretores</option>';
        snapshot.forEach(doc => {
            const corretor = { id: doc.id, ...doc.data() };
            corretores[doc.id] = corretor;
            corretorFilter.innerHTML += `<option value="${corretor.id}">${corretor.nome}</option>`;
        });
        return corretores;
    }

    function processSnapshot(snapshot, stats) {
        const processDoc = (doc) => {
            if (!doc.exists) return;
            const dailyData = doc.data();
            const leadDate = doc.id;

            for (const corretorId in dailyData) {
                if (stats[corretorId]) {
                    stats[corretorId].diasDePlantao++;
                    const turnos = dailyData[corretorId];
                    let leadsDoDia = 0;
                    for (const turno in turnos) {
                        if (typeof turnos[turno] === 'number') {
                            leadsDoDia += turnos[turno];
                        }
                    }
                    stats[corretorId].leadsRecebidos += leadsDoDia;
                    if (leadsDoDia > 0) {
                        stats[corretorId].leadDetails.push({ date: leadDate, count: leadsDoDia });
                    }
                }
            }
        };

        if (snapshot.docs) { // Se for um QuerySnapshot (mês inteiro)
            snapshot.forEach(processDoc);
        } else { // Se for um DocumentSnapshot (dia único)
            processDoc(snapshot);
        }
    }

    async function renderDashboard() {
        dashboardContainer.innerHTML = 'A carregar...';
        try {
            const selectedDate = dateFilter.value;
            const [year, month] = monthFilter.value.split('-').map(Number);
            const selectedCorretorId = corretorFilter.value;
            const corretores = await getCorretores();
            corretorFilter.value = selectedCorretorId;

            if (Object.keys(corretores).length === 0) {
                 dashboardContainer.innerHTML = '<p>Nenhum corretor encontrado na base de dados.</p>';
                 return;
            }

            const stats = {};
            Object.values(corretores).forEach(corretor => {
                stats[corretor.id] = {
                    nome: corretor.nome,
                    diasDePlantao: 0,
                    leadsRecebidos: 0,
                    leadDetails: []
                };
            });
            
            let snapshot;
            if (selectedDate) {
                // Filtro por dia específico
                snapshot = await db.collection('contagem_leads_diaria').doc(selectedDate).get();
            } else {
                // Filtro pelo mês inteiro
                const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
                const nextMonthDate = new Date(year, month, 1);
                const endDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                snapshot = await db.collection('contagem_leads_diaria')
                    .where(firebase.firestore.FieldPath.documentId(), '>=', startDate)
                    .where(firebase.firestore.FieldPath.documentId(), '<', endDate)
                    .get();
            }

            processSnapshot(snapshot, stats);
            statsCache = stats;

            let tableContent = "";
            let statsArray = Object.entries(stats);

            if (selectedCorretorId !== 'todos') {
                statsArray = statsArray.filter(([id, stat]) => id === selectedCorretorId);
            }

            statsArray
                .filter(([id, stat]) => stat.diasDePlantao > 0)
                .sort(([idA, statA], [idB, statB]) => statB.leadsRecebidos - statA.leadsRecebidos)
                .forEach(([id, stat]) => {
                    tableContent += `
                        <tr>
                            <td>${stat.nome}</td>
                            <td>${stat.diasDePlantao}</td>
                            <td class="leads-cell" data-corretor-id="${id}">${stat.leadsRecebidos}</td>
                        </tr>`;
                });

            const headerDias = selectedDate ? 'Plantão no Dia' : 'Dias de Plantão no Mês';

            if (tableContent === "") {
                dashboardContainer.innerHTML = "<p>Nenhum dado de plantão encontrado para os filtros selecionados.</p>";
            } else {
                dashboardContainer.innerHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>Corretor</th>
                                <th>${headerDias}</th>
                                <th>Leads Recebidos no Plantão</th>
                            </tr>
                        </thead>
                        <tbody>${tableContent}</tbody>
                    </table>`;
            }

            document.querySelectorAll('.leads-cell').forEach(cell => {
                cell.addEventListener('click', (e) => {
                    const corretorId = e.target.dataset.corretorId;
                    openLeadDetailsModal(corretorId);
                });
            });

        } catch (error) {
            dashboardContainer.innerHTML = `<p style="color: red; text-align: center;">Ocorreu um erro ao carregar o dashboard. Verifique o console (F12) para mais detalhes.</p>`;
            console.error("Erro ao renderizar o dashboard:", error);
        }
    }

    function openLeadDetailsModal(corretorId) {
        const corretorStats = statsCache[corretorId];
        if (!corretorStats) return;

        const modalTitle = leadDetailsModal.querySelector('#modal-title-leads');
        const leadListContainer = leadDetailsModal.querySelector('#lead-list-container');

        modalTitle.textContent = `Leads de ${corretorStats.nome}`;

        if (corretorStats.leadDetails.length === 0) {
            leadListContainer.innerHTML = '<p>Nenhum lead recebido neste período.</p>';
        } else {
            let listHtml = '<ul>';
            corretorStats.leadDetails.sort((a,b) => a.date.localeCompare(b.date)).forEach(detail => {
                const [ano, mes, dia] = detail.date.split('-');
                const dataFormatada = `${dia}/${mes}/${ano}`;
                const plural = detail.count > 1 ? 's' : '';
                listHtml += `<li><strong>${dataFormatada}:</strong> ${detail.count} lead${plural}</li>`;
            });
            listHtml += '</ul>';
            leadListContainer.innerHTML = listHtml;
        }

        leadDetailsModal.style.display = 'block';
    }

    renderDashboard();
}
