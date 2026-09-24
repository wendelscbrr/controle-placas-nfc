// src/routes/dashboard.js
// Rotas da API para alimentar o Dashboard com Indicadores (KPIs) e Gráficos

const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * Converte o parâmetro 'period' em um intervalo de datas (startDate e endDate)
 */
function resolveDateRange(period, customStart, customEnd) {
  const now = new Date();
  const format = (d) => d.toISOString().split('T')[0];

  const todayStr = format(now);

  switch (period) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr, label: 'Hoje' };

    case '7days': {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      return { startDate: format(past), endDate: todayStr, label: 'Últimos 7 dias' };
    }

    case 'week': {
      // Começo da semana atual (segunda-feira)
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.setDate(diff));
      return { startDate: format(startOfWeek), endDate: todayStr, label: 'Esta Semana' };
    }

    case 'month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: format(startOfMonth), endDate: todayStr, label: 'Este Mês' };
    }

    case 'year': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { startDate: format(startOfYear), endDate: todayStr, label: 'Este Ano' };
    }

    case 'custom':
      return { 
        startDate: customStart || '2000-01-01', 
        endDate: customEnd || todayStr, 
        label: 'Período Personalizado' 
      };

    case 'all':
    default:
      return { startDate: null, endDate: null, label: 'Todo o Período' };
  }
}

