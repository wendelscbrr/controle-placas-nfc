// public/js/app.js
// Controlador principal da aplicação frontend (Gestão NFC Pro)
// Código didático, modular e estruturado para fácil compreensão e aprendizado.

// =============================================================================
// ESTADO GLOBAL DA APLICAÇÃO (Single Source of Truth)
// =============================================================================
const state = {
  currentTab: 'dashboard',
  currentPeriod: 'all',
  customStartDate: '',
  customEndDate: '',
  reportGroup: 'month',
  models: [],
  sellers: [],
  sales: [],
  expenses: [],
  notes: []
};

// =============================================================================
// FORMATADORES E UTILITÁRIOS
// =============================================================================

/**
 * Formata um número para o padrão monetário brasileiro (Ex: 1250.5 -> "R$ 1.250,50")
 */
function formatBRL(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata datas ISO (YYYY-MM-DD) para exibição amigável (DD/MM/AAAA)
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Exibe mensagens toast temporárias para dar feedback visual das ações do usuário
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Remove automaticamente após 3.5 segundos
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// =============================================================================
// GERENCIADOR DE MODAIS
// =============================================================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    // Preenche a data de hoje por padrão em formulários de registro
    const dateInput = modal.querySelector('input[type="date"]');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    if (modalId === 'modal-sale') {
      updateSaleDateStatusHint();
      syncModelsAndSellers();
    }
  }
}

function resetSaleModalForNew() {
  const titleEl = document.getElementById('modal-sale-title');
  if (titleEl) titleEl.textContent = 'Registrar Nova Venda';
  const idInput = document.getElementById('sale-id');
  if (idInput) idInput.value = '';
  const form = document.getElementById('form-sale');
  if (form) form.reset();
  const dateInput = document.getElementById('sale-date');
  if (dateInput) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    dateInput.value = today;
  }
  const statusSelect = document.getElementById('sale-status');
  if (statusSelect) statusSelect.value = 'auto';
  const btnSubmit = document.getElementById('btn-submit-sale');
  if (btnSubmit) btnSubmit.textContent = 'Salvar Venda';
  const saleCalcHint = document.getElementById('sale-calc-total');
  if (saleCalcHint) saleCalcHint.textContent = 'Total Calculado: R$ 0,00';
  updateSaleDateStatusHint();
}

function resetExpenseModalForNew() {
  const titleEl = document.getElementById('modal-expense-title');
  if (titleEl) titleEl.textContent = 'Cadastrar Gasto / Material';
  const idInput = document.getElementById('expense-id');
  if (idInput) idInput.value = '';
  const form = document.getElementById('form-expense');
  if (form) form.reset();
  const dateInput = document.getElementById('expense-date');
  if (dateInput) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    dateInput.value = today;
  }
  const btnSubmit = document.getElementById('btn-submit-expense');
  if (btnSubmit) btnSubmit.textContent = 'Salvar Gasto';
  const expenseCalcHint = document.getElementById('expense-calc-total');
  if (expenseCalcHint) expenseCalcHint.textContent = 'Total Calculado: R$ 0,00';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    const form = modal.querySelector('form');
    if (form) form.reset();
    if (modalId === 'modal-sale') {
      resetSaleModalForNew();
    }
    if (modalId === 'modal-expense') {
      resetExpenseModalForNew();
    }
  }
}

// Configura eventos de fechamento para todos os modais
function setupModalListeners() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  // Fechar ao clicar fora do card (no overlay)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // Gatilhos de abertura
  document.getElementById('btn-open-modal-sale')?.addEventListener('click', () => {
    resetSaleModalForNew();
    openModal('modal-sale');
  });
  document.getElementById('btn-new-sale-dash')?.addEventListener('click', () => {
    resetSaleModalForNew();
    openModal('modal-sale');
  });
  document.getElementById('btn-quick-sale-mobile')?.addEventListener('click', () => {
    resetSaleModalForNew();
    openModal('modal-sale');
  });
  document.getElementById('btn-open-modal-expense')?.addEventListener('click', () => {
    resetExpenseModalForNew();
    openModal('modal-expense');
  });
  document.getElementById('btn-open-modal-model')?.addEventListener('click', () => {
    document.getElementById('modal-model-title').textContent = 'Cadastrar Novo Modelo de Placa';
    document.getElementById('model-id').value = '';
    openModal('modal-model');
  });
  document.getElementById('btn-open-modal-seller')?.addEventListener('click', () => openModal('modal-seller'));
  document.getElementById('btn-open-modal-note')?.addEventListener('click', () => {
    document.getElementById('modal-note-title').textContent = 'Nova Anotação';
    document.getElementById('note-id').value = '';
    document.getElementById('form-note')?.reset();
    openModal('modal-note');
  });

  // Gatilhos de sincronização com o SQLite Cloud
  const handleCloudSync = async () => {
    showToast('☁️ Conectando e sincronizando com o SQLite Cloud...', 'success');
    try {
      const res = await API.syncCloud();
      if (res.active) {
        showToast('✓ Sincronização concluída com sucesso!');
        await syncModelsAndSellers();
        if (state.currentTab === 'dashboard') loadDashboard();
        if (state.currentTab === 'vendas') loadSales();
        if (state.currentTab === 'gastos') loadExpenses();
        if (state.currentTab === 'modelos') loadModels();
        if (state.currentTab === 'socios') loadSellers();
        if (state.currentTab === 'relatorios') loadReports();
        if (state.currentTab === 'anotacoes') loadNotes();
      } else {
        showToast(res.message || 'SQLite Cloud não configurado.', 'error');
      }
    } catch (err) {
      showToast('Erro ao sincronizar com a nuvem: ' + err.message, 'error');
    }
  };

  document.getElementById('btn-sync-cloud')?.addEventListener('click', handleCloudSync);
  document.getElementById('btn-sync-cloud-mobile')?.addEventListener('click', handleCloudSync);
}

