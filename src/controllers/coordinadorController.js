const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { ROLES, COORDINADORES } = require('../config/roles');

const LARGO_MINIMO_PASSWORD = 6;

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Coordinador master: lista los coordinadores aprobados con la carrera que administran
const listarCoordinadores = async (req, res, next) => {
  try {
    const [coordinadores] = await pool.query(
      `SELECT u.id, u.cedula, u.nombre, u.correo, u.rol, u.carrera_id, c.nombre AS carrera
       FROM usuarios u
       LEFT JOIN carreras c ON c.id = u.carrera_id
       WHERE u.rol IN (?) AND u.estado = 'aprobado'
       ORDER BY u.rol, u.nombre`,
      [COORDINADORES]
    );

    res.json({ ok: true, total: coordinadores.length, coordinadores });
  } catch (error) {
    next(error);
  }
};

// Coordinador master: crea un coordinador master o de carrera
const crearCoordinador = async (req, res, next) => {
  try {
    const { cedula, nombre, correo, password, rol, carrera_id } = req.body || {};

    if (!cedula || !nombre || !correo || !password || !rol) {
      return res.status(400).json({ ok: false, message: 'cedula, nombre, correo, password y rol son obligatorios' });
    }
    if (!COORDINADORES.includes(rol)) {
      return res.status(400).json({ ok: false, message: `rol inválido. Valores permitidos: ${COORDINADORES.join(', ')}` });
    }
    if (!/^\d+$/.test(String(cedula))) {
      return res.status(400).json({ ok: false, message: 'La cédula solo debe contener números' });
    }
    if (String(password).length < LARGO_MINIMO_PASSWORD) {
      return res.status(400).json({ ok: false, message: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres` });
    }

    // Solo el coordinador de carrera queda asociado a una carrera
    let carreraId = null;
    if (rol === ROLES.COORDINADOR_CARRERA) {
      if (!carrera_id) {
        return res.status(400).json({ ok: false, message: 'carrera_id es obligatorio para un coordinador de carrera' });
      }
      const [carreras] = await pool.query('SELECT id FROM carreras WHERE id = ?', [carrera_id]);
      if (carreras.length === 0) {
        return res.status(404).json({ ok: false, message: 'La carrera no existe' });
      }
      carreraId = Number(carrera_id);
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
      'INSERT INTO usuarios (cedula, nombre, correo, password, rol, carrera_id) VALUES (?, ?, ?, ?, ?, ?)',
      [cedula, nombre, correo, hash, rol, carreraId]
    );

    res.status(201).json({
      ok: true,
      message: 'Coordinador creado correctamente',
      coordinador: { id: result.insertId, cedula, nombre, correo, rol, carrera_id: carreraId },
    });
  } catch (error) {
    next(error);
  }
};

// Valida nombre, correo y password de una cuenta creada desde el panel. Devuelve { error } o { datos }.
const validarCuentaPanel = (body) => {
  const nombre = String(body?.nombre ?? '').trim();
  const correo = String(body?.correo ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!nombre || !correo || !password) return { error: 'nombre, correo y password son obligatorios' };
  if (!CORREO_REGEX.test(correo)) return { error: 'El correo no es válido' };
  if (password.length < LARGO_MINIMO_PASSWORD) {
    return { error: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres` };
  }
  return { datos: { nombre, correo, password } };
};

// Inserta la cuenta del panel. Devuelve { conflicto } si el correo ya existe, o { id }.
const crearCuentaPanel = async (db, { nombre, correo, password }, rol, estado) => {
  const [existentes] = await db.query('SELECT estado FROM usuarios WHERE correo = ?', [correo]);
  if (existentes.length > 0) {
    return {
      conflicto: existentes[0].estado === 'pendiente'
        ? 'Ya existe una solicitud pendiente con ese correo'
        : 'El correo ya está registrado',
    };
  }

  const hash = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    'INSERT INTO usuarios (nombre, correo, password, rol, estado) VALUES (?, ?, ?, ?, ?)',
    [nombre, correo, hash, rol, estado]
  );
  return { id: result.insertId };
};

const existeMaster = async (db = pool) => {
  const [filas] = await db.query('SELECT 1 FROM usuarios WHERE rol = ? LIMIT 1', [ROLES.COORDINADOR_MASTER]);
  return filas.length > 0;
};

// Compara en tiempo constante. Sin MASTER_INVITE_CODE en el .env ningún código es válido.
const codigoMasterValido = (codigo) => {
  const esperado = process.env.MASTER_INVITE_CODE;
  if (!esperado || typeof codigo !== 'string') return false;
  const a = Buffer.from(codigo);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Pública: indica si el sistema ya está "sellado" (existe al menos un coordinador master)
const checkMaster = async (req, res, next) => {
  try {
    res.json({ ok: true, hasMaster: await existeMaster() });
  } catch (error) {
    next(error);
  }
};

// Pública: registro desde el panel web.
// - Si ya existe un master, el sistema está sellado: se ignora codigo_autorizacion (aunque sea correcto)
//   y la cuenta queda como coordinador_carrera 'pendiente' hasta que el master la apruebe.
// - Si no existe ningún master, un codigo_autorizacion igual a MASTER_INVITE_CODE crea el primer master.
const registroPanel = async (req, res, next) => {
  const { error, datos } = validarCuentaPanel(req.body);
  if (error) {
    return res.status(400).json({ ok: false, message: error });
  }
  const codigo = req.body?.codigo_autorizacion;

  let connection;
  try {
    connection = await pool.getConnection();
    // Serializa los registros: dos peticiones simultáneas con el código no pueden crear dos masters
    const [[{ bloqueado }]] = await connection.query("SELECT GET_LOCK('registro_panel', 10) AS bloqueado");
    if (bloqueado !== 1) {
      return res.status(503).json({ ok: false, message: 'El servidor está ocupado, intenta de nuevo' });
    }

    try {
      let rol = ROLES.COORDINADOR_CARRERA;
      let estado = 'pendiente';
      if (!(await existeMaster(connection)) && codigo) {
        if (!codigoMasterValido(codigo)) {
          return res.status(403).json({ ok: false, message: 'Código de autorización inválido' });
        }
        rol = ROLES.COORDINADOR_MASTER;
        estado = 'aprobado';
      }

      const { conflicto, id } = await crearCuentaPanel(connection, datos, rol, estado);
      if (conflicto) {
        return res.status(409).json({ ok: false, message: conflicto });
      }

      res.status(201).json({
        ok: true,
        message: rol === ROLES.COORDINADOR_MASTER
          ? 'Coordinador Master creado. Ya puedes iniciar sesión.'
          : 'Solicitud enviada. El Coordinador Master debe aprobarla antes de que puedas ingresar.',
        usuario: { id, nombre: datos.nombre, correo: datos.correo, rol, estado },
      });
    } finally {
      await connection.query("SELECT RELEASE_LOCK('registro_panel')");
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'El correo ya está registrado' });
    }
    next(error);
  } finally {
    connection?.release();
  }
};

