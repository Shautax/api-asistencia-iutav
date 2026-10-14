const { pool } = require('../config/db');

const LIMITE_FALTAS = 3;

const listarAlertas = async (req, res, next) => {
  try {
    // Las inasistencias justificadas tienen estado 'justificado', así que no cuentan como faltas
    const [alertas] = await pool.query(
      `SELECT u.id AS estudiante_id, u.nombre, u.cedula,
              m.id AS materia_id, m.nombre AS materia,
              COUNT(*) AS total_faltas
       FROM asistencias a
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       INNER JOIN usuarios u ON u.id = a.estudiante_id
       WHERE a.estado = 'ausente' AND (? IS NULL OR m.carrera_id = ?)
       GROUP BY u.id, u.nombre, u.cedula, m.id, m.nombre
       HAVING COUNT(*) >= ?
       ORDER BY total_faltas DESC, u.nombre`,
      [req.alcance.carreraId, req.alcance.carreraId, LIMITE_FALTAS]
    );

    res.json({ ok: true, limite_faltas: LIMITE_FALTAS, total: alertas.length, alertas });
  } catch (error) {
    next(error);
  }
};

module.exports = { listarAlertas };
