const { Router } = require('express');
const { crearJustificativo, listarPendientes, actualizarEstado, verArchivo } = require('../controllers/justificativoController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { uploadArchivo } = require('../middlewares/uploadMiddleware');

const router = Router();

// La autenticación va antes de multer para no guardar archivos de peticiones no autorizadas
router.post('/justificativos', verifyToken, checkRole(['estudiante']), uploadArchivo('archivo'), crearJustificativo);
router.get('/justificativos/pendientes', verifyToken, checkRole(['profesor']), listarPendientes);
router.put('/justificativos/:id/estado', verifyToken, checkRole(['profesor']), actualizarEstado);
router.get('/justificativos/archivo/:filename', verifyToken, verArchivo);

module.exports = router;
