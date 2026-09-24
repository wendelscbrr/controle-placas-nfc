// src/routes/dashboard.js
// Rotas da API para alimentar o Dashboard com Indicadores (KPIs) e Gráficos via SQLite Cloud

const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * Retorna a data atual no formato YYYY-MM-DD considerando o fuso horário de Brasília
 */
function getBrasiliaDateInfo() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
  const todayStr = formatter.format(now);
  const [year, month, day] = todayStr.split('-').map(Number);
  return { now, todayStr, year, month, day };
}

/**
 * Converte o parâmetro 'period' em um intervalo de datas (startDate e endDate)
 * baseado no fuso horário de Brasília (America/Sao_Paulo)
 */
function resolveDateRange(period, customStart, customEnd) {
  const { todayStr, year, month, day } = getBrasiliaDateInfo();

  switch (period) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr, label: 'Hoje' };

    case '7days': {
      const past = new Date(year, month - 1, day);
      past.setDate(past.getDate() - 6);
      const startStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
      return { startDate: startStr, endDate: todayStr, label: 'Últimos 7 dias' };
    }

    case 'week': {
      // Começo da semana atual (segunda-feira) sem mutação in-place de objeto
      const current = new Date(year, month - 1, day);
      const dayOfWeek = current.getDay(); // 0: domingo, 1: segunda...
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      current.setDate(current.getDate() + diff);
      const startStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      return { startDate: startStr, endDate: todayStr, label: 'Esta Semana' };
    }

    case 'month': {
      const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
      return { startDate: startStr, endDate: todayStr, label: 'Este Mês' };
    }

    case 'year': {
      const startStr = `${year}-01-01`;
      return { startDate: startStr, endDate: todayStr, label: 'Este Ano' };
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
router.get('/', async (req, res) => {
  try {
    // Sincroniza vendas pendentes cuja data já chegou (Horário de Brasília)
    const { todayStr } = getBrasiliaDateInfo();
    await db.run("UPDATE sales SET status = 'pago' WHERE status = 'pendente' AND date <= ?", todayStr);

    const { period, startDate: customStart, endDate: customEnd } = req.query;
    const { startDate, endDate, label } = resolveDateRange(period, customStart, customEnd);

    // Cláusulas WHERE para Vendas e Gastos
    let salesWhere = 'WHERE 1=1';
    let expensesWhere = 'WHERE 1=1';
    const salesParams = [];
    const expensesParams = [];

    if (startDate) {
      salesWhere += ' AND s.date >= ?';
      expensesWhere += ' AND date >= ?';
      salesParams.push(startDate);
      expensesParams.push(startDate);
    }
    if (endDate) {
      salesWhere += ' AND s.date <= ?';
      expensesWhere += ' AND date <= ?';
      salesParams.push(endDate);
      expensesParams.push(endDate);
    }

    const paidSalesWhere = `${salesWhere} AND COALESCE(s.status, 'pago') = 'pago'`;
    const pendingSalesWhere = `${salesWhere} AND s.status = 'pendente'`;

    const isYearOrAll = period === 'year' || period === 'all';
    const salesDateFormatSql = isYearOrAll ? "strftime('%Y-%m', s.date)" : 's.date';
    const expensesDateFormatSql = isYearOrAll ? "strftime('%Y-%m', date)" : 'date';

    // Executa as consultas do Dashboard em paralelo para máxima performance
    const [
      salesSummary,
      pendingSummary,
      expensesSummary,
      bestModel,
      bestSeller,
      sellersShare,
      modelsDistribution,
      salesTimeline,
      expensesTimeline
    ] = await Promise.all([
      // 1. Resumo de Vendas Pagas (Faturamento Efetivo)
      db.get(`
        SELECT 
          COUNT(s.id) as total_sales_count,
          COALESCE(SUM(s.quantity), 0) as total_plaques_sold,
          COALESCE(SUM(s.total_price), 0) as total_revenue
        FROM sales s
        ${paidSalesWhere}
      `, salesParams),

      // 1B. Resumo de Vendas Pendentes (A Receber / Não Somadas no Faturamento)
      db.get(`
        SELECT 
          COUNT(s.id) as pending_sales_count,
          COALESCE(SUM(s.quantity), 0) as pending_plaques,
          COALESCE(SUM(s.total_price), 0) as pending_revenue
        FROM sales s
        ${pendingSalesWhere}
      `, salesParams),

      // 2. Resumo de Gastos
      db.get(`
        SELECT 
          COALESCE(SUM(total_cost), 0) as total_expenses,
          COALESCE(SUM(quantity), 0) as total_materials_bought
        FROM expenses
        ${expensesWhere}
      `, expensesParams),

      // 3. Melhor Modelo (Apenas Vendas Pagas)
      db.get(`
        SELECT 
          m.name as model_name,
          SUM(s.quantity) as total_quantity,
          SUM(s.total_price) as total_amount
        FROM sales s
        JOIN models m ON s.model_id = m.id
        ${paidSalesWhere}
        GROUP BY s.model_id
        ORDER BY total_quantity DESC, total_amount DESC
        LIMIT 1
      `, salesParams),

      // 4. Melhor Vendedor (Apenas Vendas Pagas)
      db.get(`
        SELECT 
          sel.name as seller_name,
          COUNT(s.id) as sales_count,
          SUM(s.quantity) as plaques_sold,
          SUM(s.total_price) as total_amount
        FROM sales s
        JOIN sellers sel ON s.seller_id = sel.id
        ${paidSalesWhere}
        GROUP BY s.seller_id
        ORDER BY total_amount DESC
        LIMIT 1
      `, salesParams),

      // 5. Participação de Cada Sócio / Vendedor (Apenas Vendas Pagas)
      db.all(`
        SELECT 
          sel.id,
          sel.name,
          COUNT(s.id) as sales_count,
          COALESCE(SUM(s.quantity), 0) as plaques_sold,
          COALESCE(SUM(s.total_price), 0) as total_amount
        FROM sellers sel
        LEFT JOIN sales s ON sel.id = s.seller_id 
          AND COALESCE(s.status, 'pago') = 'pago'
          ${startDate ? 'AND s.date >= ?' : ''} 
          ${endDate ? 'AND s.date <= ?' : ''}
        WHERE sel.is_active = 1
        GROUP BY sel.id
        ORDER BY total_amount DESC
      `, salesParams),

      // 6. Distribuição por Modelo (Apenas Vendas Pagas)
      db.all(`
        SELECT 
          m.name,
          COALESCE(SUM(s.quantity), 0) as plaques_sold,
          COALESCE(SUM(s.total_price), 0) as total_revenue
        FROM models m
        LEFT JOIN sales s ON m.id = s.model_id
          AND COALESCE(s.status, 'pago') = 'pago'
          ${startDate ? 'AND s.date >= ?' : ''} 
          ${endDate ? 'AND s.date <= ?' : ''}
        WHERE m.is_active = 1
        GROUP BY m.id
        ORDER BY total_revenue DESC
      `, salesParams),

      // 7. Timeline de Vendas (Apenas Vendas Pagas)
      db.all(`
        SELECT 
          ${salesDateFormatSql} as time_point,
          COALESCE(SUM(s.total_price), 0) as sales_total
        FROM sales s
        ${paidSalesWhere}
        GROUP BY time_point
        ORDER BY time_point ASC
      `, salesParams),

      // 8. Timeline de Gastos
      db.all(`
        SELECT 
          ${expensesDateFormatSql} as time_point,
          COALESCE(SUM(total_cost), 0) as expenses_total
        FROM expenses
        ${expensesWhere}
        GROUP BY time_point
        ORDER BY time_point ASC
      `, expensesParams)
    ]);

    const totalRevenue = salesSummary ? salesSummary.total_revenue || 0 : 0;
    const plaquesSold = salesSummary ? salesSummary.total_plaques_sold || 0 : 0;
    const salesCount = salesSummary ? salesSummary.total_sales_count || 0 : 0;
    const totalExpenses = expensesSummary ? expensesSummary.total_expenses || 0 : 0;

    const pendingRevenue = pendingSummary ? pendingSummary.pending_revenue || 0 : 0;
    const pendingCount = pendingSummary ? pendingSummary.pending_sales_count || 0 : 0;
    const pendingPlaques = pendingSummary ? pendingSummary.pending_plaques || 0 : 0;

    const averageTicketPerSale = salesCount > 0 ? (totalRevenue / salesCount) : 0;
    const averageTicketPerUnit = plaquesSold > 0 ? (totalRevenue / plaquesSold) : 0;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

    const sellersWithPercentages = (sellersShare || []).map(s => ({
      ...s,
      percentage: totalRevenue > 0 ? Number(((s.total_amount / totalRevenue) * 100).toFixed(1)) : 0
    }));

    // Unifica os pontos de tempo para o gráfico
    const timelineMap = {};
    (salesTimeline || []).forEach(s => {
      timelineMap[s.time_point] = { time_point: s.time_point, sales: s.sales_total, expenses: 0 };
    });
    (expensesTimeline || []).forEach(e => {
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
        pending_revenue: Number(pendingRevenue.toFixed(2)),
        pending_count: pendingCount,
        pending_plaques: pendingPlaques,
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
        models_distribution: modelsDistribution || []
      }
    });
  } catch (error) {
    console.error('Erro ao gerar dados do dashboard:', error);
    res.status(500).json({ error: 'Erro ao calcular indicadores do dashboard' });
  }
});

module.exports = router;
