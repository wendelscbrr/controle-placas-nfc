// src/routes/reports.js
// Rotas da API para relatórios consolidados por Dia, Semana, Mês e Ano via SQLite Cloud

const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/reports/sales - Relatórios de vendas agrupados
router.get('/sales', async (req, res) => {
  try {
    const { groupBy = 'month', startDate, endDate } = req.query;

    let dateFormat;
    switch (groupBy) {
      case 'day':
        dateFormat = "strftime('%Y-%m-%d', date)";
        break;
      case 'week':
        // No SQLite, %W é a semana do ano (00 a 53)
        dateFormat = "strftime('%Y-W%W', date)";
        break;
      case 'year':
        dateFormat = "strftime('%Y', date)";
        break;
      case 'month':
      default:
        dateFormat = "strftime('%Y-%m', date)";
        break;
    }

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (startDate) {
      whereClause += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND date <= ?';
      params.push(endDate);
    }

    const query = `
      SELECT 
        ${dateFormat} as period_group,
        COUNT(id) as total_sales,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(total_price), 0) as total_amount
      FROM sales
      ${whereClause}
      GROUP BY period_group
      ORDER BY period_group DESC
    `;

    const records = await db.all(query, params);

    // Adiciona o cálculo de ticket médio unitário e variação com o período anterior
    const enrichedRecords = records.map((record, index) => {
      const avgPerUnit = record.total_quantity > 0 
        ? Number((record.total_amount / record.total_quantity).toFixed(2)) 
        : 0;

      const previous = records[index + 1];
      let diffPercent = null;

      if (previous && previous.total_amount > 0) {
        const diff = ((record.total_amount - previous.total_amount) / previous.total_amount) * 100;
        diffPercent = Number(diff.toFixed(1));
      }

      return {
        period: record.period_group,
        total_sales: record.total_sales,
        total_quantity: record.total_quantity,
        total_amount: Number(record.total_amount.toFixed(2)),
        average_per_unit: avgPerUnit,
        growth_vs_previous: diffPercent
      };
    });

    res.json({
      group_by: groupBy,
      total_periods: enrichedRecords.length,
      data: enrichedRecords
    });
  } catch (error) {
    console.error('Erro ao gerar relatórios:', error);
    res.status(500).json({ error: 'Erro ao gerar relatórios de vendas' });
  }
});

// GET /api/reports/export/csv - Download de todas as vendas em CSV (compatível com Excel)
router.get('/export/csv', async (req, res) => {
  try {
    const sales = await db.all(`
      SELECT 
        s.date,
        s.customer_name,
        m.name AS model_name,
        s.quantity,
        s.unit_price,
        s.total_price,
        sel.name AS seller_name,
        s.payment_method,
        COALESCE(s.status, 'pago') AS status,
        s.notes
      FROM sales s
      LEFT JOIN models m ON s.model_id = m.id
      LEFT JOIN sellers sel ON s.seller_id = sel.id
      ORDER BY s.date DESC
    `);

    // Cabeçalho CSV com BOM UTF-8 para o Excel abrir sem erro de acentos
    let csvContent = '\uFEFFData;Cliente;Modelo;Quantidade;Valor Unitário (R$);Total (R$);Vendedor;Pagamento;Status;Observações\n';

    sales.forEach(sale => {
      const line = [
        sale.date,
        `"${(sale.customer_name || '').replace(/"/g, '""')}"`,
        `"${(sale.model_name || '').replace(/"/g, '""')}"`,
        sale.quantity,
        sale.unit_price.toFixed(2).replace('.', ','),
        sale.total_price.toFixed(2).replace('.', ','),
        `"${(sale.seller_name || '').replace(/"/g, '""')}"`,
        `"${(sale.payment_method || '').replace(/"/g, '""')}"`,
        sale.status.toUpperCase(),
        `"${(sale.notes || '').replace(/"/g, '""')}"`
      ].join(';');
      csvContent += line + '\n';
    });

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vendas_nfc_${dateStr}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Erro ao exportar CSV:', error);
    res.status(500).json({ error: 'Erro ao gerar arquivo CSV' });
  }
});

// GET /api/reports/export/backup - Backup completo do banco de dados em formato JSON
router.get('/export/backup', async (req, res) => {
  try {
    const [models, sellers, expenses, sales, notes] = await Promise.all([
      db.all('SELECT * FROM models'),
      db.all('SELECT * FROM sellers'),
      db.all('SELECT * FROM expenses'),
      db.all('SELECT * FROM sales'),
      db.all('SELECT * FROM notes')
    ]);

    const backup = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'SQLite Cloud',
      data: {
        models,
        sellers,
        expenses,
        sales,
        notes
      }
    };

    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_gestao_nfc_${dateStr}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    res.status(500).json({ error: 'Erro ao gerar arquivo de backup' });
  }
});

module.exports = router;
