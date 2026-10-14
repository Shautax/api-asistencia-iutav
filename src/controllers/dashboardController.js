const { pool } = require('../config/db');
const { PORCENTAJE_INASISTENCIA_GRAVE } = require('../config/reglas');
const { puedeVerCarrera } = require('../middlewares/alcanceMiddleware');

// Inasistencia = faltas sin justificar ('ausente') sobre el total de registros de clases cerradas.
// Los justificativos aprobados pasan a 'justificado' y no cuentan como falta.

const TOP_MATERIAS = 3;
const PUNTOS_TENDENCIA = 6;

// Condición extra para limitar las consultas a la carrera del coordinador (vacía para el master)
const filtroCarrera = (alcance, alias = 'm') =>
  alcance.carreraId === null
    ? { sql: '', params: [] }
    : { sql: ` AND ${alias}.carrera_id = ?`, params: [alcance.carreraId] };

// MySQL devuelve SUM() como texto (DECIMAL): se convierte a número
const num = (valor) => Number(valor) || 0;

const porcentaje = (parte, total) => (total > 0 ? Math.round((1000 * parte) / total) / 10 : 0);

const nombreCarrera = async (carreraId) => {
  const [filas] = await pool.query('SELECT id, nombre, codigo FROM carreras WHERE id = ?', [carreraId]);
  return filas[0] || null;
};

// GET /dashboard/estadisticas
const obtenerEstadisticas = async (req, res, next) => {
  try {
    const filtro = filtroCarrera(req.alcance);

    const [[general]] = await pool.query(
      `SELECT COUNT(*) AS registros,
              SUM(a.estado = 'ausente') AS ausencias,
              SUM(a.estado = 'justificado') AS justificadas,
              COUNT(DISTINCT c.id) AS clases
       FROM asistencias a
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       WHERE c.estado = 'cerrada'${filtro.sql}`,
      filtro.params
    );

    const [[conteos]] = await pool.query(
      `SELECT COUNT(DISTINCT m.carrera_id) AS carreras,
              COUNT(DISTINCT m.id) AS materias,
              (SELECT COUNT(DISTINCT em.estudiante_id)
               FROM estudiante_materia em
               INNER JOIN materias m ON m.id = em.materia_id
               WHERE 1 = 1${filtro.sql}) AS estudiantes
       FROM materias m
       WHERE 1 = 1${filtro.sql}`,
      [...filtro.params, ...filtro.params]
    );

    const [materias] = await pool.query(
      `SELECT m.id, m.nombre, car.nombre AS carrera,
              COUNT(*) AS registros,
              SUM(a.estado = 'ausente') AS ausencias
       FROM asistencias a
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       INNER JOIN carreras car ON car.id = m.carrera_id
       WHERE c.estado = 'cerrada'${filtro.sql}
       GROUP BY m.id, m.nombre, car.nombre`,
      filtro.params
    );

    const topMaterias = materias
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        carrera: m.carrera,
        registros: m.registros,
        ausencias: num(m.ausencias),
        porcentaje: porcentaje(num(m.ausencias), m.registros),
      }))
      .sort((a, b) => b.porcentaje - a.porcentaje)
      .slice(0, TOP_MATERIAS);

    // Tendencia: % de inasistencia de las últimas clases cerradas de cada materia del top
    if (topMaterias.length > 0) {
      const [porClase] = await pool.query(
        `SELECT c.materia_id, c.id, c.fecha,
                COUNT(*) AS registros,
                SUM(a.estado = 'ausente') AS ausencias
         FROM clases c
         INNER JOIN asistencias a ON a.clase_id = c.id
         WHERE c.estado = 'cerrada' AND c.materia_id IN (?)
         GROUP BY c.materia_id, c.id, c.fecha
         ORDER BY c.fecha, c.id`,
        [topMaterias.map((m) => m.id)]
      );
      for (const materia of topMaterias) {
        materia.tendencia = porClase
          .filter((c) => c.materia_id === materia.id)
          .slice(-PUNTOS_TENDENCIA)
          .map((c) => porcentaje(num(c.ausencias), c.registros));
      }
    }

    const registros = general.registros;
    res.json({
      ok: true,
      alcance: req.alcance.carreraId === null
        ? { tipo: 'instituto', carrera: null }
        : { tipo: 'carrera', carrera: await nombreCarrera(req.alcance.carreraId) },
      inasistencia_general: {
        porcentaje: porcentaje(num(general.ausencias), registros),
        registros,
        ausencias: num(general.ausencias),
        justificadas: num(general.justificadas),
        clases_cerradas: general.clases,
      },
      totales: {
        carreras: conteos.carreras,
        materias: conteos.materias,
        estudiantes: num(conteos.estudiantes),
      },
      top_materias: topMaterias,
    });
  } catch (error) {
    next(error);
  }
};

