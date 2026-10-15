// Estructura final de la base de datos. La usan setup_db.js (crea lo que falte) y scripts/reset_db.js (borra y recrea).
// El orden importa: cada tabla va después de las tablas a las que apunta con llaves foráneas.
const TABLAS = [
  {
    nombre: 'carreras',
    sql: `CREATE TABLE IF NOT EXISTS carreras (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      codigo VARCHAR(20) NOT NULL UNIQUE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'usuarios',
    // carrera_id: carrera que cursa un estudiante o que administra un coordinador_carrera (NULL para el resto).
    // semestre: solo estudiantes. estado 'pendiente' = coordinador que pidió acceso desde el panel
    // y aún no aprueba el master (no puede iniciar sesión).
    sql: `CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cedula VARCHAR(20) NULL UNIQUE,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      rol ENUM('estudiante', 'profesor', 'coordinador_master', 'coordinador_carrera') NOT NULL DEFAULT 'estudiante',
      carrera_id INT NULL,
      semestre TINYINT UNSIGNED NULL,
      estado ENUM('aprobado', 'pendiente') NOT NULL DEFAULT 'aprobado',
      CONSTRAINT fk_usuarios_carrera FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'materias',
    // codigo: código oficial del pensum (ej. ING-186IM); distinto del código de inscripción
    sql: `CREATE TABLE IF NOT EXISTS materias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      codigo VARCHAR(30) NULL,
      carrera_id INT NOT NULL,
      semestre TINYINT UNSIGNED NULL,
      codigo_inscripcion VARCHAR(10) UNIQUE,
      inscripciones_abiertas BOOLEAN NOT NULL DEFAULT TRUE,
      FOREIGN KEY (carrera_id) REFERENCES carreras(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'estudiante_materia',
    sql: `CREATE TABLE IF NOT EXISTS estudiante_materia (
      id INT AUTO_INCREMENT PRIMARY KEY,
      estudiante_id INT NOT NULL,
      materia_id INT NOT NULL,
      faltas_acumuladas INT DEFAULT 0,
      UNIQUE KEY uq_estudiante_materia (estudiante_id, materia_id),
      FOREIGN KEY (estudiante_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'profesor_materia',
    sql: `CREATE TABLE IF NOT EXISTS profesor_materia (
      id INT AUTO_INCREMENT PRIMARY KEY,
      profesor_id INT NOT NULL,
      materia_id INT NOT NULL,
      UNIQUE KEY uq_profesor_materia (profesor_id, materia_id),
      FOREIGN KEY (profesor_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'clases',
    sql: `CREATE TABLE IF NOT EXISTS clases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      materia_id INT NOT NULL,
      profesor_id INT NOT NULL,
      fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      qr_token VARCHAR(255) UNIQUE,
      estado ENUM('abierta', 'cerrada') NOT NULL DEFAULT 'abierta',
      FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (profesor_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'asistencias',
    sql: `CREATE TABLE IF NOT EXISTS asistencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      clase_id INT NOT NULL,
      estudiante_id INT NOT NULL,
      estado ENUM('presente', 'ausente', 'justificado') NOT NULL DEFAULT 'presente',
      ssid_validado BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE KEY uq_clase_estudiante (clase_id, estudiante_id),
      FOREIGN KEY (clase_id) REFERENCES clases(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (estudiante_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'justificativos',
    sql: `CREATE TABLE IF NOT EXISTS justificativos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asistencia_id INT NOT NULL,
      archivo_url VARCHAR(500) NOT NULL,
      motivo VARCHAR(255),
      estado_revision ENUM('pendiente', 'aprobado', 'rechazado') NOT NULL DEFAULT 'pendiente',
      FOREIGN KEY (asistencia_id) REFERENCES asistencias(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  },
  {
    nombre: 'configuracion_red',
    // Red Wi-Fi desde la que se permite marcar asistencia (una sola fila, id = 1, la edita el coordinador master)
    sql: `CREATE TABLE IF NOT EXISTS configuracion_red (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ssid_permitido VARCHAR(64) NOT NULL,
      ip_permitida VARCHAR(45) NOT NULL
    ) ENGINE=InnoDB`,
  },
];

// Red por defecto; INSERT IGNORE no pisa la que ya haya configurado el coordinador master
const SQL_RED_POR_DEFECTO =
  "INSERT IGNORE INTO configuracion_red (id, ssid_permitido, ip_permitida) VALUES (1, 'Wipod_Tesis', '192.168.43.0/24')";

module.exports = { TABLAS, SQL_RED_POR_DEFECTO };
