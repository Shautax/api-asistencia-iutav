const { Router } = require('express');
const { crearClase, cerrarClase } = require('../controllers/claseController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');

const router = Router();

router.post('/clases', verifyToken, checkRole(['profesor']), crearClase);
router.put('/clases/:id/cerrar', verifyToken, checkRole(['profesor']), cerrarClase);

module.exports = router;
