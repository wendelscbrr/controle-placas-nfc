// src/database/cloud.js
// Conector opcional para SQLite Cloud (sqlitecloud.io)
// Permite manter o banco de dados na nuvem permanentemente independente de deploys no Render

const { Database } = require('@sqlitecloud/drivers');

let cloudDb = null;
let connectionTested = false;
let lastStatus = { active: false, message: 'SQLite Cloud não configurado.' };

/**
 * Obtém ou inicializa a instância do SQLite Cloud
 */
function getCloudDatabase() {
  const cloudUrl = process.env.SQLITE_CLOUD_URL || process.env.DATABASE_URL;
  if (!cloudUrl || !cloudUrl.startsWith('sqlitecloud://')) {
    return null;
  }

  if (!cloudDb) {
    try {
      cloudDb = new Database(cloudUrl);
    } catch (err) {
      console.error('❌ Erro ao instanciar SQLite Cloud:', err);
    }
  }

  return cloudDb;
}

/**
 * Testa a conexão com o SQLite Cloud e inicializa as tabelas se necessário
 */
async function checkCloudStatus() {
  const cloudUrl = process.env.SQLITE_CLOUD_URL || process.env.DATABASE_URL;
  if (!cloudUrl || !cloudUrl.startsWith('sqlitecloud://')) {
    return {
      active: false,
      mode: 'local',
      message: 'Operando em modo SQLite Local nativo (SQLITE_CLOUD_URL não detectada).'
    };
  }

  try {
    const db = getCloudDatabase();
    if (!db) {
      return { active: false, mode: 'error', message: 'Falha ao instanciar driver do SQLite Cloud.' };
    }

    // Ping para validar credenciais e conexão
    await db.sql('SELECT 1 as ping');

    // Inicializa as tabelas básicas na nuvem caso o banco esteja novo
    await db.sql(`
      CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        base_price REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.sql(`
      CREATE TABLE IF NOT EXISTS sellers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'Sócio',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.sql(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        item_name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        supplier TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.sql(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        model_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        seller_id INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT DEFAULT 'pago',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.sql(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT NOT NULL,
        author TEXT DEFAULT 'Geral',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    lastStatus = {
      active: true,
      mode: 'cloud',
      message: '☁ Conectado com sucesso ao SQLite Cloud! Dados sincronizados na nuvem.'
    };

    return lastStatus;
  } catch (error) {
    lastStatus = {
      active: false,
      mode: 'error',
      message: `Erro ao conectar no SQLite Cloud: ${error.message}`
    };
    return lastStatus;
  }
}

/**
 * Envia uma instrução SQL de escrita diretamente para o SQLite Cloud
 */
async function syncToCloud(sql, ...params) {
  const db = getCloudDatabase();
  if (!db) return;

  try {
    await db.sql(sql, ...params);
    console.log('☁ [SQLite Cloud] Atualização sincronizada na nuvem com sucesso.');
  } catch (err) {
    console.error('❌ [SQLite Cloud] Erro ao sincronizar instrução:', err.message);
  }
}

/**
 * Sincroniza os registros locais com o SQLite Cloud na inicialização
 */
async function syncLocalWithCloud(localDb) {
  const cloudUrl = process.env.SQLITE_CLOUD_URL || process.env.DATABASE_URL;
  if (!cloudUrl || !cloudUrl.startsWith('sqlitecloud://')) return;

  try {
    const cloud = getCloudDatabase();
    if (!cloud) return;

    // Sincroniza Modelos
    const localModels = localDb.prepare('SELECT * FROM models').all();
    for (const m of localModels) {
      await cloud.sql(`
        INSERT OR IGNORE INTO models (id, name, description, base_price, is_active)
        VALUES (?, ?, ?, ?, ?)
      `, m.id, m.name, m.description || '', m.base_price, m.is_active);
    }

    // Sincroniza Sócios
    const localSellers = localDb.prepare('SELECT * FROM sellers').all();
    for (const s of localSellers) {
      await cloud.sql(`
        INSERT OR IGNORE INTO sellers (id, name, role, is_active)
        VALUES (?, ?, ?, ?)
      `, s.id, s.name, s.role || 'Sócio', s.is_active);
    }

    // Sincroniza Gastos
    const localExpenses = localDb.prepare('SELECT * FROM expenses').all();
    for (const e of localExpenses) {
      await cloud.sql(`
        INSERT OR IGNORE INTO expenses (id, date, item_name, category, quantity, unit_cost, total_cost, supplier, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, e.id, e.date, e.item_name, e.category, e.quantity, e.unit_cost, e.total_cost, e.supplier || '', e.notes || '');
    }

    // Sincroniza Vendas
    const localSales = localDb.prepare('SELECT * FROM sales').all();
    for (const sale of localSales) {
      await cloud.sql(`
        INSERT OR IGNORE INTO sales (id, date, customer_name, model_id, quantity, unit_price, total_price, seller_id, payment_method, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, sale.id, sale.date, sale.customer_name, sale.model_id, sale.quantity, sale.unit_price, sale.total_price, sale.seller_id, sale.payment_method, sale.status || 'pago', sale.notes || '');
    }

    // Sincroniza Anotações
    const localNotes = localDb.prepare('SELECT * FROM notes').all();
    for (const n of localNotes) {
      await cloud.sql(`
        INSERT OR IGNORE INTO notes (id, title, content, author)
        VALUES (?, ?, ?, ?)
      `, n.id, n.title || '', n.content, n.author || 'Geral');
    }

    console.log(`☁ [SQLite Cloud] Sincronização inicial concluída com sucesso!`);
  } catch (err) {
    console.error(`❌ [SQLite Cloud] Erro na sincronização inicial:`, err.message);
  }
}

module.exports = {
  getCloudDatabase,
  checkCloudStatus,
  syncToCloud,
  syncLocalWithCloud
};
