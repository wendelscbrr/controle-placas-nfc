// src/database/db.js
// Conexão e inicialização do banco de dados SQLite nativo (node:sqlite)

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

// O arquivo do banco de dados será criado na raiz do projeto: gestao_nfc.db
const DB_PATH = path.resolve(__dirname, '../../gestao_nfc.db');
const db = new DatabaseSync(DB_PATH);

/**
 * Inicializa a estrutura das tabelas relacionais e insere os dados padrão iniciais.
 * Executado automaticamente na subida do servidor.
 */
function initDatabase() {
  // Ativa suporte a chaves estrangeiras (integridade referencial no SQLite)
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Tabela de Modelos de Placas NFC
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      base_price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabela de Sócios e Vendedores
  db.exec(`
    CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Sócio',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Tabela de Gastos e Materiais
  db.exec(`
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

  // 4. Tabela de Registro de Vendas
  db.exec(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (model_id) REFERENCES models (id),
      FOREIGN KEY (seller_id) REFERENCES sellers (id)
    );
  `);

  // Migração segura: adiciona a coluna status caso o banco já tenha sido criado anteriormente
  try {
    db.exec("ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'pago';");
    console.log("✔ Migração: coluna 'status' adicionada com sucesso à tabela de vendas.");
  } catch (e) {
    // A coluna já existe no banco, prossegue normalmente
  }

  // 5. Tabela de Anotações dos Sócios
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT NOT NULL,
      author TEXT DEFAULT 'Geral',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Inserção dos dados iniciais caso as tabelas estejam vazias (Seeds)
  seedInitialData();
}

/**
 * Popula os 3 modelos de placas iniciais e os 2 sócios solicitados no projeto.
 */
function seedInitialData() {
  // Verifica se já existem modelos
  const countModels = db.prepare('SELECT COUNT(*) as count FROM models').get();
  if (countModels.count === 0) {
    const insertModel = db.prepare(`
      INSERT INTO models (name, description, base_price) VALUES (?, ?, ?)
    `);

    insertModel.run('Placa NFC Acrílico Premium', 'Acrílico espelhado ou cristal com corte a laser e acabamento premium', 89.90);
    insertModel.run('Placa NFC PVC Compacta', 'Placa de PVC resistente, acabamento fosco e alta durabilidade', 49.90);
    insertModel.run('Placa NFC Madeira Ecológica', 'Madeira nobre tratada com gravação a laser e chip NFC embutido', 119.90);
    console.log('✔ Modelos iniciais de placas inseridos no banco.');
  }

  // Verifica se já existem sócios/vendedores
  const countSellers = db.prepare('SELECT COUNT(*) as count FROM sellers').get();
  if (countSellers.count === 0) {
    const insertSeller = db.prepare(`
      INSERT INTO sellers (name, role) VALUES (?, ?)
    `);

    insertSeller.run('Wendel', 'Sócio');
    insertSeller.run('Meu Amigo (Sócio)', 'Sócio');
    console.log('✔ Sócios iniciais cadastrados no banco.');
  }
}

// Inicializa imediatamente ao importar
initDatabase();

module.exports = db;
