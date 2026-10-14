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
const { ROLES } = require('../config/roles');

const router = Router();

const soloMaster = [verifyToken, checkRole([ROLES.COORDINADOR_MASTER])];

// Pública: el panel web permite pedir acceso; la cuenta queda 'pendiente' hasta que el master la apruebe
router.post('/coordinadores/solicitudes', solicitarAcceso);

router.get('/coordinadores', soloMaster, listarCoordinadores);
router.post('/coordinadores', soloMaster, crearCoordinador);
router.put('/coordinadores/:id/password', soloMaster, restablecerPassword);
router.get('/coordinadores/solicitudes', soloMaster, listarSolicitudes);
router.put('/coordinadores/solicitudes/:id/aprobar', soloMaster, aprobarSolicitud);
router.delete('/coordinadores/solicitudes/:id', soloMaster, rechazarSolicitud);

module.exports = router;
