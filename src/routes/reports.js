// src/routes/reports.js
// Rotas da API para relatórios consolidados por Dia, Semana, Mês e Ano

const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/reports/sales - Relatórios de vendas agrupados
router.get('/sales', (req, res) => {
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

    const records = db.prepare(query).all(...params);

    // Adiciona o cálculo de ticket médio unitário e variação com o período anterior
    const enrichedRecords = records.map((record, index) => {
      const avgPerUnit = record.total_quantity > 0 
        ? Number((record.total_amount / record.total_quantity).toFixed(2)) 
        : 0;

      // Como a lista está ordenada decrescente, o próximo item (index + 1) é o período anterior cronológico
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

module.exports = router;
