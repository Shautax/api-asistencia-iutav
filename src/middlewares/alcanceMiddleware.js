const { pool } = require('../config/db');
const { ROLES } = require('../config/roles');

// Define qué parte del instituto puede ver el coordinador (usar después de verifyToken):
//   req.alcance = { carreraId: null }  -> master, todo el instituto
//   req.alcance = { carreraId: N }     -> coordinador de carrera, solo su carrera
// La carrera se lee de la BD (no del token) para que un cambio de asignación aplique de inmediato.
const resolverAlcance = async (req, res, next) => {
  try {
    if (req.usuario.rol === ROLES.COORDINADOR_MASTER) {
      req.alcance = { carreraId: null };
      return next();
    }

    if (req.usuario.rol === ROLES.COORDINADOR_CARRERA) {
      const [filas] = await pool.query(
        'SELECT carrera_id FROM usuarios WHERE id = ? AND rol = ?',
        [req.usuario.id, ROLES.COORDINADOR_CARRERA]
      );
      const carreraId = filas[0]?.carrera_id;
      if (!carreraId) {
        return res.status(403).json({ ok: false, message: 'No tienes una carrera asignada. Contacta al coordinador master.' });
      }
      req.alcance = { carreraId };
      return next();
    }

    return res.status(403).json({ ok: false, message: 'No tienes permisos para realizar esta acción' });
  } catch (error) {
    next(error);
  }
};

// Un coordinador de carrera solo puede acceder a recursos de su propia carrera
const puedeVerCarrera = (alcance, carreraId) =>
  alcance.carreraId === null || alcance.carreraId === Number(carreraId);

module.exports = { resolverAlcance, puedeVerCarrera };
