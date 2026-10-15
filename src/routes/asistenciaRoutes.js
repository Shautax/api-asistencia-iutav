const { Router } = require('express');
const {
  registrarAsistencia,
  listarAsistencias,
  misAsistencias,
  historialAsistencias,
} = require('../controllers/asistenciaController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { validarGeocerca } = require('../middlewares/geocercaMiddleware');
const { COORDINADORES } = require('../config/roles');

const router = Router();

router.post('/asistencias/registrar', verifyToken, checkRole(['estudiante']), validarGeocerca, registrarAsistencia);
router.get('/asistencias/mias', verifyToken, checkRole(['estudiante']), misAsistencias);
router.get('/asistencias/historial', verifyToken, checkRole(['estudiante']), historialAsistencias);
router.get('/clases/:id/asistencias', verifyToken, checkRole(['profesor', ...COORDINADORES]), listarAsistencias);

module.exports = router;
