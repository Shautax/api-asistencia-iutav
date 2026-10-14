const { Router } = require('express');
const { listarAlertas } = require('../controllers/alertaController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { resolverAlcance } = require('../middlewares/alcanceMiddleware');
const { COORDINADORES } = require('../config/roles');

const router = Router();

router.get('/alertas', verifyToken, checkRole(COORDINADORES), resolverAlcance, listarAlertas);

module.exports = router;
