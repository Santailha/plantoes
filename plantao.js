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
       //... (código sem alterações)
    }

    async function renderWeeklyView() {
        //... (código sem alterações)
    }

    function getWeekDates(date) {
        //... (código sem alterações)
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
            const escalaPlantao = escalas[index];
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
            
            // Adiciona as setas de ordenação
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

        // Adiciona os event listeners para os botões de reordenar
        if (userRole === 'admin') {
            document.querySelectorAll('.reorder-btn').forEach(button => {
                button.addEventListener('click', handleReorder);
            });
        }
    }
    
    function handleReorder(event) {
        const plantaoId = event.currentTarget.dataset.id;
        const direction = event.currentTarget.dataset.direction;
        const index = plantoesCache.findIndex(p => p.id === plantaoId);

        if (index === -1) return;

        if (direction === 'up' && index > 0) {
            // Troca com o elemento anterior
            [plantoesCache[index], plantoesCache[index - 1]] = [plantoesCache[index - 1], plantoesCache[index]];
        } else if (direction === 'down' && index < plantoesCache.length - 1) {
            // Troca com o elemento seguinte
            [plantoesCache[index], plantoesCache[index + 1]] = [plantoesCache[index + 1], plantoesCache[index]];
        }
        
        // Re-renderiza a view com a nova ordem
        renderDailyView();
    }


    async function getEscalaDoMes(plantaoId, year, month) {
        //... (código sem alterações)
    }

    async function openEditModal(day) {
        //... (código sem alterações)
    }
    
    async function handleSaveScale(e) {
        //... (código sem alterações)
    }

    function updateCurrentDateDisplay() {
        //... (código sem alterações)
    }

    //... (Restante do seu código sem alterações)
    
    if (userRole === 'admin' && createPlantaoForm) {
        createPlantaoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('new-plantao-name').value.trim();
            const ordemInput = document.getElementById('new-plantao-ordem').value;
            const ordem = ordemInput ? parseInt(ordemInput, 10) : 99; // Default order if empty
            const integraCheckbox = document.getElementById('integra-plantao-checkbox');
            if (nome) {
                try {
                    await db.collection('plantoes').add({
                        nome,
                        ordem,
                        integraComDistribuicao: integraCheckbox.checked,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    addLog('Criação de Plantão', `Novo plantão "${nome}" criado com ordem ${ordem}.`);

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
