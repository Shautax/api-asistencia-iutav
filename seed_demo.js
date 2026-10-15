require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');
const { UPLOAD_DIR } = require('./src/middlewares/uploadMiddleware');

// Escenario de demostración sobre el pensum REAL (no crea carreras ni materias):
// coordinadores, profesores, 4 cohortes de estudiantes y ~6 semanas de clases con justificativos.
//   npm run seed-demo             -> crea el escenario
//   npm run seed-demo -- --borrar -> elimina SOLO los datos de la demo (usuarios @demo.iutav.edu.ve)
//   npm run seed-demo -- --api https://<dominio>.up.railway.app
//       -> los justificativos se envían y revisan por la API (los archivos quedan en el disco del
//          servidor, ej. el volumen de Railway). Junto con DATABASE_URL para apuntar a esa base.
// Borrar los usuarios elimina en cascada sus clases, asistencias, inscripciones y justificativos.

const PASSWORD = '123456';
const DOMINIO = '@demo.iutav.edu.ve';
const correo = (nombre) =>
  nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.') + DOMINIO;

const COORDINADORES = [
  { cedula: '8200001', nombre: 'Ramón Quintero', carrera: 'IF' },
  { cedula: '8200002', nombre: 'Patricia Salas', carrera: 'AE' },
];
// Solicitud de acceso desde el panel, sin aprobar (para probar la bandeja del master)
const SOLICITUD_PENDIENTE = { nombre: 'Héctor Paredes', rol: 'coordinador_carrera' };

const PROFESORES = [
  'Carlos Mendoza', 'Laura Castillo', 'Pedro Rivas', 'Elena Vargas', 'Jorge Blanco',
  'Mariana Ortega', 'Ricardo Pacheco', 'Isabel Moreno', 'Fernando Rojas', 'Carmen Ibarra',
];

// perfil = probabilidad base de asistir a cada clase
const PERFIL = { excelente: 0.97, bueno: 0.9, regular: 0.8, riesgo: 0.62, critico: 0.45 };

// Cohortes: carrera + semestre. Los estudiantes se inscriben en todas las materias de su semestre.
// reposo: días (desde el inicio) en los que el estudiante faltó a todo por enfermedad
const COHORTES = [
  {
    carrera: 'IF', semestre: 3, estudiantes: [
      ['María González', 'excelente'], ['José Rodríguez', 'bueno'], ['Luis Hernández', 'critico'],
      ['Carla Martínez', 'bueno', { reposo: [15, 16, 17] }], ['Andrés Pérez', 'riesgo'],
      ['Valentina López', 'excelente'], ['Daniel Sánchez', 'regular'], ['Gabriela Ramírez', 'bueno'],
      ['Miguel Torres', 'riesgo'], ['Sofía Flores', 'excelente', { reposo: [31, 32] }],
    ],
  },
  {
    carrera: 'IF', semestre: 1, estudiantes: [
      ['Samuel Díaz', 'bueno'], ['Camila Rondón', 'excelente'], ['Diego Mujica', 'critico'],
      ['Paola Guerrero', 'regular'], ['Kevin Marcano', 'riesgo', { reposo: [22, 23, 24] }],
      ['Andrea Silva', 'bueno'], ['Jesús Briceño', 'regular'], ['Daniela Acosta', 'excelente'],
    ],
  },
  {
    carrera: 'AE', semestre: 1, estudiantes: [
      ['Fabiola Medina', 'excelente'], ['Oscar Peña', 'regular'], ['Natalia Herrera', 'bueno'],
      ['Alejandro Suárez', 'riesgo'], ['Rosa Contreras', 'bueno', { reposo: [8, 9] }],
      ['Manuel Aguilar', 'critico'], ['Lucía Campos', 'excelente'], ['Héctor Bravo', 'regular'],
    ],
  },
  {
    carrera: 'CF', semestre: 3, estudiantes: [
      ['Verónica Lara', 'bueno'], ['Eduardo Navas', 'excelente'], ['Yessica Parra', 'regular'],
      ['Roberto Zambrano', 'riesgo'], ['Adriana Vivas', 'excelente'], ['Gustavo Linares', 'bueno', { reposo: [29, 30, 31] }],
      ['Mónica Graterol', 'critico'], ['Tomás Villalobos', 'regular'],
    ],
  },
];

// Profesor clave de la demo: dicta estas materias (los demás se reparten el resto en orden)
const MATERIAS_CARLOS = ['BAD-332IF', 'PRO-363IF', 'LOG-132IF'];
// Clase que queda ABIERTA hoy, para probar el cierre desde la app (los demás quedan ausentes)
const CLASE_ABIERTA = 'BAD-332IF';

