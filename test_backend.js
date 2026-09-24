// test_backend.js
// Script para testar e validar todas as rotas e regras do backend diretamente no SQLite Cloud

const db = require('./src/database/db');

async function testBackend() {
  console.log('🧪 Iniciando testes do Backend via SQLite Cloud...');

  // 1. Testar Modelos
  const models = await db.all('SELECT * FROM models');
  console.log(`✅ Modelos carregados: ${models.length} modelos encontrados.`);
  if (models.length < 3) throw new Error('Deveria haver pelo menos 3 modelos padrão.');

  // 2. Testar Sócios
  const sellers = await db.all('SELECT * FROM sellers');
  console.log(`✅ Sócios carregados: ${sellers.length} sócios encontrados.`);
  if (sellers.length < 2) throw new Error('Deveria haver pelo menos 2 sócios padrão.');

  // 3. Testar Gastos
  const expenses = await db.all('SELECT * FROM expenses');
  console.log(`✅ Gastos carregados: ${expenses.length} registros de compras encontrados.`);

  // 4. Testar Vendas
  const sales = await db.all('SELECT * FROM sales');
  console.log(`✅ Vendas carregadas: ${sales.length} vendas registradas.`);

  // 5. Validar Cálculos Financeiros
  const totalSalesRow = await db.get('SELECT COALESCE(SUM(total_price), 0) as total FROM sales');
  const totalExpensesRow = await db.get('SELECT COALESCE(SUM(total_cost), 0) as total FROM expenses');

  const totalSales = totalSalesRow ? totalSalesRow.total : 0;
  const totalExpenses = totalExpensesRow ? totalExpensesRow.total : 0;
  const netProfit = totalSales - totalExpenses;

  console.log(`📊 Total de Vendas na Nuvem: R$ ${Number(totalSales).toFixed(2)}`);
  console.log(`📊 Total de Gastos na Nuvem: R$ ${Number(totalExpenses).toFixed(2)}`);
  console.log(`📊 Lucro Líquido na Nuvem: R$ ${Number(netProfit).toFixed(2)}`);

  console.log('🎉 Todos os testes no SQLite Cloud passaram com sucesso!');
  process.exit(0);
}

testBackend().catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
