require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');
const { UPLOAD_DIR } = require('./src/middlewares/uploadMiddleware');

// Escenario de demostración: 4 profesores, 10 estudiantes, 6 materias y ~4 semanas de clases.
//   npm run seed-demo            -> crea el escenario
//   npm run seed-demo -- --borrar -> elimina SOLO los datos de la demo
// Todo lo creado aquí usa códigos terminados en "-D" y correos de este archivo.

const PASSWORD = '123456';
const CARRERA = { nombre: 'Ingeniería en Informática', codigo: 'INF-DEMO' };

const PROFESORES = [
  { cedula: '9100001', nombre: 'Carlos Mendoza', correo: 'carlos.mendoza@iutav.edu' },
  { cedula: '9100002', nombre: 'Laura Castillo', correo: 'laura.castillo@iutav.edu' },
  { cedula: '9100003', nombre: 'Pedro Rivas', correo: 'pedro.rivas@iutav.edu' },
  { cedula: '9100004', nombre: 'Elena Vargas', correo: 'elena.vargas@iutav.edu' },
];

// asistencia = probabilidad de asistir a cada clase (define el "perfil" del estudiante)
const ESTUDIANTES = [
  { cedula: '28100001', nombre: 'María González', correo: 'maria.gonzalez@iutav.edu', asistencia: 0.97 },
  { cedula: '28100002', nombre: 'José Rodríguez', correo: 'jose.rodriguez@iutav.edu', asistencia: 0.92 },
  { cedula: '28100003', nombre: 'Luis Hernández', correo: 'luis.hernandez@iutav.edu', asistencia: 0.45 },
  { cedula: '28100004', nombre: 'Carla Martínez', correo: 'carla.martinez@iutav.edu', asistencia: 0.88 },
  { cedula: '28100005', nombre: 'Andrés Pérez', correo: 'andres.perez@iutav.edu', asistencia: 0.4 },
  { cedula: '28100006', nombre: 'Valentina López', correo: 'valentina.lopez@iutav.edu', asistencia: 1.0 },
  { cedula: '28100007', nombre: 'Daniel Sánchez', correo: 'daniel.sanchez@iutav.edu', asistencia: 0.8 },
  { cedula: '28100008', nombre: 'Gabriela Ramírez', correo: 'gabriela.ramirez@iutav.edu', asistencia: 0.85 },
  { cedula: '28100009', nombre: 'Miguel Torres', correo: 'miguel.torres@iutav.edu', asistencia: 0.55 },
  { cedula: '28100010', nombre: 'Sofía Flores', correo: 'sofia.flores@iutav.edu', asistencia: 0.95 },
];

// dias: 0 = lunes ... 4 = viernes. inscritos: índices de ESTUDIANTES.
const MATERIAS = [
  { nombre: 'Programación II', codigo: 'PROG2-D', profesor: 0, dias: [0, 2], hora: 7, inscritos: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], abiertas: true },
  { nombre: 'Estructuras de Datos', codigo: 'EDAT-D', profesor: 0, dias: [1, 3], hora: 9, inscritos: [0, 1, 2, 4, 5, 6, 8], abiertas: true },
  { nombre: 'Base de Datos II', codigo: 'BD2-D', profesor: 1, dias: [0, 2], hora: 9, inscritos: [0, 1, 3, 5, 6, 7, 8, 9], abiertas: true },
  { nombre: 'Redes de Computadoras', codigo: 'REDES-D', profesor: 1, dias: [1, 3], hora: 7, inscritos: [2, 3, 4, 6, 7, 9], abiertas: true },
  { nombre: 'Matemática II', codigo: 'MAT2-D', profesor: 2, dias: [0, 3], hora: 13, inscritos: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], abiertas: true },
  // Lista ya cerrada: muestra en la app que nadie más puede inscribirse
  { nombre: 'Inglés Técnico', codigo: 'ING-D', profesor: 3, dias: [4], hora: 10, inscritos: [1, 3, 5, 7, 9], abiertas: false },
];

const SEMANAS = 5;
const INICIO = new Date(2026, 8, 7); // lunes 7 de septiembre de 2026

