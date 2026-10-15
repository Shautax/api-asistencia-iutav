// Borra TODAS las tablas del sistema (y sus datos) y las vuelve a crear vacías con la estructura final.
// Uso: npm run reset-db
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const { TABLAS, SQL_RED_POR_DEFECTO } = require('../src/config/schema');

const { DB_NAME, conexionBase } = require('../src/config/dbConfig');

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('reset_db.js no se ejecuta con NODE_ENV=production');
  }

  const connection = await mysql.createConnection(conexionBase);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${DB_NAME}\``);

    // Se borran en orden inverso al de creación: primero las tablas que dependen de otras
    const eliminadas = [];
    for (const { nombre } of [...TABLAS].reverse()) {
      await connection.query(`DROP TABLE IF EXISTS \`${nombre}\``);
      eliminadas.push(nombre);
    }
    console.log(`Tablas eliminadas (${eliminadas.length}): ${eliminadas.join(', ')}`);

    const creadas = [];
    for (const { nombre, sql } of TABLAS) {
      await connection.query(sql);
      creadas.push(nombre);
    }
    console.log(`Tablas creadas (${creadas.length}): ${creadas.join(', ')}`);

    await connection.query(SQL_RED_POR_DEFECTO);
    console.log('Geocerca por defecto insertada en configuracion_red: sin coordenadas, radio de 50 m');

    console.log(`Base de datos '${DB_NAME}' reiniciada y vacía.`);
  } finally {
    await connection.end();
  }
}

reset().catch((error) => {
  console.error('Error al reiniciar la base de datos:', error.code || error.message);
  process.exit(1);
});
