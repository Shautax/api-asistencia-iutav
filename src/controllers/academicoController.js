const crypto = require('crypto');
const { pool } = require('../config/db');
const { LIMITE_FALTAS_AVISO } = require('../config/reglas');
const { puedeVerCarrera } = require('../middlewares/alcanceMiddleware');

// Sin 0/O ni 1/I para que el código no se confunda al dictarlo o copiarlo
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 6;
const INTENTOS_CODIGO = 5;

const generarCodigo = () =>
  Array.from({ length: LARGO_CODIGO }, () => ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)]).join('');

const listarCarreras = async (req, res, next) => {
  try {
    const [carreras] = await pool.query('SELECT id, nombre, codigo FROM carreras ORDER BY nombre');
    res.json({ ok: true, total: carreras.length, carreras });
  } catch (error) {
    next(error);
  }
};

// Registro público: oculta la carrera de datos de prueba (seed_demo.js) para que nadie se registre en ella
const CODIGO_CARRERA_DEMO = 'INF-DEMO';

const listarCarrerasPublicas = async (req, res, next) => {
  try {
    const [carreras] = await pool.query(
      'SELECT id, nombre, codigo FROM carreras WHERE codigo <> ? ORDER BY nombre',
      [CODIGO_CARRERA_DEMO]
    );
    res.json({ ok: true, total: carreras.length, carreras });
  } catch (error) {
    next(error);
  }
};

const crearCarrera = async (req, res, next) => {
  try {
    const { nombre, codigo } = req.body || {};

    if (!nombre || !codigo) {
      return res.status(400).json({ ok: false, message: 'nombre y codigo son obligatorios' });
    }

    const [result] = await pool.query('INSERT INTO carreras (nombre, codigo) VALUES (?, ?)', [nombre, codigo]);

    res.status(201).json({
      ok: true,
      message: 'Carrera creada correctamente',
      carrera: { id: result.insertId, nombre, codigo },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Ya existe una carrera con ese código' });
    }
    next(error);
  }
};

const crearMateria = async (req, res, next) => {
  try {
    const { nombre, carrera_id, semestre } = req.body || {};

    if (!nombre || !carrera_id) {
      return res.status(400).json({ ok: false, message: 'nombre y carrera_id son obligatorios' });
    }
    if (!puedeVerCarrera(req.alcance, carrera_id)) {
      return res.status(403).json({ ok: false, message: 'Solo puedes crear materias en tu carrera' });
    }
    const semestreNum = semestre == null || semestre === '' ? null : Number(semestre);
    if (semestreNum !== null && !(Number.isInteger(semestreNum) && semestreNum >= 1 && semestreNum <= 12)) {
      return res.status(400).json({ ok: false, message: 'semestre debe ser un número entre 1 y 12' });
    }

    const [carreras] = await pool.query('SELECT id FROM carreras WHERE id = ?', [carrera_id]);
    if (carreras.length === 0) {
      return res.status(404).json({ ok: false, message: 'La carrera no existe' });
    }

    // Si el código generado ya existe (muy improbable), se intenta con otro
    for (let intento = 1; intento <= INTENTOS_CODIGO; intento++) {
      const codigo = generarCodigo();
      try {
        const [result] = await pool.query(
          'INSERT INTO materias (nombre, carrera_id, semestre, codigo_inscripcion) VALUES (?, ?, ?, ?)',
          [nombre, carrera_id, semestreNum, codigo]
        );
        return res.status(201).json({
          ok: true,
          message: 'Materia creada correctamente',
          materia: { id: result.insertId, nombre, carrera_id: Number(carrera_id), semestre: semestreNum, codigo_inscripcion: codigo },
        });
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || intento === INTENTOS_CODIGO) throw error;
      }
    }
  } catch (error) {
    next(error);
  }
};

// Carrera y semestre del estudiante. Se leen de la BD (no del token) para que un cambio
// hecho por la coordinación aplique de inmediato.
const datosAcademicos = async (estudianteId) => {
  const [filas] = await pool.query(
    `SELECT u.carrera_id, c.nombre AS carrera_nombre, u.semestre
     FROM usuarios u LEFT JOIN carreras c ON c.id = u.carrera_id
     WHERE u.id = ?`,
    [estudianteId]
  );
  const datos = filas[0];
  return datos && datos.carrera_id && datos.semestre ? datos : null;
};

