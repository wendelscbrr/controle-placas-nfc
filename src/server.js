// src/server.js
// Servidor Web Express: API REST e Servidor de Arquivos Estáticos

const express = require('express');
const cors = require('cors');
const path = require('node:path');

// Inicializa o banco de dados
require('./database/db');

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

const { checkCloudStatus, syncLocalWithCloud } = require('./database/cloud');
const db = require('./database/db');

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
  const status = await checkCloudStatus();
  res.json(status);
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
  console.log(`📊 Banco de dados: SQLite nativo conectado`);

  // Verifica status do SQLite Cloud se configurado
  const cloud = await checkCloudStatus();
  if (cloud.active) {
    console.log(`☁ SQLite Cloud: ATIVO E CONECTADO COM SUCESSO!`);
    // Sincroniza dados com o SQLite Cloud
    await syncLocalWithCloud(db);
  } else {
    console.log(`ℹ SQLite Cloud: Modo Local ativo (${cloud.message})`);
  }
  console.log(`====================================================`);
});