const INICIO = new Date(2026, 8, 7); // lunes 7 de septiembre de 2026
const SEMANAS = 6;
const FERIADOS = ['2026-10-12']; // Día de la Resistencia Indígena: no hubo clases
const HORAS = [7, 9, 11, 13, 15];

const MOTIVOS = [
  'Cita médica - constancia anexa',
  'Cita odontológica',
  'Duelo familiar',
  'Trámite de cédula en el SAIME',
  'Falla del transporte público',
  'Consulta médica en el ambulatorio',
  'Exámenes de laboratorio',
  'Representación del instituto en evento deportivo',
];
const MOTIVO_REPOSO = (dias) => `Reposo médico - ${dias * 24}h`;

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

const argApi = process.argv.indexOf('--api');
const API_URL = argApi > -1 ? String(process.argv[argApi + 1] || '').replace(/\/+$/, '') : null;

const fechaISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasDesdeInicio = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - INICIO) / 86400000);

// Archivos de soporte: una foto ya subida (si hay) y un PDF mínimo válido
function prepararSoportes() {
  const soportes = [];
  const fotos = fs.readdirSync(UPLOAD_DIR)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => ({ f, size: fs.statSync(path.join(UPLOAD_DIR, f)).size }))
    .filter((x) => x.size > 10 * 1024 && x.size < 5 * 1024 * 1024)
    .sort((a, b) => b.size - a.size);
  if (fotos.length > 0) soportes.push({ contenido: fs.readFileSync(path.join(UPLOAD_DIR, fotos[0].f)), extension: '.jpg' });
  else soportes.push({ contenido: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), extension: '.png' });
  soportes.push({ contenido: crearPdf('Constancia medica - documento de prueba (demo)'), extension: '.pdf' });
  return soportes;
}

