const { Router } = require('express');
const { listarProfesores } = require('../controllers/profesorController');
const { asignarMateria, quitarMateria } = require('../controllers/academicoController');
const { verifyToken, checkRole } = require('../middlewares/authMiddleware');
const { resolverAlcance } = require('../middlewares/alcanceMiddleware');
const { COORDINADORES } = require('../config/roles');

const router = Router();

// Gestión docente: el master opera sobre todo el instituto; el coordinador de carrera solo sobre
// las materias de su carrera (se valida en los controladores con req.alcance)
const soloCoordinadores = [verifyToken, checkRole(COORDINADORES), resolverAlcance];

router.get('/profesores', soloCoordinadores, listarProfesores);
router.post('/profesores/asignar-materia', soloCoordinadores, asignarMateria);
router.delete('/profesores/:profesorId/materias/:materiaId', soloCoordinadores, quitarMateria);

module.exports = router;