const MOTIVOS = [
  'Reposo médico - 48h',
  'Cita médica (odontología)',
  'Duelo familiar',
  'Trámite de cédula en el SAIME',
  'Falla del transporte público',
  'Consulta médica - constancia anexa',
];

// Generador pseudoaleatorio con semilla: el escenario es siempre el mismo
function crearAleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Imagen de soporte para los justificativos: se reutiliza la última foto subida si existe
function prepararImagenSoporte() {
  const fotos = fs.readdirSync(UPLOAD_DIR)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => ({ f, size: fs.statSync(path.join(UPLOAD_DIR, f)).size }))
    .filter((x) => x.size > 10 * 1024)
    .sort((a, b) => b.size - a.size);
  if (fotos.length > 0) return { origen: path.join(UPLOAD_DIR, fotos[0].f), extension: '.jpg' };
  // Respaldo: PNG mínimo válido
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const origen = path.join(UPLOAD_DIR, 'soporte-demo.png');
  fs.writeFileSync(origen, png);
  return { origen, extension: '.png' };
}

async function crear() {
  const [existe] = await pool.query('SELECT id FROM carreras WHERE codigo = ?', [CARRERA.codigo]);
  if (existe.length > 0) {
    console.log('El escenario de demostración ya existe. Para recrearlo: npm run seed-demo -- --borrar  y luego  npm run seed-demo');
    return;
  }

  const aleatorio = crearAleatorio(20261012);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const soporte = prepararImagenSoporte();

  const [carrera] = await pool.query('INSERT INTO carreras (nombre, codigo) VALUES (?, ?)', [CARRERA.nombre, CARRERA.codigo]);

  const insertarUsuario = async (u, rol) => {
    const [r] = await pool.query(
      'INSERT INTO usuarios (cedula, nombre, correo, password, rol) VALUES (?, ?, ?, ?, ?)',
      [u.cedula, u.nombre, u.correo, hash, rol]
    );
    return r.insertId;
  };
  const idsProfesores = [];
  for (const p of PROFESORES) idsProfesores.push(await insertarUsuario(p, 'profesor'));
  const idsEstudiantes = [];
  for (const e of ESTUDIANTES) idsEstudiantes.push(await insertarUsuario(e, 'estudiante'));

  let totalClases = 0;
  let totalAsistencias = 0;
  const conteoJustificativos = { pendiente: 0, aprobado: 0, rechazado: 0 };

  for (const m of MATERIAS) {
    const [mat] = await pool.query(
      'INSERT INTO materias (nombre, carrera_id, codigo_inscripcion, inscripciones_abiertas) VALUES (?, ?, ?, ?)',
      [m.nombre, carrera.insertId, m.codigo, m.abiertas]
    );
    const materiaId = mat.insertId;
    const profesorId = idsProfesores[m.profesor];
    await pool.query('INSERT INTO profesor_materia (profesor_id, materia_id) VALUES (?, ?)', [profesorId, materiaId]);

    const faltas = new Map(m.inscritos.map((i) => [i, 0]));
    for (const i of m.inscritos) {
      await pool.query(
        'INSERT INTO estudiante_materia (estudiante_id, materia_id, faltas_acumuladas) VALUES (?, ?, 0)',
        [idsEstudiantes[i], materiaId]
      );
    }

    // Clases ya cerradas, en los días y la hora de la materia
    for (let semana = 0; semana < SEMANAS; semana++) {
      for (const dia of m.dias) {
        const fecha = new Date(INICIO);
        fecha.setDate(INICIO.getDate() + semana * 7 + dia);
        fecha.setHours(m.hora, 5 + Math.floor(aleatorio() * 10), 0, 0);

        const [clase] = await pool.query(
          "INSERT INTO clases (materia_id, profesor_id, fecha, qr_token, estado) VALUES (?, ?, ?, ?, 'cerrada')",
          [materiaId, profesorId, fecha, crypto.randomBytes(32).toString('hex')]
        );
        totalClases++;

        for (const i of m.inscritos) {
          const asistio = aleatorio() < ESTUDIANTES[i].asistencia;
          let estado = asistio ? 'presente' : 'ausente';

          // Algunas faltas tienen justificativo: aprobado, pendiente de revisión o rechazado
          let revision = null;
          if (!asistio) {
            const r = aleatorio();
            if (r < 0.3) revision = 'aprobado';
            else if (r < 0.45) revision = 'pendiente';
            else if (r < 0.53) revision = 'rechazado';
            if (revision === 'aprobado') estado = 'justificado';
          }

          const [asis] = await pool.query(
            'INSERT INTO asistencias (clase_id, estudiante_id, estado, ssid_validado) VALUES (?, ?, ?, ?)',
            [clase.insertId, idsEstudiantes[i], estado, asistio]
          );
          totalAsistencias++;
          if (estado === 'ausente') faltas.set(i, faltas.get(i) + 1);

          if (revision) {
            const nombre = `${Date.now()}-${crypto.randomUUID()}${soporte.extension}`;
            fs.copyFileSync(soporte.origen, path.join(UPLOAD_DIR, nombre));
            await pool.query(
              'INSERT INTO justificativos (asistencia_id, archivo_url, motivo, estado_revision) VALUES (?, ?, ?, ?)',
              [asis.insertId, `/api/justificativos/archivo/${nombre}`, MOTIVOS[Math.floor(aleatorio() * MOTIVOS.length)], revision]
            );
            conteoJustificativos[revision]++;
          }
        }
      }
    }

    // Faltas acumuladas = inasistencias que no fueron justificadas (igual que calcula el backend)
    for (const [i, n] of faltas) {
      await pool.query(
        'UPDATE estudiante_materia SET faltas_acumuladas = ? WHERE estudiante_id = ? AND materia_id = ?',
        [n, idsEstudiantes[i], materiaId]
      );
    }
    const enRiesgo = [...faltas.values()].filter((n) => n > 3).length;
    console.log(`  ${m.nombre.padEnd(24)} prof. ${PROFESORES[m.profesor].nombre.padEnd(15)} ${m.inscritos.length} inscritos, ${SEMANAS * m.dias.length} clases, ${enRiesgo} en riesgo, código ${m.codigo}${m.abiertas ? '' : ' (lista cerrada)'}`);
  }

  console.log(`\nCreados: ${PROFESORES.length} profesores, ${ESTUDIANTES.length} estudiantes, ${MATERIAS.length} materias, ${totalClases} clases, ${totalAsistencias} asistencias.`);
  console.log(`Justificativos: ${conteoJustificativos.pendiente} pendientes, ${conteoJustificativos.aprobado} aprobados, ${conteoJustificativos.rechazado} rechazados.`);
  console.log(`Contraseña de todos los usuarios de la demo: ${PASSWORD}`);
}

