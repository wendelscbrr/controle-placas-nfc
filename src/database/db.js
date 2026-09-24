// src/database/db.js
// Conexão direta com o SQLite Cloud (100% Nuvem)
// Compatível com ambiente local e produção no Render

// Carrega o arquivo .env automaticamente em ambiente local (Node.js 22+)
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (e) {
    // Em produção (Render), as variáveis são injetadas diretamente pelo painel
  }
}

const { Database } = require('@sqlitecloud/drivers');

const cloudUrl = process.env.SQLITE_CLOUD_URL || process.env.DATABASE_URL;

if (!cloudUrl || !cloudUrl.startsWith('sqlitecloud://')) {
  console.error('❌ ERRO CRÍTICO: SQLITE_CLOUD_URL não configurada no ambiente ou no arquivo .env!');
}

const cloud = new Database(cloudUrl);

/**
 * Normaliza parâmetros para o driver @sqlitecloud/drivers.
 * Se o chamador passar um array (ex: db.all(sql, [param1, param2])),
 * desempacota para que o driver receba os parâmetros soltos.
 */
function normalizeParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) {
    return args[0];
  }
  return args;
}

const db = {
  /**
   * Executa uma consulta e retorna um array de linhas (SELECT)
   */
  async all(sql, ...params) {
    const norm = normalizeParams(params);
    const res = await cloud.sql(sql, ...norm);
    if (!res) return [];
    if (Array.isArray(res)) return res;
    return [];
  },

  /**
   * Executa uma consulta e retorna a primeira linha ou null (SELECT LIMIT 1)
   */
  async get(sql, ...params) {
    const norm = normalizeParams(params);
    const res = await cloud.sql(sql, ...norm);
    if (Array.isArray(res) && res.length > 0) return res[0];
    return null;
  },

  /**
   * Executa instruções de escrita (INSERT, UPDATE, DELETE)
   * Retorna { lastID, lastInsertRowid, changes }
   */
  async run(sql, ...params) {
    const norm = normalizeParams(params);
    const res = await cloud.sql(sql, ...norm);
    const id = res && res.lastID !== undefined ? res.lastID : null;
    return {
      lastID: id,
      lastInsertRowid: id,
      changes: res && res.changes !== undefined ? res.changes : 0
    };
  },

  /**
   * Executa instruções DDL puras (CREATE TABLE, PRAGMA, etc)
   */
  async exec(sql) {
    return await cloud.sql(sql);
  },

  /**
   * Instância direta do cliente do SQLite Cloud
   */
  client: cloud
};

module.exports = db;
