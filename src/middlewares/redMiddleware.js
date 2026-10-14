const { obtenerRedConfigurada } = require('../controllers/configuracionController');

const MENSAJE_RED_DENEGADA = 'Acceso denegado: Debes estar conectado a la red WiFi del instituto para marcar asistencia';

// Doble cerradura: el SSID y la IP que reporta la app deben coincidir EXACTAMENTE con la red
// configurada por el coordinador master en configuracion_red. Si falla cualquiera de los dos, 403.
const validarRedInstituto = async (req, res, next) => {
  try {
    const { ssid_actual, ip_actual } = req.body || {};

    if (!ssid_actual || !ip_actual) {
      return res.status(400).json({ ok: false, message: 'ssid_actual e ip_actual son obligatorios' });
    }

    const red = await obtenerRedConfigurada();
    // Sin red configurada no se puede validar: se rechaza en lugar de dejar pasar a todos
    if (!red || ssid_actual !== red.ssid_permitido || ip_actual !== red.ip_permitida) {
      return res.status(403).json({ ok: false, message: MENSAJE_RED_DENEGADA });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { validarRedInstituto };
