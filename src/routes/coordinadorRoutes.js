const { Router } = require('express');
const {
  listarCoordinadores,
  crearCoordinador,
  solicitarAcceso,
  listarSolicitudes,
  aprobarSolicitud,
  rechazarSolicitud,
  restablecerPassword,
} = require('../controllers/coordinadorController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { ROLES, COORDINADORES } = require('../config/roles');

const router = Router();

const soloMaster = [verifyToken, checkRole([ROLES.COORDINADOR_MASTER])];
// Ambos coordinadores gestionan solicitudes; el controlador impide que un coordinador de carrera
// apruebe o rechace a otro coordinador
const coordinadores = [verifyToken, checkRole(COORDINADORES)];

// Pública: el panel web permite pedir acceso; la cuenta queda 'pendiente' hasta que el master la apruebe
router.post('/coordinadores/solicitudes', solicitarAcceso);

router.get('/coordinadores', soloMaster, listarCoordinadores);
router.post('/coordinadores', soloMaster, crearCoordinador);
router.put('/coordinadores/:id/password', soloMaster, restablecerPassword);
router.get('/coordinadores/solicitudes', coordinadores, listarSolicitudes);
router.put('/coordinadores/solicitudes/:id/aprobar', coordinadores, aprobarSolicitud);
router.delete('/coordinadores/solicitudes/:id', coordinadores, rechazarSolicitud);

module.exports = router;
