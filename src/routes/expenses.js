const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * Retorna a data atual no formato YYYY-MM-DD considerando o fuso horário de Brasília
 */
function getTodayDateStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// GET /api/expenses - Listar gastos com filtros opcionais
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;

    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY date DESC, id DESC';

    const expenses = await db.all(query, params);
    res.json(expenses);
  } catch (error) {
    console.error('Erro ao buscar gastos:', error);
    res.status(500).json({ error: 'Erro ao buscar registros de gastos' });
  }
});

// GET /api/expenses/summary - Resumo com Total Gasto, Gastos por Categoria e Custo Médio
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = ' WHERE date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = ' WHERE date >= ?';
      params.push(startDate);
    } else if (endDate) {
      dateFilter = ' WHERE date <= ?';
      params.push(endDate);
    }

    // 1. Total Geral e Média de Custo Unitário dos Materiais
    const generalStats = await db.get(`
      SELECT 
        COUNT(id) as total_records,
        COALESCE(SUM(total_cost), 0) as total_expenses,
        COALESCE(AVG(unit_cost), 0) as average_unit_cost,
        COALESCE(SUM(quantity), 0) as total_items_bought
      FROM expenses
      ${dateFilter}
    `, params);

    // 2. Gastos Agrupados por Categoria
    const categoryStats = await db.all(`
      SELECT 
        category,
        COALESCE(SUM(total_cost), 0) as category_total,
        COUNT(id) as items_count
      FROM expenses
      ${dateFilter}
      GROUP BY category
      ORDER BY category_total DESC
    `, params);

    const totalExp = generalStats ? generalStats.total_expenses || 0 : 0;

    res.json({
      total_expenses: Number(totalExp.toFixed(2)),
      average_unit_cost: Number((generalStats ? generalStats.average_unit_cost || 0 : 0).toFixed(2)),
      total_items_bought: generalStats ? generalStats.total_items_bought || 0 : 0,
      total_records: generalStats ? generalStats.total_records || 0 : 0,
      by_category: categoryStats.map(c => ({
        category: c.category,
        total: Number((c.category_total || 0).toFixed(2)),
        count: c.items_count,
        percentage: totalExp > 0 
          ? Number(((c.category_total / totalExp) * 100).toFixed(1))
          : 0
      }))
    });
  } catch (error) {
    console.error('Erro ao gerar resumo de gastos:', error);
    res.status(500).json({ error: 'Erro ao calcular resumo de despesas' });
  }
});

// POST /api/expenses - Registrar novo gasto
router.post('/', async (req, res) => {
  try {
    const { date, item_name, category, quantity, unit_cost, supplier, notes } = req.body;

    if (!item_name || item_name.trim() === '') {
      return res.status(400).json({ error: 'Nome do material é obrigatório.' });
    }

    const qty = parseFloat(quantity);
    const unitPrice = parseFloat(unit_cost);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
    }
    if (isNaN(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ error: 'Valor unitário inválido.' });
    }

    // O sistema calcula o valor total automaticamente (Regra do Negócio)
    const totalCost = Number((qty * unitPrice).toFixed(2));
    const purchaseDate = date || getTodayDateStr();
    const categoryName = category && category.trim() !== '' ? category.trim() : 'Outros';

    const result = await db.run(`
      INSERT INTO expenses (date, item_name, category, quantity, unit_cost, total_cost, supplier, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      purchaseDate,
      item_name.trim(),
      categoryName,
      qty,
      unitPrice,
      totalCost,
      supplier ? supplier.trim() : '',
      notes ? notes.trim() : ''
    );

    const newExpense = await db.get('SELECT * FROM expenses WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Erro ao cadastrar gasto:', error);
    res.status(500).json({ error: 'Erro ao registrar despesa' });
  }
});

// PUT /api/expenses/:id - Editar gasto
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, item_name, category, quantity, unit_cost, supplier, notes } = req.body;

    const existing = await db.get('SELECT * FROM expenses WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Registro de gasto não encontrado.' });
    }

    const updatedQty = quantity !== undefined ? parseFloat(quantity) : existing.quantity;
    const updatedUnitCost = unit_cost !== undefined ? parseFloat(unit_cost) : existing.unit_cost;
    const updatedTotalCost = Number((updatedQty * updatedUnitCost).toFixed(2));

    await db.run(`
      UPDATE expenses 
      SET date = ?, item_name = ?, category = ?, quantity = ?, unit_cost = ?, total_cost = ?, supplier = ?, notes = ?
      WHERE id = ?
    `,
      date || existing.date,
      item_name !== undefined ? item_name.trim() : existing.item_name,
      category !== undefined ? category.trim() : existing.category,
      updatedQty,
      updatedUnitCost,
      updatedTotalCost,
      supplier !== undefined ? supplier.trim() : existing.supplier,
      notes !== undefined ? notes.trim() : existing.notes,
      id
    );

    const updated = await db.get('SELECT * FROM expenses WHERE id = ?', id);
    res.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar gasto:', error);
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
});

// DELETE /api/expenses/:id - Excluir gasto
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM expenses WHERE id = ?', id);
    res.json({ message: 'Registro de gasto excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir gasto:', error);
    res.status(500).json({ error: 'Erro ao excluir gasto' });
  }
});

module.exports = router;
