const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { syncToCloud } = require('../database/cloud');

// GET /api/expenses - Listar gastos com filtros opcionais
router.get('/', (req, res) => {
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

    const expenses = db.prepare(query).all(...params);
    res.json(expenses);
  } catch (error) {
    console.error('Erro ao buscar gastos:', error);
    res.status(500).json({ error: 'Erro ao buscar registros de gastos' });
  }
});

// GET /api/expenses/summary - Resumo com Total Gasto, Gastos por Categoria e Custo Médio
router.get('/summary', (req, res) => {
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
    const generalStats = db.prepare(`
      SELECT 
        COUNT(id) as total_records,
        COALESCE(SUM(total_cost), 0) as total_expenses,
        COALESCE(AVG(unit_cost), 0) as average_unit_cost,
        COALESCE(SUM(quantity), 0) as total_items_bought
      FROM expenses
      ${dateFilter}
    `).get(...params);

    // 2. Gastos Agrupados por Categoria
    const categoryStats = db.prepare(`
      SELECT 
        category,
        COALESCE(SUM(total_cost), 0) as category_total,
        COUNT(id) as items_count
      FROM expenses
      ${dateFilter}
      GROUP BY category
      ORDER BY category_total DESC
    `).all(...params);

    res.json({
      total_expenses: Number((generalStats.total_expenses || 0).toFixed(2)),
      average_unit_cost: Number((generalStats.average_unit_cost || 0).toFixed(2)),
      total_items_bought: generalStats.total_items_bought || 0,
      total_records: generalStats.total_records || 0,
      by_category: categoryStats.map(c => ({
        category: c.category,
        total: Number(c.category_total.toFixed(2)),
        count: c.items_count,
        percentage: generalStats.total_expenses > 0 
          ? Number(((c.category_total / generalStats.total_expenses) * 100).toFixed(1))
          : 0
      }))
    });
  } catch (error) {
    console.error('Erro ao gerar resumo de gastos:', error);
    res.status(500).json({ error: 'Erro ao calcular resumo de despesas' });
  }
});

// POST /api/expenses - Registrar novo gasto
router.post('/', (req, res) => {
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
    const purchaseDate = date || new Date().toISOString().split('T')[0];
    const categoryName = category && category.trim() !== '' ? category.trim() : 'Outros';

    const stmt = db.prepare(`
      INSERT INTO expenses (date, item_name, category, quantity, unit_cost, total_cost, supplier, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      purchaseDate,
      item_name.trim(),
      categoryName,
      qty,
      unitPrice,
      totalCost,
      supplier ? supplier.trim() : '',
      notes ? notes.trim() : ''
    );

    // Replicar no SQLite Cloud
    syncToCloud(`
      INSERT INTO expenses (id, date, item_name, category, quantity, unit_cost, total_cost, supplier, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, result.lastInsertRowid, purchaseDate, item_name.trim(), categoryName, qty, unitPrice, totalCost, supplier ? supplier.trim() : '', notes ? notes.trim() : '');

    const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Erro ao cadastrar gasto:', error);
    res.status(500).json({ error: 'Erro ao registrar despesa' });
  }
});

// PUT /api/expenses/:id - Editar gasto
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { date, item_name, category, quantity, unit_cost, supplier, notes } = req.body;

    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Registro de gasto não encontrado.' });
    }

    const updatedQty = quantity !== undefined ? parseFloat(quantity) : existing.quantity;
    const updatedUnitCost = unit_cost !== undefined ? parseFloat(unit_cost) : existing.unit_cost;
    const updatedTotalCost = Number((updatedQty * updatedUnitCost).toFixed(2));

    const stmt = db.prepare(`
      UPDATE expenses 
      SET date = ?, item_name = ?, category = ?, quantity = ?, unit_cost = ?, total_cost = ?, supplier = ?, notes = ?
      WHERE id = ?
    `);

    stmt.run(
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

    // Replicar atualização no SQLite Cloud
    syncToCloud(`
      UPDATE expenses 
      SET date = ?, item_name = ?, category = ?, quantity = ?, unit_cost = ?, total_cost = ?, supplier = ?, notes = ?
      WHERE id = ?
    `, date || existing.date, item_name !== undefined ? item_name.trim() : existing.item_name, category !== undefined ? category.trim() : existing.category, updatedQty, updatedUnitCost, updatedTotalCost, supplier !== undefined ? supplier.trim() : existing.supplier, notes !== undefined ? notes.trim() : existing.notes, id);

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar gasto:', error);
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
});

// DELETE /api/expenses/:id - Excluir gasto
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);

    // Replicar exclusão no SQLite Cloud
    syncToCloud('DELETE FROM expenses WHERE id = ?', id);

    res.json({ message: 'Registro de gasto excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir gasto:', error);
    res.status(500).json({ error: 'Erro ao excluir gasto' });
  }
});

module.exports = router;