const SIN_CARRERA = {
  ok: false,
  message: 'Tu cuenta no tiene carrera y semestre asignados. Consulta con la coordinación de tu carrera.',
};

// Estudiante: materias del pensum de SU carrera y SU semestre.
// ?carrera_id y ?semestre son opcionales; si llegan, deben coincidir con los del estudiante.
const miPensum = async (req, res, next) => {
  try {
    const estudiante = await datosAcademicos(req.usuario.id);
    if (!estudiante) {
      return res.status(409).json(SIN_CARRERA);
    }

    const { carrera_id, semestre } = req.query;
    if (
      (carrera_id !== undefined && Number(carrera_id) !== estudiante.carrera_id) ||
      (semestre !== undefined && Number(semestre) !== estudiante.semestre)
    ) {
      return res.status(403).json({ ok: false, message: 'Solo puedes consultar el pensum de tu carrera y semestre' });
    }

    // Orden de inserción = orden del pensum oficial
    const [materias] = await pool.query(
      `SELECT id, nombre, codigo, carrera_id, semestre
       FROM materias
       WHERE carrera_id = ? AND semestre = ?
       ORDER BY id`,
      [estudiante.carrera_id, estudiante.semestre]
    );

    res.json({
      ok: true,
      carrera_id: estudiante.carrera_id,
      carrera_nombre: estudiante.carrera_nombre,
      semestre: estudiante.semestre,
      total: materias.length,
      materias,
    });
  } catch (error) {
    next(error);
  }
};

// Estudiante: inscripción por catálogo. Solo se admiten materias de su carrera y su semestre.
const inscribirme = async (req, res, next) => {
  try {
    const materiaId = Number((req.body || {}).materia_id);
    const estudianteId = req.usuario.id;

    if (!Number.isInteger(materiaId) || materiaId <= 0) {
      return res.status(400).json({ ok: false, message: 'materia_id es obligatorio' });
    }

    const estudiante = await datosAcademicos(estudianteId);
    if (!estudiante) {
      return res.status(409).json(SIN_CARRERA);
    }

    const [materias] = await pool.query(
      'SELECT id, nombre, carrera_id, semestre, inscripciones_abiertas FROM materias WHERE id = ?',
      [materiaId]
    );
    const materia = materias[0];
    if (!materia) {
      return res.status(404).json({ ok: false, message: 'La materia no existe' });
    }
    if (materia.carrera_id !== estudiante.carrera_id || materia.semestre !== estudiante.semestre) {
      return res.status(403).json({ ok: false, message: 'Solo puedes inscribir materias de tu carrera y semestre' });
    }
    // El profesor cierra la lista cuando el período avanza y ya no admite estudiantes nuevos
    if (!materia.inscripciones_abiertas) {
      return res.status(403).json({
        ok: false,
        message: `Las inscripciones de ${materia.nombre} están cerradas. Consulta con tu profesor.`,
      });
    }

    const [inscritos] = await pool.query(
      'SELECT id FROM estudiante_materia WHERE estudiante_id = ? AND materia_id = ?',
      [estudianteId, materia.id]
    );
    if (inscritos.length > 0) {
      return res.status(409).json({ ok: false, message: 'Ya estás inscrito en esta materia' });
    }

    await pool.query(
      'INSERT INTO estudiante_materia (estudiante_id, materia_id, faltas_acumuladas) VALUES (?, ?, 0)',
      [estudianteId, materia.id]
    );

    res.status(201).json({
      ok: true,
      message: `Inscripción exitosa en ${materia.nombre}`,
      materia: { id: materia.id, nombre: materia.nombre },
    });
  } catch (error) {
    // Dos solicitudes simultáneas: la llave única (estudiante_id, materia_id) rechaza la segunda
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Ya estás inscrito en esta materia' });
    }
    next(error);
  }
};