// =============================================================================
// GERENCIADOR DE NAVEGAÇÃO POR ABAS
// =============================================================================
function setupNavigation() {
  const navButtons = document.querySelectorAll('[data-tab]');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;

  // Atualiza botões ativos na barra lateral e inferior
  document.querySelectorAll('[data-tab]').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('active', isTarget);
    if (isTarget) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  // Alterna as seções visíveis
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.toggle('active', section.id === `tab-${tabId}`);
  });

  // Atualiza os dados da aba que foi aberta
  loadDataForTab(tabId);
}

function loadDataForTab(tabId) {
  switch (tabId) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'vendas':
      loadSales();
      break;
    case 'gastos':
      loadExpenses();
      break;
    case 'modelos':
      loadModels();
      break;
    case 'socios':
      loadSellers();
      break;
    case 'relatorios':
      loadReports();
      break;
    case 'anotacoes':
      loadNotes();
      break;
  }
}

// =============================================================================
// CARREGAMENTO E SINCRONIZAÇÃO DE MODELOS E SÓCIOS
// =============================================================================
async function syncModelsAndSellers() {
  const modelSelect = document.getElementById('sale-model');
  const sellerSelect = document.getElementById('sale-seller');
  const filterSellerSelect = document.getElementById('filter-sales-seller');
  const noteAuthorSelect = document.getElementById('note-author');

  function renderSelectOptions(models, sellers) {
    if (modelSelect && Array.isArray(models)) {
      const currentModel = modelSelect.value;
      const activeModels = models.filter(m => m.is_active == 1 || m.is_active === true || m.is_active === undefined);
      modelSelect.innerHTML = '<option value="">Selecione o modelo...</option>' + 
        activeModels.map(m => `<option value="${m.id}">${m.name} - ${formatBRL(m.base_price)}</option>`).join('');
      if (currentModel) modelSelect.value = currentModel;
    }

    if (sellerSelect && Array.isArray(sellers)) {
      const currentSeller = sellerSelect.value;
      const activeSellers = sellers.filter(s => s.is_active == 1 || s.is_active === true || s.is_active === undefined);
      sellerSelect.innerHTML = '<option value="">Selecione quem vendeu...</option>' + 
        activeSellers.map(s => `<option value="${s.id}">${s.name} (${s.role || 'Sócio'})</option>`).join('');
      if (currentSeller) sellerSelect.value = currentSeller;
    }

    if (filterSellerSelect && Array.isArray(sellers)) {
      const currentFilter = filterSellerSelect.value;
      filterSellerSelect.innerHTML = '<option value="all">Todos os Vendedores</option>' + 
        sellers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      if (currentFilter) filterSellerSelect.value = currentFilter;
    }

    if (noteAuthorSelect && Array.isArray(sellers)) {
      const currentAuthor = noteAuthorSelect.value;
      noteAuthorSelect.innerHTML = '<option value="Geral">Geral</option>' + 
        sellers.filter(s => s.is_active == 1 || s.is_active === true || s.is_active === undefined).map(s => `<option value="${s.name}">${s.name}</option>`).join('');
      if (currentAuthor) noteAuthorSelect.value = currentAuthor;
    }
  }

  // 1. Se já tiver dados em cache no estado, renderiza de imediato
  if (state.models?.length || state.sellers?.length) {
    renderSelectOptions(state.models, state.sellers);
  }

  // 2. Busca dados frescos da API
  try {
    const [models, sellers] = await Promise.all([
      API.getModels(true),
      API.getSellers(true)
    ]);

    state.models = models;
    state.sellers = sellers;

    renderSelectOptions(models, sellers);
  } catch (error) {
    console.error('Erro ao sincronizar cadastros:', error);
  }
}