async function borrar() {
  const correos = [...PROFESORES, ...ESTUDIANTES].map((u) => u.correo);

  // Primero los archivos de soporte de los justificativos de la demo
  const [archivos] = await pool.query(
    `SELECT j.archivo_url FROM justificativos j
     INNER JOIN asistencias a ON a.id = j.asistencia_id
     INNER JOIN usuarios u ON u.id = a.estudiante_id
     WHERE u.correo IN (?)`,
    [correos]
  );
  for (const { archivo_url: url } of archivos) {
    const ruta = path.join(UPLOAD_DIR, path.basename(url));
    if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
  }

  // Borrar los usuarios elimina en cascada sus clases, asistencias, inscripciones y justificativos
  const [usuarios] = await pool.query('DELETE FROM usuarios WHERE correo IN (?)', [correos]);
  const [materias] = await pool.query('DELETE FROM materias WHERE codigo_inscripcion IN (?)', [MATERIAS.map((m) => m.codigo)]);
  await pool.query('DELETE FROM carreras WHERE codigo = ?', [CARRERA.codigo]);

  console.log(`Demo eliminada: ${usuarios.affectedRows} usuarios, ${materias.affectedRows} materias y ${archivos.length} archivos de soporte.`);
}

(process.argv.includes('--borrar') ? borrar() : crear())
  .catch((error) => {
    console.error('Error en el escenario de demostración:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
