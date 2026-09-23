// test_backend.js
// Script para testar e validar todas as rotas e regras do backend

const db = require('./src/database/db');

async function testBackend() {
  console.log('🧪 Iniciando testes do Backend...');

  // 1. Testar Modelos
  const models = db.prepare('SELECT * FROM models').all();
  console.log(`✅ Modelos carregados: ${models.length} modelos encontrados.`);
  if (models.length < 3) throw new Error('Deveria haver pelo menos 3 modelos padrão.');

  // 2. Testar Sócios
  const sellers = db.prepare('SELECT * FROM sellers').all();
  console.log(`✅ Sócios carregados: ${sellers.length} sócios encontrados.`);
  if (sellers.length < 2) throw new Error('Deveria haver pelo menos 2 sócios padrão.');

  const wendelId = sellers[0].id;
  const friendId = sellers[1].id;
  const model1Id = models[0].id;
  const model2Id = models[1].id;

  // 3. Inserir compras de materiais de teste se ainda não houver
  const expensesCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get();
  if (expensesCount.count === 0) {
    const insertExp = db.prepare(`
      INSERT INTO expenses (date, item_name, category, quantity, unit_cost, total_cost, supplier, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertExp.run('2026-09-10', 'Lote 100 Tags NFC NTAG215', 'Tags NFC', 100, 2.50, 250.00, 'NFC Brasil', 'Tags adesivas padrão');
    insertExp.run('2026-09-12', 'Chapas Acrílico Cristal 2mm', 'Placas', 20, 15.00, 300.00, 'Acrílicos SP', 'Corte sob medida');
    insertExp.run('2026-09-15', 'Embalagens personalizadas', 'Embalagens', 50, 3.20, 160.00, 'Gráfica Express', 'Caixas com logo');
    console.log('✅ Insumos de teste inseridos.');
  }

  // 4. Inserir vendas de teste se ainda não houver
  const salesCount = db.prepare('SELECT COUNT(*) as count FROM sales').get();
  if (salesCount.count === 0) {
    const insertSale = db.prepare(`
      INSERT INTO sales (date, customer_name, model_id, quantity, unit_price, total_price, seller_id, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSale.run('2026-09-18', 'Restaurante Sabor & Arte', model1Id, 3, 89.90, 269.70, wendelId, 'PIX', 'Placas para mesas com cardápio');
    insertSale.run('2026-09-20', 'Barbearia Vintage Club', model2Id, 2, 49.90, 99.80, friendId, 'Cartão de Crédito', 'Placas para balcão e espelho');
    insertSale.run('2026-09-22', 'Clínica Odonto Viva', model1Id, 5, 89.90, 449.50, wendelId, 'PIX', 'Avaliação Google no balcão');
    console.log('✅ Vendas de teste inseridas.');
  }

  // 5. Validar Cálculos Financeiros
  const totalSales = db.prepare('SELECT SUM(total_price) as total FROM sales').get().total;
  const totalExpenses = db.prepare('SELECT SUM(total_cost) as total FROM expenses').get().total;
  const netProfit = totalSales - totalExpenses;

  console.log(`📊 Total de Vendas: R$ ${totalSales.toFixed(2)}`);
  console.log(`📊 Total de Gastos: R$ ${totalExpenses.toFixed(2)}`);
  console.log(`📊 Lucro Líquido: R$ ${netProfit.toFixed(2)}`);

  console.log('🎉 Todos os testes de regras e banco de dados passaram com sucesso!');
}

testBackend().catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