// Preenchimento automático do preço ao selecionar o modelo na venda
function setupFormCalculations() {
  const modelSelect = document.getElementById('sale-model');
  const priceInput = document.getElementById('sale-price');
  const qtyInput = document.getElementById('sale-quantity');
  const saleCalcHint = document.getElementById('sale-calc-total');

  function updateSaleTotal() {
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const total = qty * price;
    saleCalcHint.textContent = `Total Calculado: ${formatBRL(total)} (${qty} placa${qty > 1 ? 's' : ''})`;
  }

  modelSelect?.addEventListener('change', () => {
    const selectedModelId = parseInt(modelSelect.value, 10);
    const model = state.models?.find(m => Number(m.id) === selectedModelId);
    if (model) {
      priceInput.value = Number(model.base_price).toFixed(2);
      updateSaleTotal();
    }
  });

  qtyInput?.addEventListener('input', updateSaleTotal);
  priceInput?.addEventListener('input', updateSaleTotal);

  // Cálculo automático no formulário de Gastos / Insumos
  const expenseQty = document.getElementById('expense-qty');
  const expenseUnitCost = document.getElementById('expense-unit-cost');
  const expenseCalcHint = document.getElementById('expense-calc-total');

  function updateExpenseTotal() {
    const qty = parseFloat(expenseQty.value) || 0;
    const unitCost = parseFloat(expenseUnitCost.value) || 0;
    const total = qty * unitCost;
    expenseCalcHint.textContent = `Total Calculado: ${formatBRL(total)}`;
  }

  expenseQty?.addEventListener('input', updateExpenseTotal);
  expenseUnitCost?.addEventListener('input', updateExpenseTotal);
}

// =============================================================================
// MÓDULO: DASHBOARD PRINCIPAL
// =============================================================================
async function loadDashboard() {
  try {
    const data = await API.getDashboard(state.currentPeriod, state.customStartDate, state.customEndDate);
    const kpis = data.kpis;

    // Atualiza cards de KPIs
    document.getElementById('kpi-revenue').textContent = formatBRL(kpis.total_revenue);
    document.getElementById('kpi-sales-count').textContent = `${kpis.sales_count} venda${kpis.sales_count !== 1 ? 's' : ''}`;
    
    document.getElementById('kpi-plaques-sold').textContent = kpis.plaques_sold;
    document.getElementById('kpi-ticket-unit').textContent = formatBRL(kpis.average_ticket_unit);
    
    document.getElementById('kpi-expenses').textContent = formatBRL(kpis.total_expenses);

    const profitEl = document.getElementById('kpi-profit');
    profitEl.textContent = formatBRL(kpis.net_profit);
    profitEl.className = `kpi-value ${kpis.net_profit >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('kpi-margin').textContent = `Margem de Lucro: ${kpis.profit_margin}%`;

    // Melhor Vendedor
    const topSellerEl = document.getElementById('kpi-best-seller');
    const topSellerAmountEl = document.getElementById('kpi-best-seller-amount');
    if (kpis.best_seller) {
      topSellerEl.textContent = kpis.best_seller.name;
      topSellerAmountEl.textContent = `${formatBRL(kpis.best_seller.amount)} (${kpis.best_seller.sales_count} vendas)`;
    } else {
      topSellerEl.textContent = 'Nenhuma venda';
      topSellerAmountEl.textContent = '-';
    }

    // Renderiza Gráfico Timeline (Evolução Vendas vs Custos)
    renderTimelineChart(data.charts.timeline);

    // Renderiza Participação dos Sócios
    renderSellersShare(data.charts.sellers_share, kpis.total_revenue);

    // Renderiza Modelos de Placas
    renderModelsDistribution(data.charts.models_distribution);

  } catch (error) {
    console.error('Erro ao atualizar dashboard:', error);
    showToast('Erro ao atualizar painel de controle.', 'error');
  }
}

/**
 * Renderiza gráfico visual de barras SVG/CSS limpo e interativo
 */
function renderTimelineChart(timeline) {
  const container = document.getElementById('timeline-chart');
  if (!container) return;

  if (!timeline || timeline.length === 0) {
    container.innerHTML = `<div style="margin: auto; color: var(--text-dim); font-size: 0.85rem;">Nenhuma movimentação financeira neste período.</div>`;
    return;
  }

  // Descobre o valor máximo para escalar a altura proporcional das barras
  const maxVal = Math.max(...timeline.map(t => Math.max(t.sales, t.expenses)), 100);

  container.innerHTML = timeline.map(item => {
    const salesHeight = Math.max((item.sales / maxVal) * 160, 4);
    const expHeight = Math.max((item.expenses / maxVal) * 160, 4);

    return `
      <div class="bar-group" title="${item.time_point}\nVendas: ${formatBRL(item.sales)}\nCustos: ${formatBRL(item.expenses)}">
        <div class="bars-wrapper">
          <div class="bar-col bar-sales" style="height: ${salesHeight}px;"></div>
          <div class="bar-col bar-expenses" style="height: ${expHeight}px;"></div>
        </div>
        <span class="bar-label">${item.time_point.substring(5)}</span>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza a lista de sócios com barras de progresso percentual
 */
function renderSellersShare(sellersShare, totalRevenue) {
  const container = document.getElementById('sellers-share-list');
  if (!container) return;

  if (!sellersShare || sellersShare.length === 0) {
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem;">Nenhum sócio cadastrado.</p>`;
    return;
  }

  container.innerHTML = sellersShare.map(seller => {
    return `
      <div class="partner-card">
        <div class="partner-header">
          <div class="partner-info">
            <h4>${seller.name}</h4>
            <span>${seller.sales_count} vendas (${seller.plaques_sold} placas)</span>
          </div>
          <div style="text-align: right;">
            <div class="partner-stat-val">${formatBRL(seller.total_amount)}</div>
            <span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 700;">${seller.percentage}%</span>
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${seller.percentage}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza cards de modelos vendidos
 */
function renderModelsDistribution(models) {
  const container = document.getElementById('models-distribution-list');
  if (!container) return;

  if (!models || models.length === 0) {
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.85rem;">Nenhum modelo cadastrado.</p>`;
    return;
  }

  container.innerHTML = models.map(m => `
    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.85rem;">
      <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.35rem;">${m.name}</h4>
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
        <span>${m.plaques_sold} un. vendidas</span>
        <strong style="color: var(--accent-cyan);">${formatBRL(m.total_revenue)}</strong>
      </div>
    </div>
  `).join('');
}

// Configuração dos filtros de período do Dashboard
function setupPeriodFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn[data-period]');
  const customDateContainer = document.getElementById('custom-date-container');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const period = btn.getAttribute('data-period');
      state.currentPeriod = period;

      if (period === 'custom') {
        customDateContainer.style.display = 'block';
      } else {
        customDateContainer.style.display = 'none';
        state.customStartDate = '';
        state.customEndDate = '';
        loadDashboard();
      }
    });
  });

  document.getElementById('btn-apply-custom-dates')?.addEventListener('click', () => {
    state.customStartDate = document.getElementById('custom-start-date').value;
    state.customEndDate = document.getElementById('custom-end-date').value;
    if (!state.customStartDate || !state.customEndDate) {
      showToast('Por favor, selecione as duas datas.', 'error');
      return;
    }
    loadDashboard();
  });
}