function crearPdf(texto) {
  const contenido = `BT /F1 18 Tf 72 720 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objetos.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function crear() {
  const [existe] = await pool.query('SELECT id FROM usuarios WHERE correo LIKE ? LIMIT 1', [`%${DOMINIO}`]);
  if (existe.length > 0) {
    console.log('El escenario de demostración ya existe. Para recrearlo: npm run seed-demo -- --borrar  y luego  npm run seed-demo');
    return;
  }

  const aleatorio = crearAleatorio(20261015);
  const hash = await bcrypt.hash(PASSWORD, 10);
  const soportes = prepararSoportes();
  const ahora = new Date();
  const hoy = fechaISO(ahora);
  const archivosCreados = [];

  const [carreras] = await pool.query('SELECT id, codigo FROM carreras');
  const carreraId = Object.fromEntries(carreras.map((c) => [c.codigo, c.id]));
  const faltantes = [...new Set([...COORDINADORES, ...COHORTES].map((x) => x.carrera))].filter((c) => !carreraId[c]);
  if (faltantes.length > 0) {
    console.log(`Faltan las carreras ${faltantes.join(', ')} en esta base. Carga primero el pensum: npm run seed-carreras`);
    return;
  }
  if (API_URL) {
    const r = await fetch(`${API_URL}/`).catch(() => null);
    if (!r?.ok) {
      console.log(`La API ${API_URL} no responde. Revisa la URL (sin /api al final).`);
      return;
    }
  }
  // Modo --api: justificativos a enviar por la API después de guardar las clases
  const porApi = [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const insertarUsuario = async (u) => {
      const [r] = await conn.query(
        'INSERT INTO usuarios (cedula, nombre, correo, password, rol, carrera_id, semestre, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [u.cedula ?? null, u.nombre, correo(u.nombre), hash, u.rol, u.carrera_id ?? null, u.semestre ?? null, u.estado ?? 'aprobado']
      );
      return r.insertId;
    };

    for (const c of COORDINADORES) {
      await insertarUsuario({ ...c, rol: 'coordinador_carrera', carrera_id: carreraId[c.carrera] });
    }
    await insertarUsuario({ ...SOLICITUD_PENDIENTE, estado: 'pendiente' });

    const profesores = [];
    for (const [i, nombre] of PROFESORES.entries()) {
      profesores.push({ nombre, id: await insertarUsuario({ cedula: String(9300001 + i), nombre, rol: 'profesor' }) });
    }

    // Estudiantes e inscripciones por cohorte
    let cedula = 30100001;
    const materiasDemo = []; // { id, nombre, codigo, inscritos: [estudiante] }
    for (const cohorte of COHORTES) {
      const [materias] = await conn.query(
        'SELECT id, nombre, codigo FROM materias WHERE carrera_id = ? AND semestre = ? ORDER BY id',
        [carreraId[cohorte.carrera], cohorte.semestre]
      );
      const estudiantes = [];
      for (const [nombre, perfil, extra = {}] of cohorte.estudiantes) {
        const id = await insertarUsuario({
          cedula: String(cedula++), nombre, rol: 'estudiante',
          carrera_id: carreraId[cohorte.carrera], semestre: cohorte.semestre,
        });
        estudiantes.push({ id, nombre, base: PERFIL[perfil], reposo: extra.reposo || [] });
      }
      for (const m of materias) {
        await conn.query('INSERT INTO estudiante_materia (estudiante_id, materia_id) VALUES ?', [estudiantes.map((e) => [e.id, m.id])]);
        materiasDemo.push({ ...m, carrera: cohorte.carrera, semestre: cohorte.semestre, inscritos: estudiantes });
      }
    }

    // Asignación de profesores: Carlos Mendoza toma sus materias fijas, el resto se reparte en orden
    let turno = 1;
    for (const m of materiasDemo) {
      m.profesor = MATERIAS_CARLOS.includes(m.codigo) ? profesores[0] : profesores[turno++ % (profesores.length - 1) + 1];
      await conn.query('INSERT INTO profesor_materia (profesor_id, materia_id) VALUES (?, ?)', [m.profesor.id, m.id]);
    }

    // Horario: cada materia tiene 1 o 2 sesiones semanales en días y hora fijos.
    // Cada materia también tiene una "dificultad" (las de 7 a.m. y algunas materias pesadas se faltan más).
    for (const [i, m] of materiasDemo.entries()) {
      const primerDia = i % 5;
      m.dias = i % 3 === 0 ? [primerDia] : [primerDia, (primerDia + 2) % 5].sort();
      m.hora = HORAS[Math.floor(aleatorio() * HORAS.length)];
      m.factor = (m.hora === 7 ? 0.92 : 1) * (0.9 + aleatorio() * 0.12);
    }
    // La materia de la clase abierta tiene sesión el día de hoy (si es día hábil)
    const diaHoy = (ahora.getDay() + 6) % 7;
    const materiaAbierta = materiasDemo.find((m) => m.codigo === CLASE_ABIERTA);
    if (materiaAbierta && diaHoy < 5 && !materiaAbierta.dias.includes(diaHoy)) {
      materiaAbierta.dias = [...new Set([materiaAbierta.dias[0], diaHoy])].sort();
    }

    const totales = { clases: 0, asistencias: 0, pendiente: 0, aprobado: 0, rechazado: 0, reenviados: 0 };
    const guardarSoporte = () => {
      const s = soportes[aleatorio() < 0.6 ? 0 : soportes.length - 1];
      const nombre = `${Date.now()}-${crypto.randomUUID()}${s.extension}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, nombre), s.contenido);
      archivosCreados.push(nombre);
      return `/api/justificativos/archivo/${nombre}`;
    };
    const insertarJustificativo = async (asistenciaId, motivo, estado, archivo = guardarSoporte()) => {
      await conn.query(
        'INSERT INTO justificativos (asistencia_id, archivo_url, motivo, estado_revision) VALUES (?, ?, ?, ?)',
        [asistenciaId, archivo, motivo, estado]
      );
      totales[estado]++;
    };
    // Un mismo reposo médico se adjunta a todas las faltas de esos días
    const archivosReposo = new Map();

    for (const m of materiasDemo) {
      const faltas = new Map(m.inscritos.map((e) => [e.id, 0]));
      for (let semana = 0; semana < SEMANAS; semana++) {
        for (const dia of m.dias) {
          const fecha = new Date(INICIO);
          fecha.setDate(INICIO.getDate() + semana * 7 + dia);
          if (FERIADOS.includes(fechaISO(fecha))) continue;
          fecha.setHours(m.hora, 2 + Math.floor(aleatorio() * 14), 0, 0);

          const esHoy = fechaISO(fecha) === hoy;
          const abierta = esHoy && m.codigo === CLASE_ABIERTA;
          if (abierta) fecha.setTime(ahora.getTime() - 25 * 60000);
          else if (fecha >= ahora || fechaISO(fecha) > hoy) continue; // aún no ocurre
          else if (esHoy && m.codigo !== CLASE_ABIERTA && fecha.getTime() > ahora.getTime() - 2 * 3600000) continue;

          const [clase] = await conn.query(
            'INSERT INTO clases (materia_id, profesor_id, fecha, qr_token, estado) VALUES (?, ?, ?, ?, ?)',
            [m.id, m.profesor.id, fecha, crypto.randomBytes(32).toString('hex'), abierta ? 'abierta' : 'cerrada']
          );
          totales.clases++;
          const dias = diasDesdeInicio(fecha);
          const antiguedad = Math.round((ahora - fecha) / 86400000);

          for (const e of m.inscritos) {
            const enReposo = e.reposo.includes(dias);
            // Los estudiantes flojos faltan cada vez más conforme avanza el lapso
            const cansancio = e.base < 0.8 ? semana * 0.025 : 0;
            const asistio = !enReposo && aleatorio() < e.base * m.factor - cansancio;

            // Clase abierta: solo existen las filas de quienes ya escanearon el QR
            if (abierta) {
              if (asistio) {
                await conn.query(
                  "INSERT INTO asistencias (clase_id, estudiante_id, estado, ubicacion_validada) VALUES (?, ?, 'presente', 1)",
                  [clase.insertId, e.id]
                );
                totales.asistencias++;
              }
              continue;
            }

            // Decidir el justificativo (si lo hay) antes de insertar, para fijar el estado final
            let revision = null;
            let motivo = null;
            let rechazoPrevio = false;
            if (enReposo) {
              motivo = MOTIVO_REPOSO(e.reposo.length);
              // Reposos recientes aún sin revisar; los viejos ya fueron aprobados
              revision = antiguedad <= 10 ? 'pendiente' : 'aprobado';
            } else if (!asistio) {
              const r = aleatorio();
              const reciente = antiguedad <= 12;
              if (r < (reciente ? 0.12 : 0.3)) revision = 'aprobado';
              else if (r < (reciente ? 0.4 : 0.32)) revision = 'pendiente';
              else if (r < (reciente ? 0.46 : 0.42)) revision = 'rechazado';
              if (revision) motivo = MOTIVOS[Math.floor(aleatorio() * MOTIVOS.length)];
              // Algunos rechazados se reenvían con un soporte nuevo
              if (revision === 'rechazado' && aleatorio() < 0.35) rechazoPrevio = true;
            }
            // Por API la falta se guarda 'ausente' y la aprobación posterior la pasa a 'justificado'
            const estado = asistio ? 'presente' : revision === 'aprobado' && !API_URL ? 'justificado' : 'ausente';

            const [asis] = await conn.query(
              'INSERT INTO asistencias (clase_id, estudiante_id, estado, ubicacion_validada) VALUES (?, ?, ?, ?)',
              [clase.insertId, e.id, estado, asistio]
            );
            totales.asistencias++;
            if (estado === 'ausente') faltas.set(e.id, faltas.get(e.id) + 1);

            if (revision && API_URL) {
              porApi.push({
                asistenciaId: asis.insertId, estudiante: correo(e.nombre), profesor: correo(m.profesor.nombre),
                motivo, revision, rechazoPrevio,
              });
            } else if (revision) {
              let archivo;
              if (enReposo) {
                const clave = `${e.id}`;
                if (!archivosReposo.has(clave)) archivosReposo.set(clave, guardarSoporte());
                archivo = archivosReposo.get(clave);
              }
              await insertarJustificativo(asis.insertId, motivo, revision, archivo);
              if (rechazoPrevio) {
                await insertarJustificativo(asis.insertId, `${motivo} (soporte corregido)`, 'pendiente');
                totales.reenviados++;
              }
            }
          }
        }
      }

      // faltas_acumuladas = ausencias sin justificar (igual que lo mantiene el backend)
      for (const [estudianteId, n] of faltas) {
        await conn.query(
          'UPDATE estudiante_materia SET faltas_acumuladas = ? WHERE estudiante_id = ? AND materia_id = ?',
          [n, estudianteId, m.id]
        );
      }
      m.enRiesgo = [...faltas.values()].filter((n) => n > 3).length;
    }

    await conn.commit();

    if (API_URL) await enviarPorApi(porApi, soportes, totales);

    console.log('\nMaterias de la demo:');
    for (const m of materiasDemo) {
      console.log(`  ${m.carrera} S${m.semestre}  ${m.nombre.padEnd(38)} ${m.profesor.nombre.padEnd(16)} ${m.inscritos.length} inscritos, ${m.enRiesgo} en riesgo`);
    }
    console.log(`\nCreados: ${COORDINADORES.length} coordinadores de carrera (+1 solicitud pendiente), ${PROFESORES.length} profesores, ${COHORTES.reduce((n, c) => n + c.estudiantes.length, 0)} estudiantes, ${materiasDemo.length} materias con actividad.`);
    console.log(`Clases: ${totales.clases} (1 abierta hoy: ${CLASE_ABIERTA}). Asistencias: ${totales.asistencias}.`);
    console.log(`Justificativos: ${totales.pendiente} pendientes (${totales.reenviados} reenvíos tras rechazo), ${totales.aprobado} aprobados, ${totales.rechazado} rechazados. ${API_URL ? 'Archivos subidos al servidor por la API.' : `Archivos: ${archivosCreados.length}.`}`);
    console.log(`\nContraseña de todos los usuarios de la demo: ${PASSWORD}`);
    console.log(`  Coordinador Informática:  ${correo(COORDINADORES[0].nombre)}`);
    console.log(`  Coordinadora Adm. Emp.:   ${correo(COORDINADORES[1].nombre)}`);
    console.log(`  Profesor (clase abierta): ${correo(PROFESORES[0])}`);
    console.log(`  Estudiante en riesgo:     ${correo('Luis Hernández')}`);
    console.log(`  Estudiante con reposo:    ${correo('Sofía Flores')}`);
  } catch (error) {
    await conn.rollback();
    for (const f of archivosCreados) fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
    throw error;
  } finally {
    conn.release();
  }
}

