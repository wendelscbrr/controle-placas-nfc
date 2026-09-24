const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/notes - Listar todas as anotações
router.get('/', async (req, res) => {
  try {
    const notes = await db.all(`
      SELECT * FROM notes 
      ORDER BY id DESC
    `);

    res.json(notes);
  } catch (error) {
    console.error('Erro ao buscar anotações:', error);
    res.status(500).json({ error: 'Erro ao carregar anotações' });
  }
});

// POST /api/notes - Criar nova anotação
router.post('/', async (req, res) => {
  try {
    const { title, content, author } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'O conteúdo da anotação não pode ficar em branco.' });
    }

    const noteTitle = title && title.trim() !== '' ? title.trim() : 'Sem Título';
    const noteAuthor = author && author.trim() !== '' ? author.trim() : 'Geral';

    const result = await db.run(`
      INSERT INTO notes (title, content, author, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, noteTitle, content.trim(), noteAuthor);

    const newNote = await db.get('SELECT * FROM notes WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(newNote);
  } catch (error) {
    console.error('Erro ao criar anotação:', error);
    res.status(500).json({ error: 'Erro ao salvar anotação' });
  }
});

// PUT /api/notes/:id - Editar anotação existente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, author } = req.body;

    const existing = await db.get('SELECT * FROM notes WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Anotação não encontrada.' });
    }

    const updatedTitle = title !== undefined ? title.trim() : existing.title;
    const updatedContent = content !== undefined ? content.trim() : existing.content;
    const updatedAuthor = author !== undefined ? author.trim() : existing.author;

    if (!updatedContent || updatedContent === '') {
      return res.status(400).json({ error: 'O conteúdo da anotação não pode ficar em branco.' });
    }

    await db.run(`
      UPDATE notes 
      SET title = ?, content = ?, author = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, updatedTitle, updatedContent, updatedAuthor, id);

    const updatedNote = await db.get('SELECT * FROM notes WHERE id = ?', id);
    res.json(updatedNote);
  } catch (error) {
    console.error('Erro ao atualizar anotação:', error);
    res.status(500).json({ error: 'Erro ao atualizar anotação' });
  }
});

// DELETE /api/notes/:id - Excluir anotação
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM notes WHERE id = ?', id);
    res.json({ message: 'Anotação excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir anotação:', error);
    res.status(500).json({ error: 'Erro ao excluir anotação' });
  }
});

module.exports = router;
