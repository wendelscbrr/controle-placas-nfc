// src/server.js
// Servidor Web Express: API REST e Servidor de Arquivos Estáticos

const express = require('express');
const cors = require('cors');
const path = require('node:path');

// Inicializa o banco de dados
require('./database/db');

// Importa as rotas modulares e o middleware de autenticação
const { router: authRouter, requireAuth } = require('./routes/auth');
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

// Rota pública de autenticação
app.use('/api/auth', authRouter);

// Protege todas as outras rotas da API com verificação de senha
app.use('/api', requireAuth);

// Rotas da API REST (Agora protegidas)
app.use('/api/models', modelsRouter);
app.use('/api/sellers', sellersRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notes', notesRouter);

// Rota de fallback padrão para servir a aplicação (SPA) compatível com Express 5
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Sistema de Gestão NFC rodando com sucesso!`);
  console.log(`📡 Endereço local: http://localhost:${PORT}`);
  console.log(`📊 Banco de dados: SQLite nativo conectado`);
  console.log(`====================================================`);
});
