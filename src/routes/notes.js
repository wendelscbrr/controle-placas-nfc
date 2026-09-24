const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * Retorna data e hora formatada em padrão ISO/SQL (YYYY-MM-DD HH:mm:ss) no fuso horário de Brasília
 */
function getBrasiliaTimestamp() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const timeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(now);
  return `${dateStr} ${timeStr}`;
}

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
    const nowBrasilia = getBrasiliaTimestamp();

    const result = await db.run(`
      INSERT INTO notes (title, content, author, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `, noteTitle, content.trim(), noteAuthor, nowBrasilia, nowBrasilia);

    let newNote = null;
    if (result && result.lastInsertRowid) {
      newNote = await db.get('SELECT * FROM notes WHERE id = ?', result.lastInsertRowid);
    }
    if (!newNote) {
      newNote = await db.get('SELECT * FROM notes ORDER BY id DESC LIMIT 1');
    }

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

    const nowBrasilia = getBrasiliaTimestamp();
    await db.run(`
      UPDATE notes 
      SET title = ?, content = ?, author = ?, updated_at = ?
      WHERE id = ?
    `, updatedTitle, updatedContent, updatedAuthor, nowBrasilia, id);

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