// GET /api/dashboard - Indicadores consolidados e dados para gráficos
router.get('/', (req, res) => {
  try {
    // Sincroniza vendas pendentes cuja data já chegou
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    db.prepare("UPDATE sales SET status = 'pago' WHERE status = 'pendente' AND date <= ?").run(todayStr);

    const { period, startDate: customStart, endDate: customEnd } = req.query;
    const { startDate, endDate, label } = resolveDateRange(period, customStart, customEnd);

    // Cláusulas WHERE para Vendas e Gastos
    let salesWhere = 'WHERE 1=1';
    let expensesWhere = 'WHERE 1=1';
    const salesParams = [];
    const expensesParams = [];

    if (startDate) {
      salesWhere += ' AND date >= ?';
      expensesWhere += ' AND date >= ?';
      salesParams.push(startDate);
      expensesParams.push(startDate);
    }
    if (endDate) {
      salesWhere += ' AND date <= ?';
      expensesWhere += ' AND date <= ?';
      salesParams.push(endDate);
      expensesParams.push(endDate);
    }

    // 1. Métricas de Vendas (Total Vendido, Quantidade de Placas, Total de Transações)
    const salesSummary = db.prepare(`
      SELECT 
        COUNT(id) as total_sales_count,
        COALESCE(SUM(quantity), 0) as total_plaques_sold,
        COALESCE(SUM(total_price), 0) as total_revenue
      FROM sales
      ${salesWhere}
    `).get(...salesParams);

    const totalRevenue = salesSummary.total_revenue || 0;
    const plaquesSold = salesSummary.total_plaques_sold || 0;
    const salesCount = salesSummary.total_sales_count || 0;

    // Ticket Médio por Venda e por Unidade de Placa
    const averageTicketPerSale = salesCount > 0 ? (totalRevenue / salesCount) : 0;
    const averageTicketPerUnit = plaquesSold > 0 ? (totalRevenue / plaquesSold) : 0;

    // 2. Métricas de Gastos com Materiais
    const expensesSummary = db.prepare(`
      SELECT 
        COALESCE(SUM(total_cost), 0) as total_expenses,
        COALESCE(SUM(quantity), 0) as total_materials_bought
      FROM expenses
      ${expensesWhere}
    `).get(...expensesParams);

    const totalExpenses = expensesSummary.total_expenses || 0;

    // 3. Lucro Líquido Estimado = Faturamento Total - Gastos com Materiais
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

    // 4. Modelo de Placa Mais Vendido no Período
    const bestModel = db.prepare(`
      SELECT 
        m.name as model_name,
        SUM(s.quantity) as total_quantity,
        SUM(s.total_price) as total_amount
      FROM sales s
      JOIN models m ON s.model_id = m.id
      ${salesWhere}
      GROUP BY s.model_id
      ORDER BY total_quantity DESC, total_amount DESC
      LIMIT 1
    `).get(...salesParams);

    // 5. Melhor Vendedor / Sócio no Período
    const bestSeller = db.prepare(`
      SELECT 
        sel.name as seller_name,
        COUNT(s.id) as sales_count,
        SUM(s.quantity) as plaques_sold,
        SUM(s.total_price) as total_amount
      FROM sales s
      JOIN sellers sel ON s.seller_id = sel.id
      ${salesWhere}
      GROUP BY s.seller_id
      ORDER BY total_amount DESC
      LIMIT 1
    `).get(...salesParams);

    // 6. Participação de Cada Sócio / Vendedor no Período
    const sellersShare = db.prepare(`
      SELECT 
        sel.id,
        sel.name,
        COUNT(s.id) as sales_count,
        COALESCE(SUM(s.quantity), 0) as plaques_sold,
        COALESCE(SUM(s.total_price), 0) as total_amount
      FROM sellers sel
      LEFT JOIN sales s ON sel.id = s.seller_id 
        ${startDate ? 'AND s.date >= ?' : ''} 
        ${endDate ? 'AND s.date <= ?' : ''}
      WHERE sel.is_active = 1
      GROUP BY sel.id
      ORDER BY total_amount DESC
    `).all(...salesParams);

    const sellersWithPercentages = sellersShare.map(s => ({
      ...s,
      percentage: totalRevenue > 0 ? Number(((s.total_amount / totalRevenue) * 100).toFixed(1)) : 0
    }));

    // 7. Distribuição de Vendas por Modelo
    const modelsDistribution = db.prepare(`
      SELECT 
        m.name,
        COALESCE(SUM(s.quantity), 0) as plaques_sold,
        COALESCE(SUM(s.total_price), 0) as total_revenue
      FROM models m
      LEFT JOIN sales s ON m.id = s.model_id
        ${startDate ? 'AND s.date >= ?' : ''} 
        ${endDate ? 'AND s.date <= ?' : ''}
      WHERE m.is_active = 1
      GROUP BY m.id
      ORDER BY total_revenue DESC
    `).all(...salesParams);

    // 8. Histórico por data para gráficos de linha/barra (Vendas vs Gastos)
    // Agrupa por dia para períodos curtos ou por mês se for ano/completo
    const isYearOrAll = period === 'year' || period === 'all';
    const dateFormatSql = isYearOrAll ? "strftime('%Y-%m', date)" : 'date';

    const salesTimeline = db.prepare(`
      SELECT 
        ${dateFormatSql} as time_point,
        COALESCE(SUM(total_price), 0) as sales_total
      FROM sales
      ${salesWhere}
      GROUP BY time_point
      ORDER BY time_point ASC
    `).all(...salesParams);

    const expensesTimeline = db.prepare(`
      SELECT 
        ${dateFormatSql} as time_point,
        COALESCE(SUM(total_cost), 0) as expenses_total
      FROM expenses
      ${expensesWhere}
      GROUP BY time_point
      ORDER BY time_point ASC
    `).all(...expensesParams);

    // Unifica os pontos de tempo para o gráfico
    const timelineMap = {};
    salesTimeline.forEach(s => {
      timelineMap[s.time_point] = { time_point: s.time_point, sales: s.sales_total, expenses: 0 };
    });
    expensesTimeline.forEach(e => {
      if (!timelineMap[e.time_point]) {
        timelineMap[e.time_point] = { time_point: e.time_point, sales: 0, expenses: e.expenses_total };
      } else {
        timelineMap[e.time_point].expenses = e.expenses_total;
      }
    });

    const timeline = Object.values(timelineMap).sort((a, b) => a.time_point.localeCompare(b.time_point));

    res.json({
      period_label: label,
      startDate,
      endDate,
      kpis: {
        total_revenue: Number(totalRevenue.toFixed(2)),
        plaques_sold: plaquesSold,
        sales_count: salesCount,
        average_ticket_sale: Number(averageTicketPerSale.toFixed(2)),
        average_ticket_unit: Number(averageTicketPerUnit.toFixed(2)),
        total_expenses: Number(totalExpenses.toFixed(2)),
        net_profit: Number(netProfit.toFixed(2)),
        profit_margin: Number(profitMargin.toFixed(1)),
        best_model: bestModel ? {
          name: bestModel.model_name,
          units: bestModel.total_quantity,
          amount: Number(bestModel.total_amount.toFixed(2))
        } : null,
        best_seller: bestSeller ? {
          name: bestSeller.seller_name,
          sales_count: bestSeller.sales_count,
          amount: Number(bestSeller.total_amount.toFixed(2))
        } : null
      },
      charts: {
        timeline,
        sellers_share: sellersWithPercentages,
        models_distribution: modelsDistribution
      }
    });
  } catch (error) {
    console.error('Erro ao gerar dados do dashboard:', error);
    res.status(500).json({ error: 'Erro ao calcular indicadores do dashboard' });
  }
});

module.exports = router;
