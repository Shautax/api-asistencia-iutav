const { pool } = require('../config/db');
const { LIMITE_FALTAS_AVISO } = require('../config/reglas');
const { ROLES } = require('../config/roles');

const registrarAsistencia = async (req, res, next) => {
  try {
    // La ubicación (latitud, longitud) ya la validó geocercaMiddleware contra configuracion_red
    const { qr_token } = req.body || {};
    const estudianteId = req.usuario.id;

    if (!qr_token) {
      return res.status(400).json({ ok: false, message: 'qr_token es obligatorio' });
    }

    // Validación 1: la clase existe y está abierta
    const [clases] = await pool.query('SELECT id, materia_id, estado FROM clases WHERE qr_token = ?', [qr_token]);
    const clase = clases[0];
    if (!clase || clase.estado !== 'abierta') {
      return res.status(400).json({ ok: false, message: 'Código QR inválido o clase inactiva' });
    }

    // Solo los inscritos en la materia pueden registrar asistencia en sus clases
    const [inscripciones] = await pool.query(
      'SELECT id FROM estudiante_materia WHERE estudiante_id = ? AND materia_id = ?',
      [estudianteId, clase.materia_id]
    );
    if (inscripciones.length === 0) {
      return res.status(403).json({ ok: false, message: 'No estás inscrito en la materia de esta clase' });
    }

    // Validación 2: el estudiante no tiene asistencia registrada en esta clase
    const [existentes] = await pool.query(
      'SELECT id FROM asistencias WHERE clase_id = ? AND estudiante_id = ?',
      [clase.id, estudianteId]
    );
    if (existentes.length > 0) {
      return res.status(409).json({ ok: false, message: 'Asistencia ya registrada' });
    }

    const [result] = await pool.query(
      "INSERT INTO asistencias (clase_id, estudiante_id, estado, ubicacion_validada) VALUES (?, ?, 'presente', TRUE)",
      [clase.id, estudianteId]
    );

    res.status(201).json({
      ok: true,
      message: 'Asistencia registrada correctamente',
      asistencia: { id: result.insertId, clase_id: clase.id, estado: 'presente' },
    });
  } catch (error) {
    // Dos escaneos simultáneos del mismo estudiante: la llave única (clase_id, estudiante_id) rechaza el segundo
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Asistencia ya registrada' });
    }
    next(error);
  }
};

const listarAsistencias = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [clases] = await pool.query(
      'SELECT c.id, c.profesor_id, m.carrera_id FROM clases c INNER JOIN materias m ON m.id = c.materia_id WHERE c.id = ?',
      [id]
    );
    const clase = clases[0];
    if (!clase) {
      return res.status(404).json({ ok: false, message: 'La clase no existe' });
    }
    if (req.usuario.rol === 'profesor' && clase.profesor_id !== req.usuario.id) {
      return res.status(403).json({ ok: false, message: 'Solo puedes consultar la asistencia de tus propias clases' });
    }
    if (req.usuario.rol === ROLES.COORDINADOR_CARRERA) {
      const [filas] = await pool.query('SELECT carrera_id FROM usuarios WHERE id = ?', [req.usuario.id]);
      if (filas[0]?.carrera_id !== clase.carrera_id) {
        return res.status(403).json({ ok: false, message: 'Solo puedes consultar clases de tu carrera' });
      }
    }

    const [asistentes] = await pool.query(
      `SELECT u.nombre, u.cedula
       FROM asistencias a
       INNER JOIN usuarios u ON u.id = a.estudiante_id
       WHERE a.clase_id = ? AND a.estado = 'presente'
       ORDER BY u.nombre`,
      [id]
    );

    res.json({ ok: true, clase_id: clase.id, total: asistentes.length, asistentes });
  } catch (error) {
    next(error);
  }
};

