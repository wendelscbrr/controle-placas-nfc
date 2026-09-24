// src/routes/auth.js
// Rota de autenticação simples para proteger o sistema

const express = require('express');
const router = express.Router();

// Senha definida pelo usuário
const MASTER_PASSWORD = process.env.APP_PASSWORD || 'coxinha';

// Token estático de sessão para autorizar as requisições da API
const AUTH_TOKEN = 'nfc_token_' + Buffer.from(MASTER_PASSWORD).toString('base64');

// POST /api/auth/verify - Valida a senha digitada
router.post('/verify', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Por favor, digite a senha.' });
  }

  // Compara sem diferenciar maiúsculas/minúsculas e removendo espaços acidentais
  if (password.trim().toLowerCase() === MASTER_PASSWORD.toLowerCase()) {
    return res.json({ 
      success: true, 
      token: AUTH_TOKEN,
      message: 'Acesso liberado com sucesso!' 
    });
  } else {
    return res.status(401).json({ 
      success: false, 
      error: 'Senha incorreta. Tente novamente.' 
    });
  }
});

// Middleware que protege as rotas da API no backend
function requireAuth(req, res, next) {
  // Ignora verificação para a própria rota de autenticação
  if (req.path.startsWith('/api/auth')) {
    return next();
  }

  const authHeader = req.headers['authorization'] || req.headers['x-access-token'];
  const token = authHeader ? authHeader.replace('Bearer ', '').trim() : null;

  if (token && token === AUTH_TOKEN) {
    return next();
  }

  return res.status(401).json({ 
    error: 'Acesso não autorizado. É necessário desbloquear o sistema com a senha.' 
  });
}

module.exports = { router, requireAuth };