// Pública: un coordinador pide acceso al panel. Queda como coordinador_carrera 'pendiente',
// sin carrera, y no puede iniciar sesión hasta que el master lo apruebe.
const solicitarAcceso = async (req, res, next) => {
  try {
    const { error, datos } = validarCuentaPanel(req.body);
    if (error) {
      return res.status(400).json({ ok: false, message: error });
    }

    const { conflicto, id } = await crearCuentaPanel(pool, datos, ROLES.COORDINADOR_CARRERA, 'pendiente');
    if (conflicto) {
      return res.status(409).json({ ok: false, message: conflicto });
    }

    res.status(201).json({
      ok: true,
      message: 'Solicitud enviada. El Coordinador Master debe aprobarla antes de que puedas ingresar.',
      solicitud: { id, nombre: datos.nombre, correo: datos.correo, estado: 'pendiente' },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'El correo ya está registrado' });
    }
    next(error);
  }
};

// Coordinador master: solicitudes de acceso pendientes
const listarSolicitudes = async (req, res, next) => {
  try {
    const [solicitudes] = await pool.query(
      "SELECT id, nombre, correo FROM usuarios WHERE estado = 'pendiente' AND rol = ? ORDER BY id",
      [ROLES.COORDINADOR_CARRERA]
    );
    res.json({ ok: true, total: solicitudes.length, solicitudes });
  } catch (error) {
    next(error);
  }
};

// Coordinador master: aprueba una solicitud asignándole la carrera que administrará
const aprobarSolicitud = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const carreraId = Number(req.body?.carrera_id);

    if (!Number.isInteger(carreraId) || carreraId <= 0) {
      return res.status(400).json({ ok: false, message: 'carrera_id es obligatorio' });
    }
    const [carreras] = await pool.query('SELECT nombre FROM carreras WHERE id = ?', [carreraId]);
    if (carreras.length === 0) {
      return res.status(404).json({ ok: false, message: 'La carrera no existe' });
    }

    const [result] = await pool.query(
      "UPDATE usuarios SET estado = 'aprobado', carrera_id = ? WHERE id = ? AND estado = 'pendiente' AND rol = ?",
      [carreraId, id, ROLES.COORDINADOR_CARRERA]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'La solicitud no existe o ya fue procesada' });
    }

    res.json({ ok: true, message: `Coordinador aprobado para ${carreras[0].nombre}` });
  } catch (error) {
    next(error);
  }
};

// Coordinador master: rechaza una solicitud (se elimina, así el correo puede volver a solicitar acceso)
const rechazarSolicitud = async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM usuarios WHERE id = ? AND estado = 'pendiente' AND rol = ?",
      [Number(req.params.id), ROLES.COORDINADOR_CARRERA]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'La solicitud no existe o ya fue procesada' });
    }
    res.json({ ok: true, message: 'Solicitud rechazada' });
  } catch (error) {
    next(error);
  }
};

// Coordinador master: asigna una contraseña nueva a un coordinador (recuperación de acceso)
const restablecerPassword = async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');
    if (password.length < LARGO_MINIMO_PASSWORD) {
      return res.status(400).json({ ok: false, message: `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres` });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "UPDATE usuarios SET password = ? WHERE id = ? AND rol IN (?) AND estado = 'aprobado'",
      [hash, Number(req.params.id), COORDINADORES]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: 'El coordinador no existe' });
    }

    res.json({ ok: true, message: 'Contraseña restablecida' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkMaster,
  registroPanel,
  listarCoordinadores,
  restablecerPassword,
  crearCoordinador,
  solicitarAcceso,
  listarSolicitudes,
  aprobarSolicitud,
  rechazarSolicitud,
};