// Estudiante: su resumen de asistencia, sus faltas por materia y sus inasistencias
// (cada una con el estado de su último justificativo, si envió alguno)
const misAsistencias = async (req, res, next) => {
  try {
    const estudianteId = req.usuario.id;

    const [[totales]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(estado = 'presente'), 0)    AS presentes,
              COALESCE(SUM(estado = 'ausente'), 0)     AS ausencias,
              COALESCE(SUM(estado = 'justificado'), 0) AS justificadas
       FROM asistencias
       WHERE estudiante_id = ?`,
      [estudianteId]
    );

    const [materias] = await pool.query(
      `SELECT m.id, m.nombre, em.faltas_acumuladas
       FROM estudiante_materia em
       INNER JOIN materias m ON m.id = em.materia_id
       WHERE em.estudiante_id = ?
       ORDER BY em.faltas_acumuladas DESC, m.nombre`,
      [estudianteId]
    );

    const [inasistencias] = await pool.query(
      `SELECT a.id AS asistencia_id, a.estado, c.id AS clase_id, c.fecha, m.nombre AS materia,
              j.id AS justificativo_id, j.estado_revision, j.motivo
       FROM asistencias a
       INNER JOIN clases c   ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       LEFT JOIN justificativos j ON j.id = (
         SELECT MAX(j2.id) FROM justificativos j2 WHERE j2.asistencia_id = a.id
       )
       WHERE a.estudiante_id = ? AND a.estado IN ('ausente', 'justificado')
       ORDER BY c.fecha DESC, a.id DESC`,
      [estudianteId]
    );

    const lista = inasistencias.map((i) => ({
      asistencia_id: i.asistencia_id,
      clase_id: i.clase_id,
      fecha: i.fecha,
      materia: i.materia,
      estado: i.estado,
      justificativo: i.justificativo_id
        ? { id: i.justificativo_id, estado_revision: i.estado_revision, motivo: i.motivo }
        : null,
      // Se puede justificar si sigue ausente y no hay un justificativo pendiente o aprobado
      justificable: i.estado === 'ausente' && (!i.justificativo_id || i.estado_revision === 'rechazado'),
    }));

    res.json({
      ok: true,
      resumen: {
        total: Number(totales.total),
        presentes: Number(totales.presentes),
        ausencias: Number(totales.ausencias),
        justificadas: Number(totales.justificadas),
        por_justificar: lista.filter((i) => i.justificable).length,
      },
      limite_faltas_aviso: LIMITE_FALTAS_AVISO,
      materias: materias.map((m) => ({ ...m, faltas_acumuladas: m.faltas_acumuladas || 0 })),
      inasistencias: lista,
    });
  } catch (error) {
    next(error);
  }
};

// Estudiante: historial completo (todas sus clases, no solo las faltas) y resumen por materia.
// Incluye todas las materias en las que está inscrito, aunque aún no tengan clases.
const historialAsistencias = async (req, res, next) => {
  try {
    const estudianteId = req.usuario.id;

    const [registros] = await pool.query(
      `SELECT a.id AS asistencia_id, a.estado, c.id AS clase_id, c.fecha,
              m.id AS materia_id, m.nombre AS materia, p.nombre AS profesor
       FROM asistencias a
       INNER JOIN clases c   ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       INNER JOIN usuarios p ON p.id = c.profesor_id
       WHERE a.estudiante_id = ?
       ORDER BY c.fecha DESC, a.id DESC`,
      [estudianteId]
    );

    const [materias] = await pool.query(
      `SELECT m.id, m.nombre, em.faltas_acumuladas,
              COUNT(a.id)                              AS total,
              COALESCE(SUM(a.estado = 'presente'), 0)    AS presentes,
              COALESCE(SUM(a.estado = 'ausente'), 0)     AS ausencias,
              COALESCE(SUM(a.estado = 'justificado'), 0) AS justificadas
       FROM estudiante_materia em
       INNER JOIN materias m ON m.id = em.materia_id
       LEFT JOIN clases c ON c.materia_id = m.id
       LEFT JOIN asistencias a ON a.clase_id = c.id AND a.estudiante_id = em.estudiante_id
       WHERE em.estudiante_id = ?
       GROUP BY m.id, m.nombre, em.faltas_acumuladas
       ORDER BY m.nombre`,
      [estudianteId]
    );

    // Las justificadas cuentan como asistencia en el porcentaje (igual que en el panel)
    const porcentaje = (presentes, justificadas, total) =>
      total > 0 ? Math.round(((presentes + justificadas) * 100) / total) : null;

    res.json({
      ok: true,
      limite_faltas_aviso: LIMITE_FALTAS_AVISO,
      materias: materias.map((m) => {
        const total = Number(m.total);
        const presentes = Number(m.presentes);
        const justificadas = Number(m.justificadas);
        return {
          id: m.id,
          nombre: m.nombre,
          faltas_acumuladas: m.faltas_acumuladas || 0,
          total,
          presentes,
          ausencias: Number(m.ausencias),
          justificadas,
          porcentaje: porcentaje(presentes, justificadas, total),
        };
      }),
      registros,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { registrarAsistencia, listarAsistencias, misAsistencias, historialAsistencias };