// GET /dashboard/alumnos-graves
const listarAlumnosGraves = async (req, res, next) => {
  try {
    const filtro = filtroCarrera(req.alcance);

    const [filas] = await pool.query(
      `SELECT u.id AS estudiante_id, u.nombre, u.cedula,
              m.id AS materia_id, m.nombre AS materia,
              car.id AS carrera_id, car.nombre AS carrera,
              COUNT(*) AS clases,
              SUM(a.estado = 'ausente') AS ausencias,
              SUM(a.estado = 'justificado') AS justificadas
       FROM asistencias a
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       INNER JOIN carreras car ON car.id = m.carrera_id
       INNER JOIN usuarios u ON u.id = a.estudiante_id
       WHERE c.estado = 'cerrada'${filtro.sql}
       GROUP BY u.id, u.nombre, u.cedula, m.id, m.nombre, car.id, car.nombre`,
      filtro.params
    );

    const alumnos = filas
      .map((f) => ({
        ...f,
        ausencias: num(f.ausencias),
        justificadas: num(f.justificadas),
        porcentaje: porcentaje(num(f.ausencias), f.clases),
      }))
      .filter((f) => f.porcentaje >= PORCENTAJE_INASISTENCIA_GRAVE)
      .sort((a, b) => b.porcentaje - a.porcentaje || a.nombre.localeCompare(b.nombre));

    res.json({
      ok: true,
      umbral_porcentaje: PORCENTAJE_INASISTENCIA_GRAVE,
      total: alumnos.length,
      alumnos,
    });
  } catch (error) {
    next(error);
  }
};

// GET /dashboard/alumnos: estudiantes inscritos en materias del alcance, con su inasistencia
const listarAlumnos = async (req, res, next) => {
  try {
    const filtro = filtroCarrera(req.alcance);

    const [inscritos] = await pool.query(
      `SELECT u.id, u.nombre, u.cedula, u.correo,
              COUNT(DISTINCT em.materia_id) AS materias,
              GROUP_CONCAT(DISTINCT car.nombre ORDER BY car.nombre SEPARATOR ', ') AS carreras
       FROM estudiante_materia em
       INNER JOIN usuarios u ON u.id = em.estudiante_id
       INNER JOIN materias m ON m.id = em.materia_id
       INNER JOIN carreras car ON car.id = m.carrera_id
       WHERE 1 = 1${filtro.sql}
       GROUP BY u.id, u.nombre, u.cedula, u.correo
       ORDER BY u.nombre`,
      filtro.params
    );

    const [asistencia] = await pool.query(
      `SELECT a.estudiante_id,
              COUNT(*) AS registros,
              SUM(a.estado = 'ausente') AS ausencias,
              SUM(a.estado = 'justificado') AS justificadas
       FROM asistencias a
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       WHERE c.estado = 'cerrada'${filtro.sql}
       GROUP BY a.estudiante_id`,
      filtro.params
    );
    const porEstudiante = new Map(asistencia.map((a) => [a.estudiante_id, a]));

    const alumnos = inscritos.map((alumno) => {
      const a = porEstudiante.get(alumno.id);
      const registros = a?.registros ?? 0;
      return {
        ...alumno,
        clases: registros,
        ausencias: num(a?.ausencias),
        justificadas: num(a?.justificadas),
        porcentaje: porcentaje(num(a?.ausencias), registros),
      };
    });

    res.json({ ok: true, umbral_porcentaje: PORCENTAJE_INASISTENCIA_GRAVE, total: alumnos.length, alumnos });
  } catch (error) {
    next(error);
  }
};

