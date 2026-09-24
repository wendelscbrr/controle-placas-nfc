const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { syncToCloud } = require('../database/cloud');

// GET /api/sellers - Listar sócios/vendedores com métricas individuais de vendas
router.get('/', (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const baseQuery = showAll 
      ? 'SELECT * FROM sellers ORDER BY id ASC'
      : 'SELECT * FROM sellers WHERE is_active = 1 ORDER BY id ASC';

    const sellers = db.prepare(baseQuery).all();

    // Calcula o faturamento global da empresa para podermos descobrir a % de participação
    const globalSales = db.prepare('SELECT COALESCE(SUM(total_price), 0) as total FROM sales').get();
    const globalTotal = globalSales.total || 0;

    // Enriquece cada sócio/vendedor com suas estatísticas reais
    const enrichedSellers = sellers.map(seller => {
      const stats = db.prepare(`
        SELECT 
          COUNT(id) as sales_count,
          COALESCE(SUM(quantity), 0) as items_sold,
          COALESCE(SUM(total_price), 0) as total_sold
        FROM sales 
        WHERE seller_id = ?
      `).get(seller.id);

      const count = stats.sales_count || 0;
      const total = stats.total_sold || 0;
      const avgSale = count > 0 ? (total / count) : 0;
      const percentage = globalTotal > 0 ? ((total / globalTotal) * 100) : 0;

      return {
        ...seller,
        sales_count: count,
        items_sold: stats.items_sold || 0,
        total_sold: Number(total.toFixed(2)),
        average_sale: Number(avgSale.toFixed(2)),
        sales_percentage: Number(percentage.toFixed(1))
      };
    });

    res.json(enrichedSellers);
  } catch (error) {
    console.error('Erro ao buscar sócios/vendedores:', error);
    res.status(500).json({ error: 'Erro ao buscar dados dos sócios/vendedores' });
  }
});

// POST /api/sellers - Cadastrar novo sócio ou vendedor
router.post('/', (req, res) => {
  try {
    const { name, role } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'O nome da pessoa é obrigatório.' });
    }

    const stmt = db.prepare(`
      INSERT INTO sellers (name, role) VALUES (?, ?)
    `);

    const result = stmt.run(name.trim(), role ? role.trim() : 'Vendedor');

    // Replicar no SQLite Cloud
    syncToCloud(`
      INSERT INTO sellers (id, name, role, is_active)
      VALUES (?, ?, ?, 1)
    `, result.lastInsertRowid, name.trim(), role ? role.trim() : 'Vendedor');

    const newSeller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newSeller);
  } catch (error) {
    console.error('Erro ao cadastrar vendedor:', error);
    res.status(500).json({ error: 'Erro ao cadastrar novo sócio/vendedor' });
  }
});

// PUT /api/sellers/:id - Editar dados do sócio ou vendedor
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, is_active } = req.body;

    const existing = db.prepare('SELECT * FROM sellers WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Pessoa não encontrada.' });
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedRole = role !== undefined ? role.trim() : existing.role;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    const stmt = db.prepare(`
      UPDATE sellers 
      SET name = ?, role = ?, is_active = ?
      WHERE id = ?
    `);

    stmt.run(updatedName, updatedRole, updatedActive, id);

    // Replicar no SQLite Cloud
    syncToCloud(`
      UPDATE sellers 
      SET name = ?, role = ?, is_active = ?
      WHERE id = ?
    `, updatedName, updatedRole, updatedActive, id);

    const updatedSeller = db.prepare('SELECT * FROM sellers WHERE id = ?').get(id);
    res.json(updatedSeller);
  } catch (error) {
    console.error('Erro ao atualizar sócio/vendedor:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

// DELETE /api/sellers/:id - Excluir ou desativar sócio/vendedor
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales WHERE seller_id = ?').get(id);

    if (salesCount.count > 0) {
      // Se já houver vendas atribuídas, apenas desativamos para manter a consistência financeira
      db.prepare('UPDATE sellers SET is_active = 0 WHERE id = ?').run(id);
      syncToCloud('UPDATE sellers SET is_active = 0 WHERE id = ?', id);
      return res.json({ message: 'Vendedor desativado com sucesso para manter o histórico de vendas.' });
    } else {
      db.prepare('DELETE FROM sellers WHERE id = ?').run(id);
      syncToCloud('DELETE FROM sellers WHERE id = ?', id);
      return res.json({ message: 'Vendedor removido com sucesso.' });
    }
  } catch (error) {
    console.error('Erro ao remover sócio/vendedor:', error);
    res.status(500).json({ error: 'Erro ao remover' });
  }
});

module.exports = router;
