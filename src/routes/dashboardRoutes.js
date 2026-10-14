const { Router } = require('express');
const {
  obtenerEstadisticas,
  listarAlumnosGraves,
  listarAlumnos,
  listarCarrerasDashboard,
  listarMateriasCarrera,
} = require('../controllers/dashboardController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { resolverAlcance } = require('../middlewares/alcanceMiddleware');
const { COORDINADORES } = require('../config/roles');

const router = Router();

// Todas responden según el rol: el master ve el instituto, el coordinador de carrera solo su carrera
const soloCoordinadores = [verifyToken, checkRole(COORDINADORES), resolverAlcance];

router.get('/dashboard/estadisticas', soloCoordinadores, obtenerEstadisticas);
router.get('/dashboard/alumnos-graves', soloCoordinadores, listarAlumnosGraves);
router.get('/dashboard/alumnos', soloCoordinadores, listarAlumnos);
router.get('/dashboard/carreras', soloCoordinadores, listarCarrerasDashboard);
router.get('/dashboard/carreras/:id/materias', soloCoordinadores, listarMateriasCarrera);

module.exports = router;
