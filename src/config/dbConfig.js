// Datos de conexión a MySQL, compartidos por la API y los scripts (setup_db, reset_db).
// Usa DB_* (local / .env); si faltan, toma las variables que crea Railway para su MySQL
// (MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE).
const env = process.env;

const DB_NAME = env.DB_NAME || env.MYSQLDATABASE || 'asistencia_db';

const conexionBase = {
  host: env.DB_HOST || env.MYSQLHOST || 'localhost',
  port: Number(env.DB_PORT || env.MYSQLPORT) || 3306,
  user: env.DB_USER || env.MYSQLUSER || 'root',
  password: env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? '',
};

// Zona horaria de la sesión MySQL (ej. '-04:00' para Venezuela). Hace falta en servidores en UTC
// como Railway: las clases se guardan con NOW() y deben quedar en hora local.
const DB_TIMEZONE = env.DB_TIMEZONE || '';

module.exports = { DB_NAME, conexionBase, DB_TIMEZONE };
