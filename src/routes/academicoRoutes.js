const { Router } = require('express');
const {
  listarCarreras,
  listarCarrerasPublicas,
  crearCarrera,
  crearMateria,
  miPensum,
  inscribirme,
  misMaterias,
  asignarMateria,
  listarEstudiantesMateria,
  cambiarInscripciones,
} = require('../controllers/academicoController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { resolverAlcance } = require('../middlewares/alcanceMiddleware');
const { ROLES, COORDINADORES } = require('../config/roles');

const router = Router();

const soloMaster = [verifyToken, checkRole([ROLES.COORDINADOR_MASTER])];

// Pública (solo id, nombre y código): el registro de la app la necesita antes de iniciar sesión
router.get('/carreras', listarCarrerasPublicas);
router.get('/academico/carreras', soloMaster, listarCarreras);
router.post('/academico/carreras', soloMaster, crearCarrera);
// El coordinador de carrera solo puede crear materias en su carrera (se valida en el controlador)
router.post('/academico/materias', verifyToken, checkRole(COORDINADORES), resolverAlcance, crearMateria);
// Equivalente a POST /profesores/asignar-materia (se mantiene por compatibilidad)
router.post('/academico/asignaciones', soloMaster, resolverAlcance, asignarMateria);
router.get('/academico/pensum', verifyToken, checkRole(['estudiante']), miPensum);
router.post('/academico/inscribirme', verifyToken, checkRole(['estudiante']), inscribirme);
router.get('/academico/mis-materias', verifyToken, checkRole(['profesor', 'estudiante']), misMaterias);
router.get('/academico/materias/:id/estudiantes', verifyToken, checkRole(['profesor']), listarEstudiantesMateria);
router.put('/academico/materias/:id/inscripciones', verifyToken, checkRole(['profesor']), cambiarInscripciones);

module.exports = router;
