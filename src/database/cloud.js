// src/database/cloud.js
// Conector opcional para SQLite Cloud (sqlitecloud.io)
// Permite manter o banco de dados na nuvem permanentemente independente de deploys no Render

const { Database } = require('@sqlitecloud/drivers');

let cloudDb = null;

/**
 * Inicializa a conexão com o SQLite Cloud caso a URL seja fornecida em SQLITE_CLOUD_URL
 */
function getCloudDatabase() {
  const cloudUrl = process.env.SQLITE_CLOUD_URL || process.env.DATABASE_URL;
  if (!cloudUrl || !cloudUrl.startsWith('sqlitecloud://')) {
    return null;
  }

  if (!cloudDb) {
    try {
      cloudDb = new Database(cloudUrl);
      console.log('☁ Conectado com sucesso ao SQLite Cloud!');
    } catch (err) {
      console.error('❌ Falha ao conectar ao SQLite Cloud:', err);
    }
  }

  return cloudDb;
}

module.exports = {
  getCloudDatabase
};
