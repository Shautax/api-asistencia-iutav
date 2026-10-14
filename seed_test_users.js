require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');

// Usuarios SOLO para pruebas en desarrollo; no ejecutar en producción
const USUARIOS_PRUEBA = [
  {
    cedula: '11111111',
    nombre: 'Estudiante Prueba',
    correo: 'estudiante@iutav.edu',
    password: '123456',
    rol: 'estudiante',
  },
  {
    cedula: '22222222',
    nombre: 'Profesor Prueba',
    correo: 'profesor@iutav.edu',
    password: '123456',
    rol: 'profesor',
  },
];

async function crearUsuario(usuario) {
  const hash = await bcrypt.hash(usuario.password, 10);

  try {
    const [result] = await pool.query(
      'INSERT INTO usuarios (cedula, nombre, correo, password, rol) VALUES (?, ?, ?, ?, ?)',
      [usuario.cedula, usuario.nombre, usuario.correo, hash, usuario.rol]
    );
    console.log(`Usuario ${usuario.rol} creado con id ${result.insertId} (${usuario.correo}).`);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log(`El usuario ${usuario.rol} ya existe (${usuario.correo} o cédula ${usuario.cedula}). No se hizo ningún cambio.`);
    } else {
      throw error;
    }
  }
}

const CARRERA_PRUEBA = { nombre: 'Informática (Prueba)', codigo: 'INF-TEST' };
const MATERIA_PRUEBA = { nombre: 'Programación', codigo_inscripcion: 'PROGTEST' };
// Segunda materia del profesor; el estudiante NO queda inscrito para probar "Unirse a una clase"
const MATERIA_SIN_INSCRIPCION = { nombre: 'Base de Datos', codigo_inscripcion: 'BDTEST' };

// Devuelve el id de la fila que cumple la condición, creándola antes si no existe
async function obtenerOCrear(selectSql, selectParams, insertSql, insertParams) {
  const [filas] = await pool.query(selectSql, selectParams);
  if (filas.length > 0) return { id: filas[0].id, creado: false };
  const [result] = await pool.query(insertSql, insertParams);
  return { id: result.insertId, creado: true };
}

const idUsuario = async (correo) => {
  const [filas] = await pool.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
  return filas[0].id;
};

// Carrera + materia de prueba, con el profesor asignado y el estudiante inscrito
async function crearDatosAcademicos() {
  const carrera = await obtenerOCrear(
    'SELECT id FROM carreras WHERE codigo = ?', [CARRERA_PRUEBA.codigo],
    'INSERT INTO carreras (nombre, codigo) VALUES (?, ?)', [CARRERA_PRUEBA.nombre, CARRERA_PRUEBA.codigo]
  );
  const materia = await obtenerOCrear(
    'SELECT id FROM materias WHERE codigo_inscripcion = ?', [MATERIA_PRUEBA.codigo_inscripcion],
    'INSERT INTO materias (nombre, carrera_id, codigo_inscripcion) VALUES (?, ?, ?)',
    [MATERIA_PRUEBA.nombre, carrera.id, MATERIA_PRUEBA.codigo_inscripcion]
  );
  console.log(`Materia '${MATERIA_PRUEBA.nombre}' ${materia.creado ? 'creada' : 'ya existía'} (id ${materia.id}).`);

  const profesorId = await idUsuario('profesor@iutav.edu');
  const estudianteId = await idUsuario('estudiante@iutav.edu');

  const asignacion = await obtenerOCrear(
    'SELECT id FROM profesor_materia WHERE profesor_id = ? AND materia_id = ?', [profesorId, materia.id],
    'INSERT INTO profesor_materia (profesor_id, materia_id) VALUES (?, ?)', [profesorId, materia.id]
  );
  console.log(`Profesor ${asignacion.creado ? 'asignado' : 'ya estaba asignado'} a la materia.`);

  const inscripcion = await obtenerOCrear(
    'SELECT id FROM estudiante_materia WHERE estudiante_id = ? AND materia_id = ?', [estudianteId, materia.id],
    'INSERT INTO estudiante_materia (estudiante_id, materia_id, faltas_acumuladas) VALUES (?, ?, 0)',
    [estudianteId, materia.id]
  );
  console.log(`Estudiante ${inscripcion.creado ? 'inscrito' : 'ya estaba inscrito'} en la materia.`);

  const materia2 = await obtenerOCrear(
    'SELECT id FROM materias WHERE codigo_inscripcion = ?', [MATERIA_SIN_INSCRIPCION.codigo_inscripcion],
    'INSERT INTO materias (nombre, carrera_id, codigo_inscripcion) VALUES (?, ?, ?)',
    [MATERIA_SIN_INSCRIPCION.nombre, carrera.id, MATERIA_SIN_INSCRIPCION.codigo_inscripcion]
  );
  await obtenerOCrear(
    'SELECT id FROM profesor_materia WHERE profesor_id = ? AND materia_id = ?', [profesorId, materia2.id],
    'INSERT INTO profesor_materia (profesor_id, materia_id) VALUES (?, ?)', [profesorId, materia2.id]
  );
  console.log(
    `Materia '${MATERIA_SIN_INSCRIPCION.nombre}' ${materia2.creado ? 'creada' : 'ya existía'} (id ${materia2.id}), ` +
    `asignada al profesor. Código para inscribirse: ${MATERIA_SIN_INSCRIPCION.codigo_inscripcion}`
  );
}

const COORDINADOR_CARRERA_PRUEBA = {
  cedula: '33333333',
  nombre: 'Coordinador Carrera Prueba',
  correo: 'coordinador.carrera@iutav.edu',
  password: '123456',
  rol: 'coordinador_carrera',
};

// Coordinador de carrera para probar el panel web con acceso restringido.
// Se asocia a la carrera de seed_demo si existe (tiene más datos); si no, a la de prueba.
async function crearCoordinadorCarrera() {
  const [carreras] = await pool.query(
    "SELECT id, nombre FROM carreras WHERE codigo IN ('INF-DEMO', ?) ORDER BY codigo = 'INF-DEMO' DESC LIMIT 1",
    [CARRERA_PRUEBA.codigo]
  );
  const carrera = carreras[0];
  const usuario = COORDINADOR_CARRERA_PRUEBA;
  const hash = await bcrypt.hash(usuario.password, 10);

  try {
    await pool.query(
      'INSERT INTO usuarios (cedula, nombre, correo, password, rol, carrera_id) VALUES (?, ?, ?, ?, ?, ?)',
      [usuario.cedula, usuario.nombre, usuario.correo, hash, usuario.rol, carrera.id]
    );
    console.log(`Coordinador de carrera creado (${usuario.correo}), asignado a '${carrera.nombre}'.`);
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    console.log(`El coordinador de carrera ya existe (${usuario.correo} o cédula ${usuario.cedula}). No se hizo ningún cambio.`);
  }
}

async function seed() {
  try {
    for (const usuario of USUARIOS_PRUEBA) {
      await crearUsuario(usuario);
    }
    await crearDatosAcademicos();
    await crearCoordinadorCarrera();
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Error al crear los usuarios de prueba:', error.code || error.message);
  process.exit(1);
});
