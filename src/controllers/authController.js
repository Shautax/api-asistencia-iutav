const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getTokenPayload } = require('../middlewares/authMiddleware');
const { ROLES, TODOS_LOS_ROLES, esCoordinador } = require('../config/roles');
const { SEMESTRES_ESTUDIANTE } = require('../config/reglas');

// Roles que cada tipo de coordinador puede asignar al registrar un usuario
const ROLES_ASIGNABLES = {
  [ROLES.COORDINADOR_MASTER]: TODOS_LOS_ROLES,
  [ROLES.COORDINADOR_CARRERA]: [ROLES.ESTUDIANTE, ROLES.PROFESOR],
};

// Valores de rol que acepta el registro público (app móvil) y el rol con que se guardan
const ROLES_PUBLICOS = {
  alumno: ROLES.ESTUDIANTE,
  profesor: ROLES.PROFESOR,
};

const registro = async (req, res, next) => {
  try {
    const { cedula, nombre, correo, password, carrera_id, semestre } = req.body || {};

    if (!cedula || !nombre || !correo || !password) {
      return res.status(400).json({ ok: false, message: 'cedula, nombre, correo y password son obligatorios' });
    }

    // Un coordinador autenticado asigna roles según su tipo (solo el master crea coordinadores).
    // El registro público (app) solo admite alumno o profesor; sin rol se asume estudiante
    const solicitante = getTokenPayload(req);
    const registraCoordinador = Boolean(solicitante && esCoordinador(solicitante.rol));
    let rol = ROLES.ESTUDIANTE;
    let estado = 'aprobado';
    if (registraCoordinador) {
      rol = req.body.rol || ROLES.ESTUDIANTE;
      const permitidos = ROLES_ASIGNABLES[solicitante.rol];
      if (!permitidos.includes(rol)) {
        return res.status(400).json({ ok: false, message: `rol inválido. Valores permitidos: ${permitidos.join(', ')}` });
      }
    } else if (req.body.rol != null) {
      if (!Object.hasOwn(ROLES_PUBLICOS, req.body.rol)) {
        return res.status(400).json({ ok: false, message: `rol inválido. Valores permitidos: ${Object.keys(ROLES_PUBLICOS).join(', ')}` });
      }
      rol = ROLES_PUBLICOS[req.body.rol];
    }
    // El profesor que se registra solo no entra hasta que un coordinador lo apruebe
    if (!registraCoordinador && rol === ROLES.PROFESOR) {
      estado = 'pendiente';
    }

    // Carrera y semestre del estudiante: definen qué materias puede ver e inscribir.
    // Obligatorios en el registro público (app); un coordinador puede omitirlos.
    let carreraId = null;
    let semestreNum = null;
    if (rol === ROLES.ESTUDIANTE && (!registraCoordinador || carrera_id != null || semestre != null)) {
      carreraId = Number(carrera_id);
      semestreNum = Number(semestre);
      if (!Number.isInteger(carreraId) || carreraId <= 0) {
        return res.status(400).json({ ok: false, message: 'carrera_id es obligatorio' });
      }
      if (!Number.isInteger(semestreNum) || semestreNum < 1 || semestreNum > SEMESTRES_ESTUDIANTE) {
        return res.status(400).json({ ok: false, message: `semestre debe ser un número entre 1 y ${SEMESTRES_ESTUDIANTE}` });
      }
      const [carreras] = await pool.query('SELECT id FROM carreras WHERE id = ?', [carreraId]);
      if (carreras.length === 0) {
        return res.status(404).json({ ok: false, message: 'La carrera no existe' });
      }
      // Un coordinador de carrera solo registra estudiantes de su propia carrera
      if (solicitante?.rol === ROLES.COORDINADOR_CARRERA) {
        const [filas] = await pool.query('SELECT carrera_id FROM usuarios WHERE id = ?', [solicitante.id]);
        if (filas[0]?.carrera_id !== carreraId) {
          return res.status(403).json({ ok: false, message: 'Solo puedes registrar estudiantes de tu carrera' });
        }
      }
    }

    const [existentes] = await pool.query(
      'SELECT correo, cedula FROM usuarios WHERE correo = ? OR cedula = ?',
      [correo, cedula]
    );
    if (existentes.some((u) => u.correo === correo)) {
      return res.status(409).json({ ok: false, message: 'El correo ya está registrado' });
    }
    if (existentes.length > 0) {
      return res.status(409).json({ ok: false, message: 'La cédula ya está registrada' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (cedula, nombre, correo, password, rol, carrera_id, semestre, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [cedula, nombre, correo, hash, rol, carreraId, semestreNum, estado]
    );

    res.status(201).json({
      ok: true,
      message: estado === 'pendiente'
        ? 'Solicitud enviada. Un coordinador debe aprobar tu cuenta antes de que puedas ingresar.'
        : 'Usuario registrado correctamente',
      usuario: { id: result.insertId, cedula, nombre, correo, rol, estado, carrera_id: carreraId, semestre: semestreNum },
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { correo, cedula, password } = req.body || {};
    // Se puede entrar con correo o con cédula; la cédula se guarda solo con dígitos ("V-30.123.456" → "30123456")
    const cedulaLimpia = cedula != null ? String(cedula).replace(/\D/g, '') : '';

    if ((!correo && !cedulaLimpia) || !password) {
      return res.status(400).json({ ok: false, message: 'correo (o cedula) y password son obligatorios' });
    }

    const [rows] = await pool.query(
      `SELECT u.*, c.nombre AS carrera_nombre
       FROM usuarios u
       LEFT JOIN carreras c ON c.id = u.carrera_id
       WHERE ${correo ? 'u.correo = ?' : 'u.cedula = ?'}`,
      [correo || cedulaLimpia]
    );
    const usuario = rows[0];

    if (!usuario || !(await bcrypt.compare(password, usuario.password))) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }
    // Un coordinador que solicitó acceso no entra hasta que el coordinador master lo apruebe
    if (usuario.estado === 'pendiente') {
      return res.status(403).json({
        ok: false,
        message: 'Tu solicitud de acceso está pendiente de aprobación por el Coordinador Master.',
      });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, carrera_id: usuario.carrera_id ?? null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      ok: true,
      token,
      usuario: {
        id: usuario.id,
        cedula: usuario.cedula,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        // Estudiante: su carrera y semestre. Coordinador de carrera: la carrera que administra.
        carrera_id: usuario.carrera_id ?? null,
        carrera_nombre: usuario.carrera_nombre ?? null,
        semestre: usuario.semestre ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { registro, login };
