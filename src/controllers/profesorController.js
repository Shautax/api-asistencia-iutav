const { pool } = require('../config/db');
const { ROLES } = require('../config/roles');

// Coordinadores: profesores con las materias que tienen asignadas.
// Se listan todos los profesores (un coordinador de carrera puede asignarle materias a cualquiera),
// pero el coordinador de carrera solo ve las materias de su carrera (req.alcance).
const listarProfesores = async (req, res, next) => {
  try {
    const { carreraId } = req.alcance;

    const [profesores] = await pool.query(
      'SELECT id, cedula, nombre, correo FROM usuarios WHERE rol = ? ORDER BY nombre',
      [ROLES.PROFESOR]
    );

    const [asignaciones] = await pool.query(
      `SELECT pm.profesor_id, m.id, m.nombre, car.id AS carrera_id, car.nombre AS carrera
       FROM profesor_materia pm
       INNER JOIN materias m ON m.id = pm.materia_id
       INNER JOIN carreras car ON car.id = m.carrera_id
       WHERE ? IS NULL OR m.carrera_id = ?
       ORDER BY car.nombre, m.nombre`,
      [carreraId, carreraId]
    );

    res.json({
      ok: true,
      total: profesores.length,
      profesores: profesores.map((p) => ({
        ...p,
        materias: asignaciones
          .filter((a) => a.profesor_id === p.id)
          .map(({ profesor_id, ...materia }) => materia),
      })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listarProfesores };
