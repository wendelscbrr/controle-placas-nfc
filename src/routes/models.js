const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/models - Listar todos os modelos de placas
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const query = showAll
      ? 'SELECT * FROM models ORDER BY id DESC'
      : 'SELECT * FROM models WHERE is_active = 1 ORDER BY name ASC';

    const models = await db.all(query);
    res.json(models);
  } catch (error) {
    console.error('Erro ao buscar modelos:', error);
    res.status(500).json({ error: 'Erro ao buscar modelos de placas' });
  }
});

// POST /api/models - Cadastrar novo modelo
router.post('/', async (req, res) => {
  try {
    const { name, description, base_price } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'O nome do modelo é obrigatório.' });
    }

    const price = parseFloat(base_price);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Preço base inválido.' });
    }

    const result = await db.run(
      'INSERT INTO models (name, description, base_price) VALUES (?, ?, ?)',
      name.trim(),
      description ? description.trim() : '',
      price
    );

    const newModel = await db.get('SELECT * FROM models WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(newModel);
  } catch (error) {
    console.error('Erro ao cadastrar modelo:', error);
    res.status(500).json({ error: 'Erro ao salvar novo modelo de placa' });
  }
});

// PUT /api/models/:id - Editar modelo existente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, base_price, is_active } = req.body;

    const existing = await db.get('SELECT * FROM models WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Modelo não encontrado.' });
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;
    const updatedPrice = base_price !== undefined ? parseFloat(base_price) : existing.base_price;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    await db.run(
      'UPDATE models SET name = ?, description = ?, base_price = ?, is_active = ? WHERE id = ?',
      updatedName,
      updatedDesc,
      updatedPrice,
      updatedActive,
      id
    );

    const updatedModel = await db.get('SELECT * FROM models WHERE id = ?', id);
    res.json(updatedModel);
  } catch (error) {
    console.error('Erro ao atualizar modelo:', error);
    res.status(500).json({ error: 'Erro ao atualizar modelo de placa' });
  }
});

// DELETE /api/models/:id - Desativar ou excluir modelo
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica se há vendas vinculadas a este modelo
    const salesCount = await db.get('SELECT COUNT(*) as count FROM sales WHERE model_id = ?', id);

    if (salesCount && salesCount.count > 0) {
      // Se houver histórico de vendas, apenas desativamos (Soft Delete) para manter a integridade dos relatórios passados
      await db.run('UPDATE models SET is_active = 0 WHERE id = ?', id);
      return res.json({ message: 'Modelo desativado com sucesso para preservar o histórico de vendas.' });
    } else {
      // Se nunca foi vendido, pode ser removido fisicamente
      await db.run('DELETE FROM models WHERE id = ?', id);
      return res.json({ message: 'Modelo excluído com sucesso.' });
    }
  } catch (error) {
    console.error('Erro ao excluir modelo:', error);
    res.status(500).json({ error: 'Erro ao remover modelo' });
  }
});

module.exports = router;