// GET /dashboard/carreras: todas (master) o solo la propia (coordinador de carrera)
const listarCarrerasDashboard = async (req, res, next) => {
  try {
    const filtroMat = filtroCarrera(req.alcance);
    const { params } = filtroMat;
    const { carreraId } = req.alcance;

    const [carreras] = await pool.query(
      'SELECT id, nombre, codigo FROM carreras WHERE ? IS NULL OR id = ? ORDER BY nombre',
      [carreraId, carreraId]
    );

    const [materias] = await pool.query(
      `SELECT m.id, m.nombre, m.semestre, m.carrera_id
       FROM materias m
       WHERE 1 = 1${filtroMat.sql}
       ORDER BY m.semestre IS NULL, m.semestre, m.nombre`,
      params
    );

    const [asistencia] = await pool.query(
      `SELECT m.carrera_id, COUNT(*) AS registros, SUM(a.estado = 'ausente') AS ausencias
       FROM asistencias a
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       WHERE c.estado = 'cerrada'${filtroMat.sql}
       GROUP BY m.carrera_id`,
      params
    );
    const porCarrera = new Map(asistencia.map((a) => [a.carrera_id, a]));

    res.json({
      ok: true,
      carreras: carreras.map((car) => {
        const a = porCarrera.get(car.id);
        return {
          ...car,
          materias: materias
            .filter((m) => m.carrera_id === car.id)
            .map(({ id, nombre, semestre }) => ({ id, nombre, semestre })),
          porcentaje_inasistencia: porcentaje(num(a?.ausencias), a?.registros ?? 0),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

// GET /dashboard/carreras/:id/materias: materias de la carrera con profesores e inasistencia
const listarMateriasCarrera = async (req, res, next) => {
  try {
    const carreraId = Number(req.params.id);
    if (!puedeVerCarrera(req.alcance, carreraId)) {
      return res.status(403).json({ ok: false, message: 'Solo puedes consultar las materias de tu carrera' });
    }

    const carrera = await nombreCarrera(carreraId);
    if (!carrera) {
      return res.status(404).json({ ok: false, message: 'La carrera no existe' });
    }

    const [materias] = await pool.query(
      `SELECT m.id, m.nombre, m.codigo, m.semestre,
              (SELECT GROUP_CONCAT(u.nombre ORDER BY u.nombre SEPARATOR ', ')
               FROM profesor_materia pm INNER JOIN usuarios u ON u.id = pm.profesor_id
               WHERE pm.materia_id = m.id) AS profesores,
              (SELECT COUNT(*) FROM estudiante_materia em WHERE em.materia_id = m.id) AS inscritos,
              (SELECT COUNT(*) FROM asistencias a INNER JOIN clases c ON c.id = a.clase_id
               WHERE c.materia_id = m.id AND c.estado = 'cerrada') AS registros,
              (SELECT COUNT(*) FROM asistencias a INNER JOIN clases c ON c.id = a.clase_id
               WHERE c.materia_id = m.id AND c.estado = 'cerrada' AND a.estado = 'ausente') AS ausencias
       FROM materias m
       WHERE m.carrera_id = ?
       ORDER BY m.semestre IS NULL, m.semestre, m.nombre`,
      [carreraId]
    );

    res.json({
      ok: true,
      carrera,
      materias: materias.map(({ registros, ausencias, ...m }) => ({
        ...m,
        porcentaje_inasistencia: porcentaje(ausencias, registros),
      })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  obtenerEstadisticas,
  listarAlumnosGraves,
  listarAlumnos,
  listarCarrerasDashboard,
  listarMateriasCarrera,
};
