const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * Retorna a data atual no formato YYYY-MM-DD considerando o fuso horário de Brasília
 */
function getTodayDateStr() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
  return formatter.format(now);
}

/**
 * Sincroniza automaticamente o status das vendas pendentes:
 * Se a data da venda chegou (date <= hoje), o status é atualizado para 'pago'.
 */
async function syncPendingSales() {
  try {
    const today = getTodayDateStr();
    await db.run(`
      UPDATE sales 
      SET status = 'pago' 
      WHERE status = 'pendente' AND date <= ?
    `, today);
  } catch (err) {
    console.error('Erro ao sincronizar status de vendas pendentes:', err);
  }
}

// GET /api/sales - Listar vendas com detalhes do modelo, vendedor e status atualizado
router.get('/', async (req, res) => {
  try {
    // Sincroniza vendas pendentes cuja data chegou antes de listar
    await syncPendingSales();

    const { startDate, endDate, seller_id, model_id, status, search } = req.query;

    let query = `
      SELECT 
        s.id,
        s.date,
        s.customer_name,
        s.model_id,
        m.name AS model_name,
        s.quantity,
        s.unit_price,
        s.total_price,
        s.seller_id,
        sel.name AS seller_name,
        s.payment_method,
        COALESCE(s.status, 'pago') AS status,
        s.notes,
        s.created_at
      FROM sales s
      LEFT JOIN models m ON s.model_id = m.id
      LEFT JOIN sellers sel ON s.seller_id = sel.id
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      query += ' AND s.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND s.date <= ?';
      params.push(endDate);
    }
    if (seller_id && seller_id !== 'all') {
      query += ' AND s.seller_id = ?';
      params.push(seller_id);
    }
    if (model_id && model_id !== 'all') {
      query += ' AND s.model_id = ?';
      params.push(model_id);
    }
    if (status && status !== 'all') {
      query += ' AND s.status = ?';
      params.push(status);
    }
    if (search && search.trim() !== '') {
      query += ' AND (s.customer_name LIKE ? OR s.notes LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ' ORDER BY s.date DESC, s.id DESC';

    const sales = await db.all(query, params);
    res.json(sales);
  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
    res.status(500).json({ error: 'Erro ao listar vendas' });
  }
});

// POST /api/sales - Registrar nova venda
router.post('/', async (req, res) => {
  try {
    const { 
      date, 
      customer_name, 
      model_id, 
      quantity, 
      unit_price, 
      seller_id, 
      payment_method, 
      notes 
    } = req.body;

    if (!customer_name || customer_name.trim() === '') {
      return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
    }
    if (!model_id) {
      return res.status(400).json({ error: 'Selecione o modelo da placa.' });
    }
    if (!seller_id) {
      return res.status(400).json({ error: 'Selecione o sócio/vendedor responsável.' });
    }

    const qty = parseInt(quantity, 10);
    const price = parseFloat(unit_price);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantidade de placas deve ser pelo menos 1.' });
    }
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Valor unitário inválido.' });
    }

    // Calcula valor total automaticamente
    const totalPrice = Number((qty * price).toFixed(2));
    const today = getTodayDateStr();
    const saleDate = date || today;

    const status = (req.body.status && req.body.status !== 'auto')
      ? req.body.status
      : (saleDate > today ? 'pendente' : 'pago');

    const result = await db.run(`
      INSERT INTO sales (
        date, customer_name, model_id, quantity, unit_price, total_price, seller_id, payment_method, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      saleDate,
      customer_name.trim(),
      parseInt(model_id, 10),
      qty,
      price,
      totalPrice,
      parseInt(seller_id, 10),
      payment_method || 'PIX',
      status,
      notes ? notes.trim() : ''
    );

    // Retorna a venda completa já com os joins
    const newSale = await db.get(`
      SELECT 
        s.*,
        m.name AS model_name,
        sel.name AS seller_name
      FROM sales s
      LEFT JOIN models m ON s.model_id = m.id
      LEFT JOIN sellers sel ON s.seller_id = sel.id
      WHERE s.id = ?
    `, result.lastInsertRowid);

    res.status(201).json(newSale);
  } catch (error) {
    console.error('Erro ao cadastrar venda:', error);
    res.status(500).json({ error: 'Erro ao registrar venda' });
  }
});

// PUT /api/sales/:id - Editar venda
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      date, 
      customer_name, 
      model_id, 
      quantity, 
      unit_price, 
      seller_id, 
      payment_method, 
      status: customStatus,
      notes 
    } = req.body;

    const existing = await db.get('SELECT * FROM sales WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    const qty = quantity !== undefined ? parseInt(quantity, 10) : existing.quantity;
    const price = unit_price !== undefined ? parseFloat(unit_price) : existing.unit_price;
    const totalPrice = Number((qty * price).toFixed(2));
    const targetDate = date || existing.date;
    const today = getTodayDateStr();

    let statusToSave = existing.status || 'pago';
    if (customStatus && customStatus !== 'auto') {
      statusToSave = customStatus;
    } else {
      statusToSave = targetDate > today ? 'pendente' : 'pago';
    }

    await db.run(`
      UPDATE sales SET
        date = ?,
        customer_name = ?,
        model_id = ?,
        quantity = ?,
        unit_price = ?,
        total_price = ?,
        seller_id = ?,
        payment_method = ?,
        status = ?,
        notes = ?
      WHERE id = ?
    `,
      targetDate,
      customer_name !== undefined ? customer_name.trim() : existing.customer_name,
      model_id !== undefined ? parseInt(model_id, 10) : existing.model_id,
      qty,
      price,
      totalPrice,
      seller_id !== undefined ? parseInt(seller_id, 10) : existing.seller_id,
      payment_method !== undefined ? payment_method : existing.payment_method,
      statusToSave,
      notes !== undefined ? notes.trim() : existing.notes,
      id
    );

    const updatedSale = await db.get(`
      SELECT 
        s.*,
        m.name AS model_name,
        sel.name AS seller_name
      FROM sales s
      LEFT JOIN models m ON s.model_id = m.id
      LEFT JOIN sellers sel ON s.seller_id = sel.id
      WHERE s.id = ?
    `, id);

    res.json(updatedSale);
  } catch (error) {
    console.error('Erro ao atualizar venda:', error);
    res.status(500).json({ error: 'Erro ao atualizar registro de venda' });
  }
});

// DELETE /api/sales/:id - Excluir venda
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM sales WHERE id = ?', id);
    res.json({ message: 'Venda excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir venda:', error);
    res.status(500).json({ error: 'Erro ao remover venda' });
  }
});

module.exports = router;
