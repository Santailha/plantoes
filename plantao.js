firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userRole = userDoc.data().role;

            if (userRole === 'recepcao') {
                alert("Você não tem permissão para acessar esta página.");
                window.location.replace('distribuicao.html');
                return;
            }
            
            if (userRole === 'admin' || userRole === 'corretor' || userRole === 'corretores') {
                document.body.classList.add(`role-${userRole}`);
                document.body.style.display = 'block';
                initializeApp(user, userRole);
            } else {
                console.error("Acesso negado: o usuário não tem uma permissão válida.", userRole);
                window.location.replace('index.html');
            }
        } else {
             console.error("Acesso negado: documento de permissão não encontrado para o usuário.");
             window.location.replace('index.html');
        }
    } else {
        window.location.replace('index.html');
    }
});

function initializeApp(user, userRole) {
    let currentDate = new Date();
    let corretoresCache = {};
    let plantoesCache = [];
    let escalaCache = {};
    let activePlantaoId = null;
    let corretorFiltradoId = 'todos';
    let activeView = 'monthly';

    const plantaoSelect = document.getElementById('plantao-select');
    const createPlantaoForm = document.getElementById('create-plantao-form');
    const agentFilterEl = document.getElementById('agent-filter');
    const logoutBtn = document.getElementById('logout-btn');
    const monthlyView = document.getElementById('monthly-view');
    const dailyView = document.getElementById('daily-view');
    const weeklyView = document.getElementById('weekly-view');
    const weeklyGrid = document.getElementById('weekly-grid');
    const weeklyDateRangeEl = document.getElementById('weekly-date-range');
    const viewMonthlyBtn = document.getElementById('view-monthly-btn');
    const viewDailyBtn = document.getElementById('view-daily-btn');
    const viewWeeklyBtn = document.getElementById('view-weekly-btn');
    const calendarGrid = document.getElementById('calendar-grid');
    const monthlyNav = document.getElementById('month-navigation-calendar');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const currentMonthYearEl = document.getElementById('current-month-year');
    const dailyNav = document.querySelector('.date-navigator-daily');
    const prevDayBtn = document.getElementById('prev-day-btn');
    const nextDayBtn = document.getElementById('next-day-btn');
    const datePicker = document.getElementById('date-picker');
    const modal = document.getElementById('edit-modal');
    const closeModalBtn = modal.querySelector('.close-btn');
    const editScaleForm = document.getElementById('edit-scale-form');

    const isMobile = window.innerWidth <= 768;

    if (userRole !== 'admin') {
        if(document.querySelector('.plantao-creator')) {
            document.querySelector('.plantao-creator').style.display = 'none';
        }
        const dashboardIcon = document.getElementById('dashboard-icon');
        if (dashboardIcon) {
            dashboardIcon.style.display = 'none';
        }
        const distribuicaoLink = document.querySelector('a[href="distribuicao.html"]');
        if (distribuicaoLink) {
            distribuicaoLink.style.display = 'none';
        }
        const pageTitle = document.querySelector('.header-content h1');
        if (pageTitle) {
            pageTitle.textContent = 'Plantões';
        }
    }

    if (isMobile) {
        activeView = 'daily';
        monthlyView.style.display = 'none';
        dailyView.style.display = 'block';
        weeklyView.style.display = 'none';
        monthlyNav.style.display = 'none';
        dailyNav.style.display = 'flex';

        viewDailyBtn.classList.add('active');
        viewMonthlyBtn.classList.remove('active');
        viewWeeklyBtn.classList.remove('active');
        
        if(viewMonthlyBtn) {
            viewMonthlyBtn.style.display = 'none';
        }
    }

    async function addLog(action, details) {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        try {
            await db.collection('logs').add({
                action,
                details,
                userId: currentUser.uid,
                userEmail: currentUser.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error("Erro ao registrar log:", error);
        }
    }

    async function loadCorretores() {
        return new Promise((resolve) => {
            db.collection('corretores').orderBy('nome').onSnapshot(snapshot => {
                corretoresCache = {};
                agentFilterEl.innerHTML = '<option value="todos">Ver todos os corretores</option>';
                let loggedInCorretorId = null;
                snapshot.forEach(doc => {
                    const agent = doc.data();
                    corretoresCache[doc.id] = { id: doc.id, nome: agent.nome, primeiroNome: agent.nome.split(' ')[0], unidade: agent.unidade, email: agent.email };
                    agentFilterEl.innerHTML += `<option value="${doc.id}">${agent.nome}</option>`;
                    if ((userRole === 'corretor' || userRole === 'corretores') && agent.email === user.email) {
                        loggedInCorretorId = doc.id;
                    }
                });
                if ((userRole === 'corretor' || userRole === 'corretores') && loggedInCorretorId) {
                    agentFilterEl.value = loggedInCorretorId;
                    corretorFiltradoId = loggedInCorretorId;
                } else {
                    agentFilterEl.value = corretorFiltradoId;
                }
                resolve();
            });
        });
    }

    async function loadPlantoes() {
        return new Promise((resolve) => {
            db.collection('plantoes').onSnapshot(snapshot => {
                let plantoesTemporarios = [];
                if (snapshot.empty) {
                    plantoesCache = [];
                    plantaoSelect.innerHTML = '<option value="">Nenhum plantão criado</option>';
                    activePlantaoId = null;
                    render();
                    resolve();
                    return;
                }

                snapshot.forEach(doc => {
                    plantoesTemporarios.push({ id: doc.id, ...doc.data() });
                });

                plantoesTemporarios.sort((a, b) => {
                    const ordemA = a.hasOwnProperty('ordem') ? Number(a.ordem) : Infinity;
                    const ordemB = b.hasOwnProperty('ordem') ? Number(b.ordem) : Infinity;
                    if (ordemA !== ordemB) {
                        return ordemA - ordemB;
                    }
                    return a.nome.localeCompare(b.nome);
                });

                plantoesCache = plantoesTemporarios;
                plantaoSelect.innerHTML = '';

                plantoesCache.forEach(plantao => {
                    plantaoSelect.innerHTML += `<option value="${plantao.id}">${plantao.nome}</option>`;
                });

                if (!activePlantaoId || !plantoesCache.find(p => p.id === activePlantaoId)) {
                    activePlantaoId = plantoesCache[0]?.id || null;
                }
                
                if (activePlantaoId) {
                    plantaoSelect.value = activePlantaoId;
                }

                render();
                resolve();
            });
        });
    }

    function render() {
        updateCurrentDateDisplay();
        if (activeView === 'monthly') {
            renderMonthlyCalendar();
        } else if (activeView === 'daily') {
            renderDailyView();
        } else {
            renderWeeklyView();
        }
    }

    async function renderMonthlyCalendar() {
        if (!activePlantaoId) {
            calendarGrid.innerHTML = '<div style="grid-column: span 7; text-align: center; padding: 2rem;">Selecione um plantão para começar.</div>';
            return;
        }
        calendarGrid.innerHTML = 'Carregando...';
        currentDate.setDate(1);
        const month = currentDate.getMonth(), year = currentDate.getFullYear();
        const firstDayIndex = currentDate.getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const escalaDoMes = await getEscalaDoMes(activePlantaoId, year, month);
        const diasEscalados = escalaDoMes.dias || {};
        let daysHtml = '';
        for (let i = 0; i < firstDayIndex; i++) { daysHtml += `<div class="calendar-day not-current-month"></div>`; }
        
        const mapNomesComDestaque = (ids) => {
            return (ids || []).map(id => {
                const nome = corretoresCache[id]?.primeiroNome || '?';
                if (corretorFiltradoId !== 'todos' && corretorFiltradoId === id) {
                    return `<span class="highlight-agent">${nome}</span>`;
                }
                return nome;
            }).join(' > ');
        };

        for (let i = 1; i <= lastDay; i++) {
            const diaData = diasEscalados[i] || {};
            const manhaNomes = mapNomesComDestaque(diaData.manha);
            const tardeNomes = mapNomesComDestaque(diaData.tarde);
            const noiteNomes = mapNomesComDestaque(diaData.noite);
            
            let classesDoDia = 'calendar-day';
            if (corretorFiltradoId !== 'todos') {
                const plantonistas = [...(diaData.manha || []), ...(diaData.tarde || []), ...(diaData.noite || [])];
                if (!plantonistas.includes(corretorFiltradoId)) {
                    classesDoDia += ' day-filtered-out';
                }
            }

            if (diaData.tipoPlantao === 'nosso') {
                classesDoDia += ' plantao-nosso';
            } else if (diaData.tipoPlantao === 'outra') {
                classesDoDia += ' plantao-outra';
            }

            daysHtml += `<div class="${classesDoDia}" data-day="${i}">
                <div class="day-number">${i}</div>
                ${manhaNomes ? `<div class="shift-title">Manhã</div><ul class="agent-list-day"><li>${manhaNomes}</li></ul>` : ''}
                ${tardeNomes ? `<div class="shift-title">Tarde</div><ul class="agent-list-day"><li>${tardeNomes}</li></ul>` : ''}
                ${noiteNomes ? `<div class="shift-title">Noite</div><ul class="agent-list-day"><li>${noiteNomes}</li></ul>` : ''}
            </div>`;
        }
        calendarGrid.innerHTML = daysHtml;
        if (userRole === 'admin') {
            calendarGrid.querySelectorAll('.calendar-day[data-day]').forEach(day =>
                day.addEventListener('click', () => openEditModal(day.dataset.day))
            );
        }
    }

    async function renderWeeklyView() {
        weeklyGrid.innerHTML = 'Carregando...';
        const weekDates = getWeekDates(currentDate);
        
        const firstDay = weekDates[0];
        const lastDay = weekDates[6];
        weeklyDateRangeEl.textContent = `Semana de ${firstDay.toLocaleDateString()} a ${lastDay.toLocaleDateString()}`;

        let weeklyHtml = '';
        
        const mapNomesComDestaque = (ids) => {
            return (ids || []).map(id => {
                const nome = corretoresCache[id]?.nome || '?';
                if (corretorFiltradoId !== 'todos' && corretorFiltradoId === id) {
                    return `<span class="highlight-agent">${nome}</span>`;
                }
                return nome;
            }).join(', ');
        };

        for (const date of weekDates) {
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();
            const dayName = date.toLocaleDateString('pt-BR', { weekday: 'long' });

            const promises = plantoesCache.map(plantao => getEscalaDoMes(plantao.id, year, month));
            const escalas = await Promise.all(promises);
            
            let plantoesHtml = '';
            let allPlantonistasDoDia = [];

            plantoesCache.forEach((plantao, index) => {
                const escalaPlantao = escalas[index] || { dias: {} };
                const diaData = escalaPlantao.dias?.[day] || {};
                const manhaIds = (diaData.manha || []);
                const tardeIds = (diaData.tarde || []);
                const noiteIds = (diaData.noite || []);

                allPlantonistasDoDia.push(...manhaIds, ...tardeIds, ...noiteIds);

                const manhaNomes = mapNomesComDestaque(manhaIds);
                const tardeNomes = mapNomesComDestaque(tardeIds);
                const noiteNomes = mapNomesComDestaque(noiteIds);

                if (manhaNomes || tardeNomes || noiteNomes) {
                    plantoesHtml += `
                        <div class="weekly-plantao">
                            <div class="weekly-plantao-nome">${plantao.nome}</div>
                            ${manhaNomes ? `<div class="weekly-shift"><strong>Manhã:</strong> <span class="weekly-shift-agents">${manhaNomes}</span></div>` : ''}
                            ${tardeNomes ? `<div class="weekly-shift"><strong>Tarde:</strong> <span class="weekly-shift-agents">${tardeNomes}</span></div>` : ''}
                            ${noiteNomes ? `<div class="weekly-shift"><strong>Noite:</strong> <span class="weekly-shift-agents">${noiteNomes}</span></div>` : ''}
                        </div>
                    `;
                }
            });

            let cardClasses = 'weekly-day-card';
             if (corretorFiltradoId !== 'todos' && !allPlantonistasDoDia.includes(corretorFiltradoId)) {
                cardClasses += ' day-filtered-out';
            }

            weeklyHtml += `
                <div class="${cardClasses}">
                    <div class="card-header">
                        <span class="day-name">${dayName}</span>
                        <span class="date">${date.toLocaleDateString()}</span>
                    </div>
                    <div class="card-content">
                        ${plantoesHtml || '<p style="color: #888; font-style: italic;">Nenhum plantão neste dia.</p>'}
                    </div>
                </div>
            `;
        }

        weeklyGrid.innerHTML = weeklyHtml;
    }

    function getWeekDates(date) {
        const week = [];
        const firstDayOfWeek = date.getDate() - date.getDay();
        for (let i = 0; i < 7; i++) {
            week.push(new Date(date.getFullYear(), date.getMonth(), firstDayOfWeek + i));
        }
        return week;
    }

    async function renderDailyView() {
        dailyView.innerHTML = 'Carregando...';
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const day = currentDate.getDate();
        
        const promises = plantoesCache.map(plantao => getEscalaDoMes(plantao.id, year, month));
        const escalas = await Promise.all(promises);
        let dailyHtml = '';
        if (plantoesCache.length === 0) {
            dailyView.innerHTML = '<div style="text-align: center; padding: 2rem;">Nenhum plantão criado.</div>';
            return;
        }

        const mapNomesComDestaque = (ids) => {
            const nomes = (ids || []).map(id => {
                const nome = corretoresCache[id]?.nome || '?';
                if (corretorFiltradoId !== 'todos' && corretorFiltradoId === id) {
                    return `<span class="highlight-agent">${nome}</span>`;
                }
                return nome;
            }).join(', ');
            return nomes || 'Ninguém';
        };

        plantoesCache.forEach((plantao, index) => {
            const escalaPlantao = escalas[index] || { dias: {} };
            const diaData = escalaPlantao.dias?.[day] || {};
            const manhaNomes = mapNomesComDestaque(diaData.manha);
            const tardeNomes = mapNomesComDestaque(diaData.tarde);
            const noiteNomes = mapNomesComDestaque(diaData.noite);

            let classesPlantao = 'daily-plantao-card';
            if (corretorFiltradoId !== 'todos') {
                const plantonistas = [...(diaData.manha || []), ...(diaData.tarde || []), ...(diaData.noite || [])];
                if (!plantonistas.includes(corretorFiltradoId)) {
                    classesPlantao += ' day-filtered-out';
                }
            }
            
            const isFirst = index === 0;
            const isLast = index === plantoesCache.length - 1;
            const orderControls = userRole === 'admin' ? `
                <div class="order-controls">
                    <button class="reorder-btn" data-id="${plantao.id}" data-direction="up" ${isFirst ? 'disabled' : ''}>▲</button>
                    <button class="reorder-btn" data-id="${plantao.id}" data-direction="down" ${isLast ? 'disabled' : ''}>▼</button>
                </div>
            ` : '';

            dailyHtml += `
                <div class="${classesPlantao}" data-plantao-id="${plantao.id}">
                    <h3>
                        <span>${plantao.nome}</span>
                        ${orderControls}
                    </h3>
                    <div class="daily-shift"><strong>Manhã:</strong> ${manhaNomes}</div>
                    <div class="daily-shift"><strong>Tarde:</strong> ${tardeNomes}</div>
                    <div class="daily-shift"><strong>Noite:</strong> ${noiteNomes}</div>
                </div>
            `;
        });
        dailyView.innerHTML = dailyHtml;

        if (userRole === 'admin') {
            document.querySelectorAll('.reorder-btn').forEach(button => {
                button.addEventListener('click', handleReorder);
            });
        }
    }
    
    async function handleReorder(event) {
        const plantaoId = event.currentTarget.dataset.id;
        const direction = event.currentTarget.dataset.direction;
        const index = plantoesCache.findIndex(p => p.id === plantaoId);

        if (index === -1) return;

        if (direction === 'up' && index > 0) {
            [plantoesCache[index], plantoesCache[index - 1]] = [plantoesCache[index - 1], plantoesCache[index]];
        } else if (direction === 'down' && index < plantoesCache.length - 1) {
            [plantoesCache[index], plantoesCache[index + 1]] = [plantoesCache[index + 1], plantoesCache[index]];
        } else {
            return;
        }
        
        const batch = db.batch();
        const plantoesNomes = [];
        plantoesCache.forEach((plantao, newIndex) => {
            const plantaoRef = db.collection('plantoes').doc(plantao.id);
            batch.update(plantaoRef, { ordem: newIndex });
            plantoesNomes.push(plantao.nome);
        });

        try {
            await batch.commit();
            addLog('Reordenação de Plantões', `Nova ordem: ${plantoesNomes.join(', ')}`);
        } catch (error) {
            console.error("Erro ao salvar a nova ordem:", error);
            alert("Não foi possível salvar a nova ordem. Tente novamente.");
            loadPlantoes();
        }
    }

    async function getEscalaDoMes(plantaoId, year, month) {
        const docId = `${plantaoId}_${year}-${String(month + 1).padStart(2, '0')}`;
        if (escalaCache[docId]) return escalaCache[docId];
        try {
            const doc = await db.collection('escalasPlantoes').doc(docId).get();
            const escala = doc.exists ? doc.data() : { dias: {} };
            escalaCache[docId] = escala;
            return escala;
        } catch (error) {
            console.error("Erro ao buscar escala:", error);
            return { dias: {} };
        }
    }

    async function openEditModal(day) {
        const plantaoAtual = plantoesCache.find(p => p.id === activePlantaoId);
        if (!plantaoAtual) return;
        const { month, year } = { month: currentDate.getMonth(), year: currentDate.getFullYear() };
        modal.querySelector('#modal-title').innerText = `Editar ${plantaoAtual.nome}: ${day}/${month + 1}/${year}`;
        modal.querySelector('#selected-day').value = day;

        const escalaDoMes = await getEscalaDoMes(activePlantaoId, year, month);
        const escalaDoDia = escalaDoMes.dias?.[day] || {};

        const tipoPlantao = escalaDoDia.tipoPlantao || 'nenhum';
        const radioToCheck = modal.querySelector(`input[name="tipoPlantao"][value="${tipoPlantao}"]`);
        if (radioToCheck) {
            radioToCheck.checked = true;
        }

        const otherPlantoes = plantoesCache.filter(p => p.id !== activePlantaoId);
        const conflictingAgents = { manha: new Set(), tarde: new Set(), noite: new Set() };
        for (const otherPlantao of otherPlantoes) {
            const otherEscala = await getEscalaDoMes(otherPlantao.id, year, month);
            const otherDiaData = otherEscala.dias?.[day];
            if (otherDiaData) {
                (otherDiaData.manha || []).forEach(agentId => conflictingAgents.manha.add(agentId));
                (otherDiaData.tarde || []).forEach(agentId => conflictingAgents.tarde.add(agentId));
                (otherDiaData.noite || []).forEach(agentId => conflictingAgents.noite.add(agentId));
            }
        }

        const turnos = ['manha', 'tarde', 'noite'];
        turnos.forEach(turno => {
            const escaladosIds = new Set(escalaDoDia[turno] || []);
            const listaDisponiveisEl = modal.querySelector(`#disponiveis-${turno}`);
            const listaEscaladosEl = modal.querySelector(`#escalados-${turno}`);
            listaDisponiveisEl.innerHTML = '';
            listaEscaladosEl.innerHTML = '';
            (escalaDoDia[turno] || []).forEach(id => {
                if(corretoresCache[id]) listaEscaladosEl.innerHTML += `<li data-id="${id}">${corretoresCache[id].nome}</li>`;
            });
            Object.values(corretoresCache).forEach(corretor => {
                if (!escaladosIds.has(corretor.id)) {
                    const hasConflict = conflictingAgents[turno].has(corretor.id);
                    const liClass = hasConflict ? 'class="unavailable"' : '';
                    const liTitle = hasConflict ? 'title="Corretor já escalado em outro plantão neste período!"' : '';
                    const warningSymbol = hasConflict ? '⚠️ ' : '';
                    listaDisponiveisEl.innerHTML += `<li data-id="${corretor.id}" ${liClass} ${liTitle}>${warningSymbol}${corretor.nome}</li>`;
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
        const day = modal.querySelector('#selected-day').value;
        const { month, year } = { month: currentDate.getMonth(), year: currentDate.getFullYear() };
        const turnos = ['manha', 'tarde', 'noite'];
    
        const escalaAntigaDoc = await getEscalaDoMes(activePlantaoId, year, month);
        const escalaAntigaDoDia = escalaAntigaDoc.dias?.[day] || {};
    
        const updatePayload = {};
        const proposedChanges = {};
    
        turnos.forEach(turno => {
            const listaEscaladosEl = modal.querySelector(`#escalados-${turno}`);
            const escalados = [...listaEscaladosEl.children].map(li => li.dataset.id);
            updatePayload[`dias.${day}.${turno}`] = escalados;
            proposedChanges[turno] = escalados;
        });
    
        const tipoPlantaoSelecionado = modal.querySelector('input[name="tipoPlantao"]:checked').value;
        if (tipoPlantaoSelecionado === 'nenhum') {
            updatePayload[`dias.${day}.tipoPlantao`] = firebase.firestore.FieldValue.delete();
        } else {
            updatePayload[`dias.${day}.tipoPlantao`] = tipoPlantaoSelecionado;
        }
        proposedChanges.tipoPlantao = tipoPlantaoSelecionado;
    
        let logDetails = '';
        const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
        turnos.forEach(turno => {
            const antigos = escalaAntigaDoDia[turno] || [];
            const novos = proposedChanges[turno] || [];
            const adicionados = novos.filter(id => !antigos.includes(id));
            const removidos = antigos.filter(id => !novos.includes(id));
            
            if (adicionados.length > 0 || removidos.length > 0) {
                logDetails += `Turno ${capitalize(turno)}: `;
                if (adicionados.length > 0) logDetails += `Adicionado(s): ${adicionados.map(id => corretoresCache[id]?.nome || '?').join(', ')}. `;
                if (removidos.length > 0) logDetails += `Removido(s): ${removidos.map(id => corretoresCache[id]?.nome || '?').join(', ')}. `;
            }
        });
        const tipoAntigo = escalaAntigaDoDia.tipoPlantao || 'nenhum';
        const tipoNovo = proposedChanges.tipoPlantao || 'nenhum';
        if (tipoAntigo !== tipoNovo) {
            logDetails += `Tipo de plantão alterado de "${tipoAntigo}" para "${tipoNovo}".`;
        }
    
        if (logDetails === '') {
            modal.style.display = 'none';
            return;
        }
    
        const docId = `${activePlantaoId}_${year}-${String(month + 1).padStart(2, '0')}`;
        const docRef = db.collection('escalasPlantoes').doc(docId);
    
        try {
            const doc = await docRef.get();
            if (doc.exists) {
                await docRef.update(updatePayload);
            } else {
                const createPayload = {
                    plantaoId: activePlantaoId,
                    dias: {
                        [day]: {
                            manha: updatePayload[`dias.${day}.manha`],
                            tarde: updatePayload[`dias.${day}.tarde`],
                            noite: updatePayload[`dias.${day}.noite`],
                        }
                    }
                };
                if (tipoPlantaoSelecionado !== 'nenhum') {
                    createPayload.dias[day].tipoPlantao = tipoPlantaoSelecionado;
                }
                await docRef.set(createPayload);
            }
    
            const plantaoNome = plantoesCache.find(p => p.id === activePlantaoId)?.nome || `ID ${activePlantaoId}`;
            addLog(`Alteração - ${plantaoNome} - Dia ${day}/${month + 1}`, logDetails);
    
            modal.style.display = 'none';
            delete escalaCache[docId];
            render();
        } catch (error) {
            console.error("Erro ao salvar o plantão: ", error);
            alert("Não foi possível salvar a escala.");
        }
    }

    function updateCurrentDateDisplay() {
        const monthName = currentDate.toLocaleString('pt-BR', { month: 'long' });
        const year = currentDate.getFullYear();
        if (currentMonthYearEl) {
            currentMonthYearEl.textContent = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
        }
        if(datePicker) {
            const dayStr = String(currentDate.getDate()).padStart(2, '0');
            const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
            datePicker.value = `${year}-${monthStr}-${dayStr}`;
        }
    }

    if (userRole === 'admin' && createPlantaoForm) {
        createPlantaoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('new-plantao-name').value.trim();
            const integraCheckbox = document.getElementById('integra-plantao-checkbox');
            if (nome) {
                try {
                    // O novo plantão recebe a próxima ordem disponível
                    const ordem = plantoesCache.length;
                    
                    await db.collection('plantoes').add({
                        nome,
                        ordem, // A nova ordem é salva no banco
                        integraComDistribuicao: integraCheckbox.checked,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    addLog('Criação de Plantão', `Novo plantão "${nome}" criado.`);

                    createPlantaoForm.reset();

                } catch (error) {
                    console.error("Erro ao criar plantão:", error);
                    alert("Não foi possível criar o plantão.");
                }
            }
        });
    }

    if (plantaoSelect) {
        plantaoSelect.addEventListener('change', (e) => {
            activePlantaoId = e.target.value;
            render();
        });
    }
    
    if (agentFilterEl) {
        agentFilterEl.addEventListener('change', (e) => {
            corretorFiltradoId = e.target.value;
            render();
        });
    }

    if (viewMonthlyBtn) {
        viewMonthlyBtn.addEventListener('click', () => {
            activeView = 'monthly';
            monthlyView.style.display = 'block';
            dailyView.style.display = 'none';
            weeklyView.style.display = 'none';
            monthlyNav.style.display = 'flex';
            dailyNav.style.display = 'none';
            viewMonthlyBtn.classList.add('active');
            viewDailyBtn.classList.remove('active');
            viewWeeklyBtn.classList.remove('active');
            render();
        });
    }
    
    if (viewWeeklyBtn) {
        viewWeeklyBtn.addEventListener('click', () => {
            currentDate = new Date();
            activeView = 'weekly';
            monthlyView.style.display = 'none';
            dailyView.style.display = 'none';
            weeklyView.style.display = 'block';
            monthlyNav.style.display = 'none';
            dailyNav.style.display = 'flex';
            viewMonthlyBtn.classList.remove('active');
            viewDailyBtn.classList.remove('active');
            viewWeeklyBtn.classList.add('active');
            render();
        });
    }

    if (viewDailyBtn) {
        viewDailyBtn.addEventListener('click', () => {
            currentDate = new Date(); 
            activeView = 'daily';
            monthlyView.style.display = 'none';
            dailyView.style.display = 'block';
            weeklyView.style.display = 'none';
            monthlyNav.style.display = 'none';
            dailyNav.style.display = 'flex';
            viewDailyBtn.classList.add('active');
            viewMonthlyBtn.classList.remove('active');
            viewWeeklyBtn.classList.remove('active');
            render();
        });
    }

    if(datePicker) {
        datePicker.addEventListener('change', (e) => {
            const [year, month, day] = e.target.value.split('-').map(Number);
            currentDate = new Date(year, month - 1, day);
            render();
        });
    }
    
    if(prevMonthBtn) prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); render(); });
    if(nextMonthBtn) nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); render(); });
    if(prevDayBtn) prevDayBtn.addEventListener('click', () => { currentDate.setDate(currentDate.getDate() - 1); render(); });
    if(nextDayBtn) nextDayBtn.addEventListener('click', () => { currentDate.setDate(currentDate.getDate() + 1); render(); });
    
    if(closeModalBtn) closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target == modal) modal.style.display = 'none'; });
    
    if (userRole === 'admin' && editScaleForm) {
        editScaleForm.addEventListener('submit', handleSaveScale);
    }

    if(logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

    async function start() {
        await loadCorretores();
        await loadPlantoes();
    }
    start();
}
