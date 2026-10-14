const { Router } = require('express');
const { registro, login } = require('../controllers/authController');
const { checkMaster, registroPanel } = require('../controllers/coordinadorController');

const router = Router();

router.post('/registro', registro);
router.post('/login', login);

// Panel web: instalación del primer master y solicitudes de acceso de coordinadores
router.get('/auth/check-master', checkMaster);
router.post('/auth/registro', registroPanel);

module.exports = router;