// Envía cada justificativo como lo haría la app: el estudiante lo sube y el profesor lo revisa
async function enviarPorApi(lista, soportes, totales) {
  const tokens = new Map();
  const token = async (usuario) => {
    if (!tokens.has(usuario)) {
      const r = await fetch(`${API_URL}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: usuario, password: PASSWORD }),
      });
      const data = await r.json();
      if (!data.token) throw new Error(`No se pudo iniciar sesión como ${usuario}: ${data.message}`);
      tokens.set(usuario, data.token);
    }
    return tokens.get(usuario);
  };
  const tipos = { '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };
  const enviar = async (j, motivo, i) => {
    const s = soportes[i % 3 === 0 ? soportes.length - 1 : 0];
    const form = new FormData();
    form.append('asistencia_id', String(j.asistenciaId));
    form.append('motivo', motivo);
    form.append('archivo', new Blob([s.contenido], { type: tipos[s.extension] }), `soporte${s.extension}`);
    const r = await fetch(`${API_URL}/api/justificativos`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token(j.estudiante)}` }, body: form,
    });
    const data = await r.json();
    if (r.status !== 201) throw new Error(`Envío del justificativo de la asistencia ${j.asistenciaId}: ${data.message}`);
    return data.justificativo.id;
  };
  const revisar = async (j, id, estado) => {
    const r = await fetch(`${API_URL}/api/justificativos/${id}/estado`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await token(j.profesor)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado_revision: estado }),
    });
    if (r.status !== 200) throw new Error(`Revisión del justificativo ${id}: ${(await r.json()).message}`);
  };

  console.log(`Enviando ${lista.length} justificativos por ${API_URL} ...`);
  for (const [i, j] of lista.entries()) {
    const id = await enviar(j, j.motivo, i);
    if (j.revision !== 'pendiente') await revisar(j, id, j.revision);
    totales[j.revision]++;
    if (j.rechazoPrevio) {
      await enviar(j, `${j.motivo} (soporte corregido)`, i + 1);
      totales.pendiente++;
      totales.reenviados++;
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${lista.length}`);
  }
}

async function borrar() {
  const [archivos] = await pool.query(
    `SELECT DISTINCT j.archivo_url FROM justificativos j
     INNER JOIN asistencias a ON a.id = j.asistencia_id
     INNER JOIN usuarios u ON u.id = a.estudiante_id
     WHERE u.correo LIKE ?`,
    [`%${DOMINIO}`]
  );
  for (const { archivo_url: url } of archivos) {
    fs.rmSync(path.join(UPLOAD_DIR, path.basename(url)), { force: true });
  }
  const [usuarios] = await pool.query('DELETE FROM usuarios WHERE correo LIKE ?', [`%${DOMINIO}`]);
  console.log(`Demo eliminada: ${usuarios.affectedRows} usuarios y ${archivos.length} archivos de soporte. El pensum no se toca.`);
}

(process.argv.includes('--borrar') ? borrar() : crear())
  .catch((error) => {
    console.error('Error en el escenario de demostración:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
