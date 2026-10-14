// Datos de conexión a MySQL, compartidos por la API y los scripts (setup_db, reset_db, seeds).
// Prioridad:
//   1. DATABASE_URL (mysql://usuario:clave@host:puerto/base): para correr scripts desde tu PC contra
//      otra base, ej. la de Railway con su MYSQL_PUBLIC_URL. Gana sobre el .env a propósito.
//   2. DB_* (local / .env)
//   3. Las variables que crea Railway para su MySQL (MYSQLHOST, MYSQLPORT, MYSQLUSER, ...)
const env = process.env;

const desdeUrl = (() => {
  if (!env.DATABASE_URL) return null;
  const url = new URL(env.DATABASE_URL);
  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
})();

const DB_NAME = desdeUrl?.database || env.DB_NAME || env.MYSQLDATABASE || 'asistencia_db';

const conexionBase = desdeUrl
  ? { host: desdeUrl.host, port: desdeUrl.port, user: desdeUrl.user, password: desdeUrl.password }
  : {
      host: env.DB_HOST || env.MYSQLHOST || 'localhost',
      port: Number(env.DB_PORT || env.MYSQLPORT) || 3306,
      user: env.DB_USER || env.MYSQLUSER || 'root',
      password: env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? '',
    };

// Zona horaria de la sesión MySQL (ej. '-04:00' para Venezuela). Hace falta en servidores en UTC
// como Railway: las clases se guardan con NOW() y deben quedar en hora local.
const DB_TIMEZONE = env.DB_TIMEZONE || '';

module.exports = { DB_NAME, conexionBase, DB_TIMEZONE };