// =============================================================================
// MÓDULO: VENDAS
// =============================================================================

/**
 * Atualiza o aviso visual do status no modal de venda com base na data informada
 */
function updateSaleDateStatusHint() {
  const dateInput = document.getElementById('sale-date');
  const hintEl = document.getElementById('sale-status-hint');
  if (!dateInput || !hintEl) return;

  const selectedDate = dateInput.value;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  if (selectedDate && selectedDate > today) {
    hintEl.className = 'sale-status-hint is-pending';
    hintEl.innerHTML = `
      <span>⏳</span>
      <span>Data futura (<strong>${formatDate(selectedDate)}</strong>): Esta venda será gravada como <strong style="color: #fbbf24;">PENDENTE</strong> e mudará automaticamente para <strong style="color: #34d399;">PAGO</strong> quando chegar o dia.</span>
    `;
  } else {
    hintEl.className = 'sale-status-hint is-paid';
    hintEl.innerHTML = `
      <span>✓</span>
      <span>Data atual/passada (<strong>${formatDate(selectedDate || today)}</strong>): Esta venda será gravada como <strong style="color: #34d399;">PAGO</strong>.</span>
    `;
  }
}

async function loadSales() {
  try {
    const search = document.getElementById('filter-sales-search')?.value || '';
    const seller_id = document.getElementById('filter-sales-seller')?.value || 'all';
    const status = document.getElementById('filter-sales-status')?.value || 'all';

    const sales = await API.getSales({ search, seller_id, status });
    state.sales = sales;

    const tbody = document.getElementById('sales-table-body');
    if (!tbody) return;

    if (sales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 2rem;">Nenhuma venda encontrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = sales.map(sale => {
      const isPending = (sale.status || '').toLowerCase() === 'pendente';
      const statusBadge = isPending
        ? `<span class="badge badge-status-pending" title="Venda com data futura. Ficará paga automaticamente quando o dia chegar.">⏳ PENDENTE</span>`
        : `<span class="badge badge-status-paid" title="Venda liquidada/paga">✓ PAGO</span>`;

      return `
        <tr>
          <td>${formatDate(sale.date)}</td>
          <td><strong>${sale.customer_name}</strong></td>
          <td><span class="badge badge-cyan">${sale.model_name || 'Personalizado'}</span></td>
          <td><strong>${sale.quantity}</strong></td>
          <td>${formatBRL(sale.unit_price)}</td>
          <td><strong style="color: var(--accent-emerald); font-family: var(--font-mono);">${formatBRL(sale.total_price)}</strong></td>
          <td><span class="badge badge-indigo">${sale.seller_name || 'Não informado'}</span></td>
          <td><span class="badge badge-amber">${sale.payment_method}</span></td>
          <td>${statusBadge}</td>
          <td style="text-align: right; white-space: nowrap;">
            <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm btn-icon" onclick="editSaleItem(${sale.id})" title="Editar Venda">✏️</button>
              <button class="btn btn-danger-outline btn-sm btn-icon" onclick="deleteSaleItem(${sale.id})" title="Excluir Venda">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Erro ao carregar vendas:', error);
    showToast('Falha ao listar vendas.', 'error');
  }
}

// Registrar ou editar venda
function setupSaleForm() {
  const form = document.getElementById('form-sale');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('sale-id')?.value;
    const data = {
      date: document.getElementById('sale-date').value,
      customer_name: document.getElementById('sale-customer').value,
      model_id: document.getElementById('sale-model').value,
      seller_id: document.getElementById('sale-seller').value,
      quantity: document.getElementById('sale-quantity').value,
      unit_price: document.getElementById('sale-price').value,
      payment_method: document.getElementById('sale-payment').value,
      notes: document.getElementById('sale-notes').value
    };

    const statusVal = document.getElementById('sale-status')?.value;
    if (statusVal) {
      data.status = statusVal;
    }

    try {
      if (id) {
        await API.updateSale(id, data);
        closeModal('modal-sale');
        showToast('✓ Venda atualizada com sucesso!');
      } else {
        const res = await API.createSale(data);
        closeModal('modal-sale');
        const isPending = res.status === 'pendente';
        showToast(isPending ? '⏳ Venda futura registrada como PENDENTE!' : '🎉 Venda registrada com sucesso como PAGA!');
      }
      loadSales();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // Atualiza dica de status ao mudar a data da venda
  const saleDateInput = document.getElementById('sale-date');
  saleDateInput?.addEventListener('input', updateSaleDateStatusHint);
  saleDateInput?.addEventListener('change', updateSaleDateStatusHint);

  // Reage à escolha manual de status
  const saleStatusInput = document.getElementById('sale-status');
  saleStatusInput?.addEventListener('change', () => {
    if (saleStatusInput.value !== 'auto') {
      const hintEl = document.getElementById('sale-status-hint');
      if (hintEl) {
        if (saleStatusInput.value === 'pendente') {
          hintEl.className = 'sale-status-hint is-pending';
          hintEl.innerHTML = `<span>⏳</span><span>Status definido manualmente como <strong style="color: #fbbf24;">PENDENTE</strong>.</span>`;
        } else {
          hintEl.className = 'sale-status-hint is-paid';
          hintEl.innerHTML = `<span>✓</span><span>Status definido manualmente como <strong style="color: #34d399;">PAGO</strong>.</span>`;
        }
      }
    } else {
      updateSaleDateStatusHint();
    }
  });

  // Filtros em tempo real na listagem de vendas
  document.getElementById('filter-sales-search')?.addEventListener('input', loadSales);
  document.getElementById('filter-sales-seller')?.addEventListener('change', loadSales);
  document.getElementById('filter-sales-status')?.addEventListener('change', loadSales);
}

// Editar venda existente
window.editSaleItem = async function(id) {
  let sale = state.sales?.find(s => s.id === id);
  if (!sale) {
    try {
      const sales = await API.getSales();
      sale = sales.find(s => s.id === id);
    } catch (e) {
      console.error(e);
    }
  }

  if (!sale) {
    showToast('Venda não encontrada.', 'error');
    return;
  }

  // Garante que os selects de modelos e vendedores estão carregados
  await syncModelsAndSellers();

  const titleEl = document.getElementById('modal-sale-title');
  if (titleEl) titleEl.textContent = `Editar Venda #${sale.id} - ${sale.customer_name}`;

  document.getElementById('sale-id').value = sale.id;
  document.getElementById('sale-date').value = sale.date;
  document.getElementById('sale-customer').value = sale.customer_name;
  document.getElementById('sale-model').value = sale.model_id;
  document.getElementById('sale-seller').value = sale.seller_id;
  document.getElementById('sale-quantity').value = sale.quantity;
  document.getElementById('sale-price').value = Number(sale.unit_price).toFixed(2);
  document.getElementById('sale-payment').value = sale.payment_method || 'PIX';
  document.getElementById('sale-notes').value = sale.notes || '';

  const statusSelect = document.getElementById('sale-status');
  if (statusSelect) {
    statusSelect.value = sale.status || 'pago';
  }

  const btnSubmit = document.getElementById('btn-submit-sale');
  if (btnSubmit) btnSubmit.textContent = 'Salvar Alterações';

  // Atualiza cálculo total do modal
  const qty = parseFloat(sale.quantity) || 0;
  const price = parseFloat(sale.unit_price) || 0;
  const total = qty * price;
  const saleCalcHint = document.getElementById('sale-calc-total');
  if (saleCalcHint) {
    saleCalcHint.textContent = `Total Calculado: ${formatBRL(total)} (${qty} placa${qty > 1 ? 's' : ''})`;
  }

  updateSaleDateStatusHint();
  openModal('modal-sale');
};

// Excluir venda
window.deleteSaleItem = async function(id) {
  if (confirm('Tem certeza que deseja excluir o registro desta venda?')) {
    try {
      await API.deleteSale(id);
      showToast('Venda removida.');
      loadSales();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (error) {
      showToast('Erro ao excluir venda.', 'error');
    }
  }
};

// =============================================================================
// MÓDULO: GASTOS E MATERIAIS
// =============================================================================
async function loadExpenses() {
  try {
    const [expenses, summary] = await Promise.all([
      API.getExpenses(),
      API.getExpensesSummary()
    ]);

    state.expenses = expenses;

    // Atualiza mini-cards de resumo
    document.getElementById('expense-summary-total').textContent = formatBRL(summary.total_expenses);
    document.getElementById('expense-summary-avg').textContent = formatBRL(summary.average_unit_cost);
    document.getElementById('expense-summary-qty').textContent = summary.total_items_bought;

    // Atualiza badges de categoria
    const categoryContainer = document.getElementById('expenses-category-breakdown');
    if (categoryContainer) {
      if (summary.by_category.length === 0) {
        categoryContainer.innerHTML = `<span style="color: var(--text-dim); font-size: 0.8rem;">Nenhum gasto registrado ainda.</span>`;
      } else {
        categoryContainer.innerHTML = summary.by_category.map(cat => `
          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); padding: 0.4rem 0.8rem; border-radius: var(--radius-sm); font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem;">
            <strong>${cat.category}</strong>
            <span style="color: var(--accent-rose); font-family: var(--font-mono);">${formatBRL(cat.total)}</span>
            <span style="color: var(--text-dim); font-size: 0.7rem;">(${cat.percentage}%)</span>
          </div>
        `).join('');
      }
    }

    // Tabela de Gastos
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 2rem;">Nenhum gasto ou compra de material registrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = expenses.map(exp => `
      <tr>
        <td>${formatDate(exp.date)}</td>
        <td><strong>${exp.item_name}</strong></td>
        <td><span class="badge badge-rose">${exp.category}</span></td>
        <td><strong>${exp.quantity}</strong></td>
        <td>${formatBRL(exp.unit_cost)}</td>
        <td><strong style="color: var(--accent-rose); font-family: var(--font-mono);">${formatBRL(exp.total_cost)}</strong></td>
        <td>${exp.supplier || '-'}</td>
        <td style="color: var(--text-dim); font-size: 0.8rem;">${exp.notes || '-'}</td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm btn-icon" onclick="editExpenseItem(${exp.id})" title="Editar Gasto">✏️</button>
            <button class="btn btn-danger-outline btn-sm btn-icon" onclick="deleteExpenseItem(${exp.id})" title="Excluir Gasto">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar gastos:', error);
    showToast('Falha ao listar gastos.', 'error');
  }
}

// Cadastrar ou editar gasto
function setupExpenseForm() {
  const form = document.getElementById('form-expense');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('expense-id')?.value;
    const data = {
      date: document.getElementById('expense-date').value,
      category: document.getElementById('expense-category').value,
      item_name: document.getElementById('expense-item').value,
      quantity: document.getElementById('expense-qty').value,
      unit_cost: document.getElementById('expense-unit-cost').value,
      supplier: document.getElementById('expense-supplier').value,
      notes: document.getElementById('expense-notes').value
    };

    try {
      if (id) {
        await API.updateExpense(id, data);
        closeModal('modal-expense');
        showToast('✓ Gasto atualizado com sucesso!');
      } else {
        await API.createExpense(data);
        closeModal('modal-expense');
        showToast('📦 Gasto registrado com sucesso!');
      }
      loadExpenses();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

// Editar gasto existente
window.editExpenseItem = async function(id) {
  let exp = state.expenses?.find(e => e.id === id);
  if (!exp) {
    try {
      const expenses = await API.getExpenses();
      exp = expenses.find(e => e.id === id);
    } catch (e) {
      console.error(e);
    }
  }

  if (!exp) {
    showToast('Gasto não encontrado.', 'error');
    return;
  }

  const titleEl = document.getElementById('modal-expense-title');
  if (titleEl) titleEl.textContent = `Editar Gasto #${exp.id} - ${exp.item_name}`;

  document.getElementById('expense-id').value = exp.id;
  document.getElementById('expense-date').value = exp.date;
  document.getElementById('expense-category').value = exp.category || 'Tags NFC';
  document.getElementById('expense-item').value = exp.item_name;
  document.getElementById('expense-qty').value = exp.quantity;
  document.getElementById('expense-unit-cost').value = Number(exp.unit_cost).toFixed(2);
  document.getElementById('expense-supplier').value = exp.supplier || '';
  document.getElementById('expense-notes').value = exp.notes || '';

  const btnSubmit = document.getElementById('btn-submit-expense');
  if (btnSubmit) btnSubmit.textContent = 'Salvar Alterações';

  const qty = parseFloat(exp.quantity) || 0;
  const unitCost = parseFloat(exp.unit_cost) || 0;
  const total = qty * unitCost;
  const calcHint = document.getElementById('expense-calc-total');
  if (calcHint) calcHint.textContent = `Total Calculado: ${formatBRL(total)}`;

  openModal('modal-expense');
};

// Excluir gasto
window.deleteExpenseItem = async function(id) {
  if (confirm('Deseja realmente remover este registro de despesa?')) {
    try {
      await API.deleteExpense(id);
      showToast('Registro de gasto excluído.');
      loadExpenses();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (error) {
      showToast('Erro ao remover gasto.', 'error');
    }
  }
};

// =============================================================================
// MÓDULO: MODELOS DE PLACAS
// =============================================================================
async function loadModels() {
  try {
    const models = await API.getModels(true);
    state.models = models;

    const container = document.getElementById('models-cards-grid');
    if (!container) return;

    if (models.length === 0) {
      container.innerHTML = `<p style="color: var(--text-dim);">Nenhum modelo cadastrado.</p>`;
      return;
    }

    container.innerHTML = models.map(m => `
      <div class="card">
        <div class="card-accent-top ${m.is_active ? 'card-accent-cyan' : 'card-accent-rose'}"></div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <h3 style="font-size: 1.05rem; font-weight: 700;">${m.name}</h3>
          <span class="badge ${m.is_active ? 'badge-emerald' : 'badge-rose'}">
            ${m.is_active ? 'Ativo' : 'Desativado'}
          </span>
        </div>
        <div style="font-size: 1.35rem; font-weight: 800; color: var(--accent-cyan); font-family: var(--font-mono); margin-bottom: 0.75rem;">
          ${formatBRL(m.base_price)}
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted); min-height: 48px; margin-bottom: 1rem;">
          ${m.description || 'Sem descrição cadastrada.'}
        </p>
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 0.85rem;">
          <button class="btn btn-secondary btn-sm" onclick="editModelItem(${m.id})">Editar</button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteModelItem(${m.id})">
            ${m.is_active ? 'Desativar' : 'Excluir'}
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar modelos:', error);
  }
}

function setupModelForm() {
  const form = document.getElementById('form-model');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('model-id').value;
    const data = {
      name: document.getElementById('model-name').value,
      base_price: document.getElementById('model-price').value,
      description: document.getElementById('model-desc').value
    };

    try {
      if (id) {
        await API.updateModel(id, data);
        showToast('Modelo atualizado com sucesso!');
      } else {
        await API.createModel(data);
        showToast('Novo modelo criado com sucesso!');
      }

      closeModal('modal-model');
      await syncModelsAndSellers();
      loadModels();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

window.editModelItem = function(id) {
  const model = state.models.find(m => m.id === id);
  if (!model) return;

  document.getElementById('modal-model-title').textContent = 'Editar Modelo de Placa';
  document.getElementById('model-id').value = model.id;
  document.getElementById('model-name').value = model.name;
  document.getElementById('model-price').value = model.base_price;
  document.getElementById('model-desc').value = model.description || '';

  openModal('modal-model');
};

window.deleteModelItem = async function(id) {
  if (confirm('Tem certeza sobre a alteração deste modelo?')) {
    try {
      const res = await API.deleteModel(id);
      showToast(res.message || 'Modelo atualizado.');
      await syncModelsAndSellers();
      loadModels();
    } catch (error) {
      showToast('Erro ao remover modelo.', 'error');
    }
  }
};

// =============================================================================
// MÓDULO: SÓCIOS E VENDEDORES
// =============================================================================
async function loadSellers() {
  try {
    const sellers = await API.getSellers(true);
    state.sellers = sellers;

    const container = document.getElementById('sellers-cards-grid');
    if (!container) return;

    container.innerHTML = sellers.map(seller => `
      <div class="card">
        <div class="card-accent-top card-accent-indigo"></div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700;">${seller.name}</h3>
            <span class="badge badge-indigo">${seller.role || 'Sócio'}</span>
          </div>
          <span style="font-size: 1.25rem; font-weight: 800; color: var(--accent-cyan); font-family: var(--font-mono);">
            ${seller.sales_percentage}%
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin: 1rem 0; background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius: var(--radius-md);">
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Total em Vendas</span>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--accent-emerald); font-family: var(--font-mono);">
              ${formatBRL(seller.total_sold)}
            </div>
          </div>
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Vendas Feitas</span>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-main);">
              ${seller.sales_count} (${seller.items_sold} placas)
            </div>
          </div>
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Ticket Médio</span>
            <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-muted); font-family: var(--font-mono);">
              ${formatBRL(seller.average_sale)}
            </div>
          </div>
          <div>
            <span style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Status</span>
            <div style="font-size: 0.85rem; font-weight: 600; color: ${seller.is_active ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
              ${seller.is_active ? 'Ativo' : 'Inativo'}
            </div>
          </div>
        </div>

        <div class="progress-track" style="margin-bottom: 1rem;">
          <div class="progress-fill" style="width: ${seller.sales_percentage}%;"></div>
        </div>

        <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
          <button class="btn btn-danger-outline btn-sm" onclick="deleteSellerItem(${seller.id})">
            ${seller.sales_count > 0 ? 'Desativar' : 'Excluir'}
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar sócios:', error);
  }
}

function setupSellerForm() {
  const form = document.getElementById('form-seller');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
      name: document.getElementById('seller-name').value,
      role: document.getElementById('seller-role').value
    };

    try {
      await API.createSeller(data);
      closeModal('modal-seller');
      showToast('Pessoa adicionada à equipe!');
      await syncModelsAndSellers();
      loadSellers();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

window.deleteSellerItem = async function(id) {
  if (confirm('Deseja desativar/remover esta pessoa?')) {
    try {
      const res = await API.deleteSeller(id);
      showToast(res.message || 'Sócio/Vendedor atualizado.');
      await syncModelsAndSellers();
      loadSellers();
    } catch (error) {
      showToast('Erro ao remover.', 'error');
    }
  }
};

// =============================================================================
// MÓDULO: RELATÓRIOS CONSOLIDADOS
// =============================================================================
async function loadReports() {
  try {
    const reportData = await API.getReports(state.reportGroup);
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    if (reportData.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">Nenhuma venda registrada para compor o relatório.</td></tr>`;
      return;
    }

    tbody.innerHTML = reportData.data.map(item => {
      let growthBadge = `<span style="color: var(--text-dim); font-size: 0.75rem;">-</span>`;
      if (item.growth_vs_previous !== null) {
        const isUp = item.growth_vs_previous >= 0;
        growthBadge = `<span class="badge ${isUp ? 'badge-emerald' : 'badge-rose'}">
          ${isUp ? '▲ +' : '▼ '}${item.growth_vs_previous}%
        </span>`;
      }

      return `
        <tr>
          <td><strong>${item.period}</strong></td>
          <td>${item.total_sales} vendas</td>
          <td><strong>${item.total_quantity} un.</strong></td>
          <td><strong style="color: var(--accent-emerald); font-family: var(--font-mono);">${formatBRL(item.total_amount)}</strong></td>
          <td>${formatBRL(item.average_per_unit)}</td>
          <td>${growthBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Erro ao gerar relatórios:', error);
  }
}

// =============================================================================
// MÓDULO: ANOTAÇÕES DOS SÓCIOS (MULTI-LINHAS)
// =============================================================================
async function loadNotes() {
  try {
    const notes = await API.getNotes();
    state.notes = notes;

    const container = document.getElementById('notes-cards-grid');
    if (!container) return;

    if (notes.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📝</div>
          <h3 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.35rem;">Nenhuma anotação ainda</h3>
          <p style="font-size: 0.85rem; margin-bottom: 1.25rem;">Use este espaço para anotar ideias de placas, recados, contatos de fornecedores e tarefas.</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('btn-open-modal-note').click()">+ Criar Primeira Anotação</button>
        </div>
      `;
      return;
    }

    container.innerHTML = notes.map(note => `
      <div class="note-card">
        <div class="card-accent-top card-accent-cyan"></div>
        <div class="note-header">
          <h3 class="note-title">${note.title || 'Sem Título'}</h3>
          <span class="badge badge-indigo">${note.author || 'Geral'}</span>
        </div>
        <div class="note-content-box">${note.content}</div>
        <div class="note-footer">
          <span>🕒 ${formatDate(note.created_at ? note.created_at.split(' ')[0] : '')}</span>
          <div class="note-actions">
            <button class="btn btn-secondary btn-sm" onclick="editNoteItem(${note.id})">Editar</button>
            <button class="btn btn-danger-outline btn-sm btn-icon" onclick="deleteNoteItem(${note.id})" title="Excluir Anotação">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar anotações:', error);
    showToast('Falha ao listar anotações.', 'error');
  }
}

function setupNoteForm() {
  const form = document.getElementById('form-note');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('note-id').value;
    const data = {
      title: document.getElementById('note-title').value,
      author: document.getElementById('note-author').value,
      content: document.getElementById('note-content').value
    };

    try {
      if (id) {
        await API.updateNote(id, data);
        showToast('Anotação atualizada!');
      } else {
        await API.createNote(data);
        showToast('📝 Anotação salva com sucesso!');
      }

      closeModal('modal-note');
      loadNotes();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

window.editNoteItem = function(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;

  document.getElementById('modal-note-title').textContent = 'Editar Anotação';
  document.getElementById('note-id').value = note.id;
  document.getElementById('note-title').value = note.title || '';
  document.getElementById('note-author').value = note.author || 'Geral';
  document.getElementById('note-content').value = note.content || '';

  openModal('modal-note');
};

window.deleteNoteItem = async function(id) {
  if (confirm('Deseja realmente excluir esta anotação?')) {
    try {
      await API.deleteNote(id);
      showToast('Anotação excluída.');
      loadNotes();
    } catch (error) {
      showToast('Erro ao remover anotação.', 'error');
    }
  }
};

// =============================================================================
// INICIALIZAÇÃO DA APLICAÇÃO (Robusta para carregamento direto ou em cache)
// =============================================================================
function initApp() {
  console.log('⚡ NFC Gestão Pro inicializado com sucesso.');

  // Configurações de eventos
  setupNavigation();
  setupModalListeners();
  setupPeriodFilters();
  setupFormCalculations();
  setupSaleForm();
  setupExpenseForm();
  setupModelForm();
  setupSellerForm();
  setupReportButtons();
  setupNoteForm();

  // 1. Carrega imediatamente o Dashboard da tela inicial sem travar a interface
  loadDashboard();

  // 2. Carrega opções dos selects de modelos e vendedores em segundo plano
  syncModelsAndSellers();
}

// Garante execução imediata mesmo se o documento já estiver pronto (evita tela zerada)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
