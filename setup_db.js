require('dotenv').config();

const mysql = require('mysql2/promise');
const { TABLAS, SQL_RED_POR_DEFECTO } = require('./src/config/schema');

const { DB_NAME, conexionBase } = require('./src/config/dbConfig');

const columnasNuevas = [
  { tabla: 'materias', columna: 'codigo_inscripcion', definicion: 'VARCHAR(10) UNIQUE' },
  { tabla: 'justificativos', columna: 'motivo', definicion: 'VARCHAR(255) AFTER archivo_url' },
  { tabla: 'materias', columna: 'inscripciones_abiertas', definicion: 'BOOLEAN NOT NULL DEFAULT TRUE AFTER codigo_inscripcion' },
  { tabla: 'materias', columna: 'semestre', definicion: 'TINYINT UNSIGNED NULL AFTER carrera_id' },
  // Código oficial del pensum (ej. ING-186IM); distinto del código de inscripción
  { tabla: 'materias', columna: 'codigo', definicion: 'VARCHAR(30) NULL AFTER nombre' },
  // Carrera que administra un coordinador_carrera (NULL para el resto de roles)
  {
    tabla: 'usuarios',
    columna: 'carrera_id',
    definicion: 'INT NULL AFTER rol, ADD CONSTRAINT fk_usuarios_carrera FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE SET NULL ON UPDATE CASCADE',
  },
  // Semestre que cursa un estudiante (junto con carrera_id define qué materias puede inscribir)
  { tabla: 'usuarios', columna: 'semestre', definicion: 'TINYINT UNSIGNED NULL AFTER carrera_id' },
  // 'pendiente' = coordinador que pidió acceso desde el panel y aún no aprueba el master (no puede iniciar sesión)
  { tabla: 'usuarios', columna: 'estado', definicion: "ENUM('aprobado', 'pendiente') NOT NULL DEFAULT 'aprobado' AFTER semestre" },
  // Geocerca de la sede (reemplaza la validación por red Wi-Fi)
  { tabla: 'configuracion_red', columna: 'latitud', definicion: 'DECIMAL(10, 8) NULL AFTER id' },
  { tabla: 'configuracion_red', columna: 'longitud', definicion: 'DECIMAL(11, 8) NULL AFTER latitud' },
  { tabla: 'configuracion_red', columna: 'radio_permitido', definicion: 'INT NOT NULL DEFAULT 50 AFTER longitud' },
];

// Columnas que ya no se usan y se eliminan si existen
const columnasEliminadas = [
  // Validación por red Wi-Fi, reemplazada por el geocercado (GPS)
  { tabla: 'configuracion_red', columna: 'ssid_permitido' },
  { tabla: 'configuracion_red', columna: 'ip_permitida' },
];

async function setup() {
  const connection = await mysql.createConnection(conexionBase);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${DB_NAME}\``);

    for (const { sql } of TABLAS) {
      await connection.query(sql);
    }

    // Migraciones para bases creadas con versiones anteriores de este script
    for (const { tabla, columna, definicion } of columnasNuevas) {
      const [existe] = await connection.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [DB_NAME, tabla, columna]
      );
      if (existe.length === 0) {
        await connection.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
        console.log(`Columna ${tabla}.${columna} agregada.`);
      }
    }

    for (const { tabla, columna } of columnasEliminadas) {
      const [existe] = await connection.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [DB_NAME, tabla, columna]
      );
      if (existe.length > 0) {
        await connection.query(`ALTER TABLE ${tabla} DROP COLUMN ${columna}`);
        console.log(`Columna ${tabla}.${columna} eliminada.`);
      }
    }

    // asistencias.ssid_validado pasó a llamarse ubicacion_validada (validación por GPS en vez de Wi-Fi).
    // Se usa CHANGE en lugar de RENAME COLUMN por compatibilidad con MariaDB 10.4
    const [columnaSsid] = await connection.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'asistencias' AND COLUMN_NAME = 'ssid_validado'",
      [DB_NAME]
    );
    if (columnaSsid.length > 0) {
      await connection.query('ALTER TABLE asistencias CHANGE ssid_validado ubicacion_validada BOOLEAN NOT NULL DEFAULT FALSE');
      console.log('Columna asistencias.ssid_validado renombrada a ubicacion_validada.');
    }

    // Los coordinadores que solicitan acceso desde el panel no tienen cédula: pasa a ser opcional
    const [[columnaCedula]] = await connection.query(
      "SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'cedula'",
      [DB_NAME]
    );
    if (columnaCedula.nullable === 'NO') {
      await connection.query('ALTER TABLE usuarios MODIFY cedula VARCHAR(20) NULL');
      console.log('Columna usuarios.cedula ahora admite NULL.');
    }

    // Migración de roles: 'coordinador' se dividió en 'coordinador_master' y 'coordinador_carrera'
    const [[columnaRol]] = await connection.query(
      "SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'rol'",
      [DB_NAME]
    );
    if (!columnaRol.tipo.includes("'coordinador_master'")) {
      await connection.query(
        "ALTER TABLE usuarios MODIFY rol ENUM('estudiante', 'profesor', 'coordinador', 'coordinador_master', 'coordinador_carrera') NOT NULL DEFAULT 'estudiante'"
      );
      const [migrados] = await connection.query(
        "UPDATE usuarios SET rol = 'coordinador_master' WHERE rol = 'coordinador'"
      );
      await connection.query(
        "ALTER TABLE usuarios MODIFY rol ENUM('estudiante', 'profesor', 'coordinador_master', 'coordinador_carrera') NOT NULL DEFAULT 'estudiante'"
      );
      console.log(`Roles de coordinador migrados (${migrados.affectedRows} usuario(s) pasaron a coordinador_master).`);
    }

    // Migración de estado de cuenta: 'activo' pasó a llamarse 'aprobado'
    const [[columnaEstado]] = await connection.query(
      "SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'estado'",
      [DB_NAME]
    );
    if (!columnaEstado.tipo.includes("'aprobado'")) {
      await connection.query(
        "ALTER TABLE usuarios MODIFY estado ENUM('activo', 'aprobado', 'pendiente') NOT NULL DEFAULT 'aprobado'"
      );
      const [migrados] = await connection.query("UPDATE usuarios SET estado = 'aprobado' WHERE estado = 'activo'");
      await connection.query(
        "ALTER TABLE usuarios MODIFY estado ENUM('aprobado', 'pendiente') NOT NULL DEFAULT 'aprobado'"
      );
      console.log(`Estado de cuenta migrado (${migrados.affectedRows} usuario(s) pasaron de 'activo' a 'aprobado').`);
    }

    await connection.query(SQL_RED_POR_DEFECTO);

    console.log(`Base de datos '${DB_NAME}' lista con ${TABLAS.length} tablas.`);
  } finally {
    await connection.end();
  }
}

setup().catch((error) => {
  console.error('Error al configurar la base de datos:', error.code || error.message);
  process.exit(1);
});