// Profesor: materias que tiene asignadas. Estudiante: materias en las que está inscrito.
const misMaterias = async (req, res, next) => {
  try {
    const { id, rol } = req.usuario;
    const tablaRelacion = rol === 'profesor' ? 'profesor_materia' : 'estudiante_materia';
    const columnaUsuario = rol === 'profesor' ? 'profesor_id' : 'estudiante_id';

    // El profesor necesita el código de inscripción para compartirlo con sus estudiantes.
    // La carrera distingue materias homónimas (ej. "Inglés I" de Informática y de Administración).
    const [materias] = await pool.query(
      `SELECT m.id, m.nombre, m.carrera_id, car.nombre AS nombre_carrera${rol === 'profesor' ? ', m.codigo_inscripcion, m.inscripciones_abiertas' : ''}
       FROM ${tablaRelacion} r
       INNER JOIN materias m ON m.id = r.materia_id
       INNER JOIN carreras car ON car.id = m.carrera_id
       WHERE r.${columnaUsuario} = ?
       ORDER BY m.nombre, car.nombre`,
      [id]
    );

    // MariaDB devuelve los BOOLEAN como 0/1: se convierten para que el JSON tenga true/false
    res.json({
      ok: true,
      materias: materias.map((m) => (
        'inscripciones_abiertas' in m ? { ...m, inscripciones_abiertas: Boolean(m.inscripciones_abiertas) } : m
      )),
    });
  } catch (error) {
    next(error);
  }
};

// Coordinador: asigna una materia a un profesor (un profesor puede tener varias)
const asignarMateria = async (req, res, next) => {
  try {
    const { profesor_id, materia_id } = req.body || {};

    if (!profesor_id || !materia_id) {
      return res.status(400).json({ ok: false, message: 'profesor_id y materia_id son obligatorios' });
    }

    const [profesores] = await pool.query(
      "SELECT id, nombre FROM usuarios WHERE id = ? AND rol = 'profesor'",
      [profesor_id]
    );
    if (profesores.length === 0) {
      return res.status(404).json({ ok: false, message: 'El profesor no existe' });
    }

    const [materias] = await pool.query('SELECT id, nombre, carrera_id FROM materias WHERE id = ?', [materia_id]);
    if (materias.length === 0) {
      return res.status(404).json({ ok: false, message: 'La materia no existe' });
    }
    // El coordinador de carrera solo asigna materias de su carrera (req.alcance lo define resolverAlcance)
    if (!puedeVerCarrera(req.alcance, materias[0].carrera_id)) {
      return res.status(403).json({ ok: false, message: 'Solo puedes asignar materias de tu carrera' });
    }

    await pool.query('INSERT INTO profesor_materia (profesor_id, materia_id) VALUES (?, ?)', [profesor_id, materia_id]);

    res.status(201).json({
      ok: true,
      message: `${materias[0].nombre} asignada a ${profesores[0].nombre}`,
      asignacion: { profesor_id: Number(profesor_id), materia_id: Number(materia_id) },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'El profesor ya tiene asignada esa materia' });
    }
    next(error);
  }
};

// Quita una materia a un profesor (mismo alcance que asignarMateria)
const quitarMateria = async (req, res, next) => {
  try {
    const profesorId = Number(req.params.profesorId);
    const materiaId = Number(req.params.materiaId);

    const [materias] = await pool.query('SELECT carrera_id FROM materias WHERE id = ?', [materiaId]);
    if (materias.length === 0) {
      return res.status(404).json({ ok: false, message: 'La materia no existe' });
    }
    if (!puedeVerCarrera(req.alcance, materias[0].carrera_id)) {
      return res.status(403).json({ ok: false, message: 'Solo puedes gestionar materias de tu carrera' });
    }

    const [result] = await pool.query(
      'DELETE FROM profesor_materia WHERE profesor_id = ? AND materia_id = ?',
      [profesorId, materiaId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'El profesor no tiene asignada esa materia' });
    }

    res.json({ ok: true, message: 'Materia retirada del profesor' });
  } catch (error) {
    next(error);
  }
};

// Un profesor solo puede ver y gestionar las materias que tiene asignadas
const profesorDictaMateria = async (profesorId, materiaId) => {
  const [filas] = await pool.query(
    'SELECT id FROM profesor_materia WHERE profesor_id = ? AND materia_id = ?',
    [profesorId, materiaId]
  );
  return filas.length > 0;
};

