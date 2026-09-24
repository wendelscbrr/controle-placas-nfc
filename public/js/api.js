// public/js/api.js
// Camada de comunicação assíncrona com a API REST (Fetch API) com Autenticação Centralizada

const AUTH_KEY = 'nfc_auth_token';

/**
 * Retorna os headers necessários para a requisição, incluindo o Bearer Token de autenticação
 */
function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem(AUTH_KEY);
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

const API = {
  /**
   * Wrapper centralizado para todas as chamadas HTTP.
   * Injeta o token e detecta se o acesso foi negado (401), acionando o bloqueio de tela.
   */
  async request(url, options = {}) {
    const headers = getAuthHeaders(options.headers || {});
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.dispatchEvent(new CustomEvent('auth:required'));
      throw new Error('Acesso bloqueado. Senha necessária.');
    }

    return res;
  },

  // Autenticação
  async verifyPassword(password) {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Senha incorreta.');
    
    // Salva o token localmente para manter a sessão aberta
    localStorage.setItem(AUTH_KEY, data.token);
    return data;
  },

  logout() {
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new CustomEvent('auth:required'));
  },

  isAuthenticated() {
    return !!localStorage.getItem(AUTH_KEY);
  },

  // 1. Dashboard & Indicadores
  async getDashboard(period = 'all', startDate = '', endDate = '') {
    const params = new URLSearchParams({ period });
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const res = await this.request(`/api/dashboard?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar dados do dashboard');
    return res.json();
  },

  // 2. Vendas
  async getSales(filters = {}) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.seller_id) params.append('seller_id', filters.seller_id);
    if (filters.model_id) params.append('model_id', filters.model_id);
    if (filters.search) params.append('search', filters.search);

    const res = await this.request(`/api/sales?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar vendas');
    return res.json();
  },

  async createSale(data) {
    const res = await this.request('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao registrar venda');
    return result;
  },

  async deleteSale(id) {
    const res = await this.request(`/api/sales/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir venda');
    return res.json();
  },

  // 3. Gastos & Materiais
  async getExpenses(filters = {}) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.category) params.append('category', filters.category);

    const res = await this.request(`/api/expenses?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar gastos');
    return res.json();
  },

  async getExpensesSummary(filters = {}) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const res = await this.request(`/api/expenses/summary?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar resumo de despesas');
    return res.json();
  },

  async createExpense(data) {
    const res = await this.request('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao cadastrar gasto');
    return result;
  },

  async deleteExpense(id) {
    const res = await this.request(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir gasto');
    return res.json();
  },

  // 4. Modelos de Placas
  async getModels(all = true) {
    const res = await this.request(`/api/models?all=${all}`);
    if (!res.ok) throw new Error('Falha ao buscar modelos');
    return res.json();
  },

  async createModel(data) {
    const res = await this.request('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao criar modelo');
    return result;
  },

  async updateModel(id, data) {
    const res = await this.request(`/api/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao atualizar modelo');
    return result;
  },

  async deleteModel(id) {
    const res = await this.request(`/api/models/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir modelo');
    return res.json();
  },

  // 5. Sócios e Vendedores
  async getSellers(all = true) {
    const res = await this.request(`/api/sellers?all=${all}`);
    if (!res.ok) throw new Error('Falha ao buscar sócios');
    return res.json();
  },

  async createSeller(data) {
    const res = await this.request('/api/sellers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao cadastrar sócio/vendedor');
    return result;
  },

  async deleteSeller(id) {
    const res = await this.request(`/api/sellers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao remover sócio/vendedor');
    return res.json();
  },

  // 6. Relatórios
  async getReports(groupBy = 'month', startDate = '', endDate = '') {
    const params = new URLSearchParams({ groupBy });
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const res = await this.request(`/api/reports/sales?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao gerar relatórios');
    return res.json();
  },

  // 7. Bloco de Anotações
  async getNotes() {
    const res = await this.request('/api/notes');
    if (!res.ok) throw new Error('Falha ao carregar anotações');
    return res.json();
  },

  async createNote(data) {
    const res = await this.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao salvar anotação');
    return result;
  },

  async updateNote(id, data) {
    const res = await this.request(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao atualizar anotação');
    return result;
  },

  async deleteNote(id) {
    const res = await this.request(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir anotação');
    return res.json();
  }
};
