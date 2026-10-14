const { Router } = require('express');
const { getConfiguracionRed, actualizarConfiguracionRed } = require('../controllers/configuracionController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { ROLES } = require('../config/roles');

const router = Router();

router.get('/configuracion/red', verifyToken, checkRole([ROLES.COORDINADOR_MASTER]), getConfiguracionRed);
router.put('/configuracion/red', verifyToken, checkRole([ROLES.COORDINADOR_MASTER]), actualizarConfiguracionRed);

module.exports = router;
