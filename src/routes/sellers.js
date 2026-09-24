const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/sellers - Listar sócios/vendedores com métricas individuais de vendas
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const baseQuery = showAll 
      ? 'SELECT * FROM sellers ORDER BY id ASC'
      : 'SELECT * FROM sellers WHERE is_active = 1 ORDER BY id ASC';

    const sellers = await db.all(baseQuery);

    // Calcula o faturamento global da empresa para podermos descobrir a % de participação
    const globalSales = await db.get('SELECT COALESCE(SUM(total_price), 0) as total FROM sales');
    const globalTotal = globalSales ? globalSales.total || 0 : 0;

    // Enriquece cada sócio/vendedor com suas estatísticas reais
    const enrichedSellers = await Promise.all(sellers.map(async (seller) => {
      const stats = await db.get(`
        SELECT 
          COUNT(id) as sales_count,
          COALESCE(SUM(quantity), 0) as items_sold,
          COALESCE(SUM(total_price), 0) as total_sold
        FROM sales 
        WHERE seller_id = ?
      `, seller.id);

      const count = stats ? stats.sales_count || 0 : 0;
      const total = stats ? stats.total_sold || 0 : 0;
      const avgSale = count > 0 ? (total / count) : 0;
      const percentage = globalTotal > 0 ? ((total / globalTotal) * 100) : 0;

      return {
        ...seller,
        sales_count: count,
        items_sold: stats ? stats.items_sold || 0 : 0,
        total_sold: Number(total.toFixed(2)),
        average_sale: Number(avgSale.toFixed(2)),
        sales_percentage: Number(percentage.toFixed(1))
      };
    }));

    res.json(enrichedSellers);
  } catch (error) {
    console.error('Erro ao buscar sócios/vendedores:', error);
    res.status(500).json({ error: 'Erro ao buscar dados dos sócios/vendedores' });
  }
});

// POST /api/sellers - Cadastrar novo sócio ou vendedor
router.post('/', async (req, res) => {
  try {
    const { name, role } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'O nome da pessoa é obrigatório.' });
    }

    const result = await db.run(
      'INSERT INTO sellers (name, role, is_active) VALUES (?, ?, 1)',
      name.trim(),
      role ? role.trim() : 'Vendedor'
    );

    const newSeller = await db.get('SELECT * FROM sellers WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(newSeller);
  } catch (error) {
    console.error('Erro ao cadastrar vendedor:', error);
    res.status(500).json({ error: 'Erro ao cadastrar novo sócio/vendedor' });
  }
});

// PUT /api/sellers/:id - Editar dados do sócio ou vendedor
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, is_active } = req.body;

    const existing = await db.get('SELECT * FROM sellers WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Pessoa não encontrada.' });
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedRole = role !== undefined ? role.trim() : existing.role;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    await db.run(
      'UPDATE sellers SET name = ?, role = ?, is_active = ? WHERE id = ?',
      updatedName,
      updatedRole,
      updatedActive,
      id
    );

    const updatedSeller = await db.get('SELECT * FROM sellers WHERE id = ?', id);
    res.json(updatedSeller);
  } catch (error) {
    console.error('Erro ao atualizar sócio/vendedor:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

// DELETE /api/sellers/:id - Excluir ou desativar sócio/vendedor
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const salesCount = await db.get('SELECT COUNT(*) as count FROM sales WHERE seller_id = ?', id);

    if (salesCount && salesCount.count > 0) {
      // Se já houver vendas atribuídas, apenas desativamos para manter a consistência financeira
      await db.run('UPDATE sellers SET is_active = 0 WHERE id = ?', id);
      return res.json({ message: 'Vendedor desativado com sucesso para manter o histórico de vendas.' });
    } else {
      await db.run('DELETE FROM sellers WHERE id = ?', id);
      return res.json({ message: 'Vendedor removido com sucesso.' });
    }
  } catch (error) {
    console.error('Erro ao remover sócio/vendedor:', error);
    res.status(500).json({ error: 'Erro ao remover' });
  }
});

module.exports = router;
