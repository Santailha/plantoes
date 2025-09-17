firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();


auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
        
        if (userDoc.exists && (userDoc.data().role === 'admin' || userDoc.data().role === 'recepcao')) {
            console.log("Acesso concedido.");
            document.body.style.display = 'block';
            
            initializeApp(userDoc.data().role); 
        } else {
            console.error("Acesso negado: o usuário não é um administrador ou recepção.");
            auth.signOut();
            window.location.replace('index.html');
        }
    } else {
        if (window.location.pathname.includes('distribuicao.html')) {
            window.location.replace('index.html');
        }
    }
});


function initializeApp(userRole) { 

    const calendarGrid = document.getElementById('calendar-grid');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const modal = document.getElementById('edit-modal');
    const closeModalBtn = document.querySelector('.close-btn');
    const editScaleForm = document.getElementById('edit-scale-form');
    const addAgentForm = document.getElementById('add-agent-form');
    const agentListEl = document.getElementById('agent-list');
    const tabsContainer = document.querySelector('.tabs');
    const agentFilterEl = document.getElementById('agent-filter');
    const logoutBtn = document.getElementById('logout-btn');

    let currentDate = new Date();
    let corretoresCache = {};
    let escalaCache = {};
    let unidadeAtiva = 'centro';
    let corretorFiltradoId = 'todos';

    document.body.classList.add(`role-${userRole}`);

    async function addLog(action, details) {
        const user = auth.currentUser;
        if (!user) return;

        try {
            await db.collection('logs').add({
                action,
                details,
                userId: user.uid,
                userEmail: user.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error("Erro ao registrar log:", error);
        }
    }
    
    async function handleAddAgent(e) {
        e.preventDefault();
        const nome = document.getElementById('agent-name').value;
        const email = document.getElementById('agent-email').value;
        const idBitrix = document.getElementById('agent-bitrix-id').value;
        const unidade = document.getElementById('agent-unidade').value;

        if (!nome || !email || !idBitrix) {
            alert("Por favor, preencha todos os campos.");
            return;
        }
        try {
            await db.collection('corretores').add({
                nome, email, unidade,
                idBitrix: parseInt(idBitrix),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            addLog('Adição de Corretor', `Corretor "${nome}" adicionado à unidade ${unidade}.`);
            
            addAgentForm.reset();
            alert("Corretor adicionado com sucesso!");
        } catch (error) {
            console.error("Erro ao adicionar corretor: ", error);
            alert("Não foi possível adicionar o corretor.");
        }
    }

    function listenForAgents() {
        db.collection('corretores').orderBy('nome').onSnapshot(snapshot => {
            agentListEl.innerHTML = '';
            corretoresCache = {};
            agentFilterEl.innerHTML = '<option value="todos">Ver todos os corretores</option>';

            if (snapshot.empty) {
                agentListEl.innerHTML = "<li>Nenhum corretor cadastrado.</li>";
                renderCalendar();
                return;
            }

            snapshot.forEach(doc => {
                const agent = doc.data();
                agentListEl.innerHTML += `
                    <li>
                        <div class="agent-info">
                            <span class="agent-name">${agent.nome}</span>
                            <span class="agent-details">Unidade: ${agent.unidade} | ID: ${agent.idBitrix}</span>
                        </div>
                        <button class="delete-agent-btn" data-id="${doc.id}" title="Excluir Corretor">✖</button>
                    </li>
                `;
                agentFilterEl.innerHTML += `<option value="${doc.id}">${agent.nome}</option>`;
                corretoresCache[doc.id] = { id: doc.id, nome: agent.nome, primeiroNome: agent.nome.split(' ')[0], unidade: agent.unidade };
            });

            agentFilterEl.value = corretorFiltradoId;
            renderCalendar();
        });
    }

    async function handleDeleteAgent(e) {
        if (!e.target.classList.contains('delete-agent-btn')) return;
        const id = e.target.dataset.id;
        const corretorNome = corretoresCache[id]?.nome || `ID desconhecido (${id})`;
        if (confirm(`Tem certeza que deseja excluir o corretor "${corretorNome}"?`)) {
            await db.collection('corretores').doc(id).delete().catch(err => console.error("Erro ao excluir corretor:", err));
            addLog('Exclusão de Corretor', `Corretor "${corretorNome}" foi excluído.`);
        }
    }

 
    async function renderCalendar() {
        calendarGrid.innerHTML = 'Carregando...';
        currentDate.setDate(1);
        const month = currentDate.getMonth(), year = currentDate.getFullYear();
        const monthName = currentDate.toLocaleString('pt-BR', { month: 'long' });
        currentMonthYearEl.textContent = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
        
        const firstDayIndex = currentDate.getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();
        
        const escalaDoMes = await getEscalaDoMes(year, month);
        const escalaDaUnidade = escalaDoMes[unidadeAtiva]?.dias || {};

        const escalaIntegrada = await getEscalasIntegradas(year, month);
        const corretoresIntegradosPorDia = {};

        let daysHtml = '';
        for (let i = 0; i < firstDayIndex; i++) { daysHtml += `<div class="calendar-day not-current-month"></div>`; }

        for (let i = 1; i <= lastDay; i++) {
            const diaData = escalaDaUnidade[i] || {};
            const diaIntegradoData = escalaIntegrada[i] || {};
            
            corretoresIntegradosPorDia[i] = [];
            
            let manhaNomes = (diaData.manha || []).map(id => corretoresCache[id]?.primeiroNome || '?').join(' > ');
            let tardeNomes = (diaData.tarde || []).map(id => corretoresCache[id]?.primeiroNome || '?').join(' > ');
            let noiteNomes = (diaData.noite || []).map(id => corretoresCache[id]?.primeiroNome || '?').join(' > ');

            ['manha', 'tarde', 'noite'].forEach(turno => {
                const nomesIntegrados = (diaIntegradoData[turno] || [])
                    .filter(p => p.unidade && p.unidade.toLowerCase() === unidadeAtiva)
                    .map(p => {
                        corretoresIntegradosPorDia[i].push(p.corretorId);
                        const plantonistasManuais = diaData[turno] || [];
                        if (!plantonistasManuais.includes(p.corretorId)) {
                             return `<span class="integrated-shift" title="Plantão: ${p.plantaoNome}">${p.corretorNome}</span>`;
                        }
                        return '';
                    }).filter(Boolean).join(' > ');
                
                if (nomesIntegrados) {
                    if (turno === 'manha') manhaNomes = manhaNomes ? `${manhaNomes} > ${nomesIntegrados}` : nomesIntegrados;
                    if (turno === 'tarde') tardeNomes = tardeNomes ? `${tardeNomes} > ${nomesIntegrados}` : nomesIntegrados;
                    if (turno === 'noite') noiteNomes = noiteNomes ? `${noiteNomes} > ${nomesIntegrados}` : nomesIntegrados;
                }
            });

            let classesDoDia = 'calendar-day';
            if (corretorFiltradoId !== 'todos') {
                const plantonistasDoDia = [...(diaData.manha || []), ...(diaData.tarde || []), ...(diaData.noite || []), ...corretoresIntegradosPorDia[i]];
                if (!plantonistasDoDia.includes(corretorFiltradoId)) {
                    classesDoDia += ' day-filtered-out';
                }
            }

            daysHtml += `<div class="${classesDoDia}" data-day="${i}">
                <div class="day-number">${i}</div>
                ${manhaNomes ? `<div class="shift-title">Manhã</div><ul class="agent-list-day"><li>${manhaNomes}</li></ul>` : ''}
                ${tardeNomes ? `<div class="shift-title">Tarde</div><ul class="agent-list-day"><li>${tardeNomes}</li></ul>` : ''}
                ${noiteNomes ? `<div class="shift-title">Noite</div><ul class="agent-list-day"><li>${noiteNomes}</li></ul>` : ''}
            </div>`;
        }
        calendarGrid.innerHTML = daysHtml;

        // Admins e Recepção podem clicar para editar a ordem
        if (userRole === 'admin' || userRole === 'recepcao') {
            document.querySelectorAll('.calendar-day[data-day]').forEach(day => day.addEventListener('click', () => openEditModal(day.dataset.day)));
        }
    }

    
    async function openEditModal(day) {
        const { month, year } = { month: currentDate.getMonth(), year: currentDate.getFullYear() };
        document.getElementById('modal-title').innerText = `Editar Plantão [${unidadeAtiva.toUpperCase()}]: ${day}/${month + 1}/${year}`;
        document.getElementById('selected-day').value = day;

        const escalaDoMes = await getEscalaDoMes(year, month);
        const escalaDaUnidade = escalaDoMes[unidadeAtiva]?.dias || {};
        const escalaIntegrada = await getEscalasIntegradas(year, month);
        const escalaIntegradaDoDia = escalaIntegrada[day] || {};
        const corretoresDaUnidade = Object.values(corretoresCache).filter(c => c.unidade.toLowerCase() === unidadeAtiva).sort((a, b) => a.nome.localeCompare(b.nome));

        ['manha', 'tarde', 'noite'].forEach(turno => {
            const listaDisponiveisEl = document.getElementById(`disponiveis-${turno}`);
            const listaEscaladosEl = document.getElementById(`escalados-${turno}`);
            listaDisponiveisEl.innerHTML = '';
            listaEscaladosEl.innerHTML = '';

            const idsSalvos = new Set(escalaDaUnidade[day]?.[turno] || []);
            const idsIntegrados = new Set(
                (escalaIntegradaDoDia[turno] || [])
                .filter(p => p.unidade && p.unidade.toLowerCase() === unidadeAtiva)
                .map(p => p.corretorId)
            );
            const todosEscaladosIds = new Set([...idsSalvos, ...idsIntegrados]);

            todosEscaladosIds.forEach(id => {
                const corretor = corretoresCache[id];
                if (corretor) {
                    const isOnlyIntegrated = idsIntegrados.has(id) && !idsSalvos.has(id);
                    const integratedMarker = isOnlyIntegrated ? ` <span class="integrated-shift" style="font-size: 0.8em; padding: 1px 4px;">Integrado</span>` : '';
                    listaEscaladosEl.innerHTML += `<li data-id="${id}">${corretor.nome}${integratedMarker}</li>`;
                }
            });

            corretoresDaUnidade.forEach(corretor => {
                if (!todosEscaladosIds.has(corretor.id)) {
                    listaDisponiveisEl.innerHTML += `<li data-id="${corretor.id}">${corretor.nome}</li>`;
                }
            });

            if (listaDisponiveisEl.sortable) listaDisponiveisEl.sortable.destroy();
            if (listaEscaladosEl.sortable) listaEscaladosEl.sortable.destroy();

            [listaDisponiveisEl, listaEscaladosEl].forEach(list => {
                Sortable.create(list, { group: `escala-${turno}`, animation: 150, ghostClass: 'dragging-item' });
            });
        });
        
        modal.querySelectorAll('.agent-list-filter').forEach(input => {
            input.value = '';
            input.addEventListener('keyup', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const list = e.target.closest('.editor-column').querySelector('.sortable-list');
                const items = list.querySelectorAll('li');
                items.forEach(item => {
                    const itemName = item.textContent.toLowerCase();
                    if (itemName.includes(searchTerm)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        });

        modal.style.display = 'block';
    }


    async function handleSaveScale(e) {
        e.preventDefault();
        const day = document.getElementById('selected-day').value;
        const { month, year } = { month: currentDate.getMonth(), year: currentDate.getFullYear() };
        const docId = `${year}-${String(month + 1).padStart(2, '0')}`;

        const escalaDoDia = {};
        const turnos = ['manha', 'tarde', 'noite'];
        turnos.forEach(turno => {
            const listaEscaladosEl = document.getElementById(`escalados-${turno}`);
            escalaDoDia[turno] = [...listaEscaladosEl.children].map(li => li.dataset.id);
        });

        const escalaAntigaDoc = await getEscalaDoMes(year, month);
        const escalaAntigaDoDia = escalaAntigaDoc[unidadeAtiva]?.dias?.[day] || {};
        
        let logDetails = '';
        const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

        turnos.forEach(turno => {
            const antigos = escalaAntigaDoDia[turno] || [];
            const novos = escalaDoDia[turno] || [];
            const adicionados = novos.filter(id => !antigos.includes(id));
            const removidos = antigos.filter(id => !novos.includes(id));
            
            // Verifica também se a ordem mudou
            const ordemMudou = antigos.length === novos.length && antigos.some((id, index) => id !== novos[index]);

            if (adicionados.length > 0 || removidos.length > 0 || ordemMudou) {
                logDetails += `Turno ${capitalize(turno)}: `;
                if (adicionados.length > 0) {
                    logDetails += `Adicionado(s): ${adicionados.map(id => corretoresCache[id]?.nome || '?').join(', ')}. `;
                }
                if (removidos.length > 0) {
                    logDetails += `Removido(s): ${removidos.map(id => corretoresCache[id]?.nome || '?').join(', ')}. `;
                }
                if (ordemMudou) {
                    logDetails += `Ordem alterada para: ${novos.map(id => corretoresCache[id]?.primeiroNome || '?').join(' > ')}. `;
                }
            }
        });

        if (logDetails === '') {
            modal.style.display = 'none';
            return; // Nenhuma alteração
        }

        try {
            await db.collection('escala').doc(docId).set({
                [unidadeAtiva]: { dias: { [day]: escalaDoDia } }
            }, { merge: true });

            addLog(`Alteração - Distribuição ${capitalize(unidadeAtiva)} - Dia ${day}/${month + 1}`, logDetails);

            modal.style.display = 'none';
            delete escalaCache[docId];
            renderCalendar();
        } catch (error) {
            console.error("Erro ao salvar o plantão: ", error);
            alert("Não foi possível salvar o plantão.");
        }
    }

    async function getEscalaDoMes(year, month) {
        const docId = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (escalaCache[docId]) return escalaCache[docId];
        try {
            const doc = await db.collection('escala').doc(docId).get();
            const escala = doc.exists ? doc.data() : { centro: { dias: {} }, campeche: { dias: {} } };
            escalaCache[docId] = escala;
            return escala;
        } catch (error) {
            console.error("Erro ao buscar escala do mês:", error);
            return { centro: { dias: {} }, campeche: { dias: {} } }; 
        }
    }
    
    async function getEscalasIntegradas(year, month) {
        const escalaIntegrada = {};
        
        try {
            const plantoesSnapshot = await db.collection('plantoes').where('integraComDistribuicao', '==', true).get();
            if (plantoesSnapshot.empty) return escalaIntegrada;
    
            const turnos = ['manha', 'tarde', 'noite']; // Definir os turnos esperados
    
            for (const plantaoDoc of plantoesSnapshot.docs) {
                const plantao = { id: plantaoDoc.id, ...plantaoDoc.data() };
                const docId = `${plantao.id}_${year}-${String(month + 1).padStart(2, '0')}`;
                
                const escalaPlantaoDoc = await db.collection('escalasPlantoes').doc(docId).get();
                
                if (escalaPlantaoDoc.exists) {
                    const escalaData = escalaPlantaoDoc.data().dias || {};
                    for (const dia in escalaData) {
                        if (!escalaIntegrada[dia]) escalaIntegrada[dia] = {};
    
                        // Iterar apenas sobre os turnos definidos, ignorando 'tipoPlantao'
                        turnos.forEach(turno => {
                            if (escalaData[dia][turno] && Array.isArray(escalaData[dia][turno])) {
                                if (!escalaIntegrada[dia][turno]) {
                                    escalaIntegrada[dia][turno] = [];
                                }
                                const corretoresInfo = escalaData[dia][turno].map(corretorId => ({
                                    corretorId: corretorId,
                                    corretorNome: corretoresCache[corretorId]?.primeiroNome || '?',
                                    plantaoNome: plantao.nome,
                                    unidade: corretoresCache[corretorId]?.unidade
                                }));
                                escalaIntegrada[dia][turno].push(...corretoresInfo);
                            }
                        });
                    }
                }
            }
        } catch(error) {
            console.error("Erro ao buscar escalas integradas:", error);
        }
    
        return escalaIntegrada;
    }

    function handleTabClick(e) {
        if (!e.target.classList.contains('tab-button')) return;
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        unidadeAtiva = e.target.dataset.unidade;
        renderCalendar();
    }

    function handleFilterChange(e) {
        corretorFiltradoId = e.target.value;
        renderCalendar();
    }

    prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
    closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target == modal) modal.style.display = 'none'; });
    tabsContainer.addEventListener('click', handleTabClick);
    agentFilterEl.addEventListener('change', handleFilterChange);
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    // Apenas admins e recepção podem salvar a escala. Apenas admins podem gerenciar corretores.
    if (userRole === 'admin' || userRole === 'recepcao') {
        editScaleForm.addEventListener('submit', handleSaveScale);
    }
    if (userRole === 'admin') {
        addAgentForm.addEventListener('submit', handleAddAgent);
        agentListEl.addEventListener('click', handleDeleteAgent);
    }

    listenForAgents();
}