// Profesor: lista de inscritos de una materia con su estado en una clase y sus faltas.
// ?clase_id=N usa esa clase; sin el parámetro se usa la clase más reciente de la materia.
const listarEstudiantesMateria = async (req, res, next) => {
  try {
    const materiaId = Number(req.params.id);
    const profesorId = req.usuario.id;

    const [materias] = await pool.query(
      'SELECT id, nombre, codigo_inscripcion, inscripciones_abiertas FROM materias WHERE id = ?',
      [materiaId]
    );
    const materia = materias[0];
    if (!materia) {
      return res.status(404).json({ ok: false, message: 'La materia no existe' });
    }
    if (!(await profesorDictaMateria(profesorId, materiaId))) {
      return res.status(403).json({ ok: false, message: 'Solo puedes ver la lista de tus propias materias' });
    }

    const claseSolicitada = req.query.clase_id ? Number(req.query.clase_id) : null;
    const [clases] = await pool.query(
      claseSolicitada
        ? 'SELECT id, estado, fecha FROM clases WHERE id = ? AND materia_id = ?'
        : 'SELECT id, estado, fecha FROM clases WHERE materia_id = ? ORDER BY fecha DESC, id DESC LIMIT 1',
      claseSolicitada ? [claseSolicitada, materiaId] : [materiaId]
    );
    const clase = clases[0] || null;

    const [estudiantes] = await pool.query(
      `SELECT u.id, u.nombre, u.cedula, em.faltas_acumuladas, a.estado AS estado_clase
       FROM estudiante_materia em
       INNER JOIN usuarios u ON u.id = em.estudiante_id
       LEFT JOIN asistencias a ON a.estudiante_id = u.id AND a.clase_id = ?
       WHERE em.materia_id = ?
       ORDER BY u.nombre`,
      [clase ? clase.id : null, materiaId]
    );

    // Sin fila de asistencia: "pendiente" si la clase sigue abierta (aún puede escanear);
    // null si no hay clase o si el estudiante se inscribió después de cerrarla
    const lista = estudiantes.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      cedula: e.cedula,
      faltas_acumuladas: e.faltas_acumuladas || 0,
      estado: e.estado_clase || (clase && clase.estado === 'abierta' ? 'pendiente' : null),
    }));

    const contar = (estado) => lista.filter((e) => e.estado === estado).length;
    res.json({
      ok: true,
      materia: { ...materia, inscripciones_abiertas: Boolean(materia.inscripciones_abiertas) },
      clase,
      resumen: {
        inscritos: lista.length,
        presentes: contar('presente'),
        ausentes: contar('ausente'),
        justificados: contar('justificado'),
        pendientes: contar('pendiente'),
        en_riesgo: lista.filter((e) => e.faltas_acumuladas > LIMITE_FALTAS_AVISO).length,
      },
      limite_faltas_aviso: LIMITE_FALTAS_AVISO,
      estudiantes: lista,
    });
  } catch (error) {
    next(error);
  }
};

// Profesor: abre o cierra la lista de inscripción de su materia ({ abiertas: true|false })
const cambiarInscripciones = async (req, res, next) => {
  try {
    const materiaId = Number(req.params.id);
    const { abiertas } = req.body || {};

    if (typeof abiertas !== 'boolean') {
      return res.status(400).json({ ok: false, message: 'abiertas debe ser true o false' });
    }
    const [materias] = await pool.query('SELECT id, nombre FROM materias WHERE id = ?', [materiaId]);
    if (materias.length === 0) {
      return res.status(404).json({ ok: false, message: 'La materia no existe' });
    }
    if (!(await profesorDictaMateria(req.usuario.id, materiaId))) {
      return res.status(403).json({ ok: false, message: 'Solo puedes gestionar tus propias materias' });
    }

    await pool.query('UPDATE materias SET inscripciones_abiertas = ? WHERE id = ?', [abiertas, materiaId]);

    res.json({
      ok: true,
      message: abiertas
        ? `Inscripciones de ${materias[0].nombre} abiertas`
        : `Inscripciones de ${materias[0].nombre} cerradas: ya no se admiten estudiantes nuevos`,
      materia: { id: materiaId, inscripciones_abiertas: abiertas },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listarCarreras,
  listarCarrerasPublicas,
  crearCarrera,
  crearMateria,
  miPensum,
  inscribirme,
  misMaterias,
  asignarMateria,
  quitarMateria,
  listarEstudiantesMateria,
  cambiarInscripciones,
};
