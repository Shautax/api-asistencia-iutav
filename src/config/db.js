const mysql = require('mysql2/promise');
const { DB_NAME, conexionBase, DB_TIMEZONE } = require('./dbConfig');

const pool = mysql.createPool({
  ...conexionBase,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Cada conexión nueva usa la zona horaria configurada, para que NOW() y CURRENT_TIMESTAMP
// guarden la hora local aunque el servidor MySQL esté en UTC
if (DB_TIMEZONE) {
  pool.pool.on('connection', (connection) => {
    connection.query('SET time_zone = ?', [DB_TIMEZONE]);
  });
}

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = { pool, testConnection };
