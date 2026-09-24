// src/server.js
// Servidor Web Express: API REST 100% SQLite Cloud e Servidor de Arquivos Estáticos

const express = require('express');
const cors = require('cors');
const path = require('node:path');

// Cliente do banco de dados na nuvem (SQLite Cloud)
const db = require('./database/db');

// Importa as rotas modulares
const modelsRouter = require('./routes/models');
const sellersRouter = require('./routes/sellers');
const expensesRouter = require('./routes/expenses');
const salesRouter = require('./routes/sales');
const dashboardRouter = require('./routes/dashboard');
const reportsRouter = require('./routes/reports');
const notesRouter = require('./routes/notes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares essenciais
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend (HTML, CSS, JS, Imagens)
app.use(express.static(path.join(__dirname, '../public')));

// Rotas da API REST
app.use('/api/models', modelsRouter);
app.use('/api/sellers', sellersRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notes', notesRouter);

// Rota de Diagnóstico do SQLite Cloud
app.get('/api/cloud-status', async (req, res) => {
  try {
    await db.get('SELECT 1 as ping');
    res.json({
      active: true,
      mode: 'cloud',
      message: '☁ 100% Nuvem: Conectado diretamente ao SQLite Cloud!'
    });
  } catch (err) {
    res.json({
      active: false,
      mode: 'error',
      message: `Erro ao conectar no SQLite Cloud: ${err.message}`
    });
  }
});

// Rota de Sincronização (Informa ao frontend que a operação é 100% em tempo real na nuvem)
app.post('/api/cloud-sync', async (req, res) => {
  try {
    await db.get('SELECT 1 as ping');
    res.json({
      active: true,
      message: 'O sistema já opera 100% conectado diretamente no SQLite Cloud. Todos os dados são salvos na nuvem em tempo real!'
    });
  } catch (error) {
    console.error('Erro ao verificar conexão com a nuvem:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota de fallback padrão para servir a aplicação (SPA) compatível com Express 5
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Inicialização do servidor
app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 Sistema de Gestão NFC rodando com sucesso!`);
  console.log(`📡 Endereço: http://localhost:${PORT}`);
  console.log(`☁ Banco de dados: 100% SQLite Cloud (Nuvem)`);

  try {
    await db.get('SELECT 1 as ping');
    console.log(`✅ SQLite Cloud: CONECTADO COM SUCESSO!`);
  } catch (err) {
    console.error(`❌ Falha na conexão com SQLite Cloud:`, err.message);
  }
  console.log(`====================================================`);
});
