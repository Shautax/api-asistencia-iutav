const { obtenerRedConfigurada } = require('../controllers/configuracionController');

const MENSAJE_RED_DENEGADA = 'Acceso denegado: Debes estar conectado a la red WiFi del instituto para marcar asistencia';

// Android devuelve el SSID entre comillas dobles ("Wipod_Tesis"): se quitan, junto con espacios
// y mayúsculas, antes de comparar
const normalizarSsid = (ssid) => String(ssid || '').replace(/"/g, '').trim().toLowerCase();

// Valida la red contra la configurada por el coordinador master en configuracion_red.
// Solo se compara el SSID (normalizado). La IP local que reporta la app (ip_actual) ya no se valida:
// los teléfonos reciben IPs distintas por DHCP y la validación estricta rechazaba conexiones válidas.
// El filtro por IP pública (req.ip) sigue siendo INSTITUTE_IP en asistenciaController.
const validarRedInstituto = async (req, res, next) => {
  try {
    const { ssid_actual, ip_actual } = req.body || {};

    if (typeof ssid_actual !== 'string' || !ssid_actual) {
      return res.status(400).json({ ok: false, message: 'ssid_actual es obligatorio' });
    }

    const red = await obtenerRedConfigurada();
    console.log('[DEBUG WIFI] Esperado SSID:', red && red.ssid_permitido, '| Recibido SSID:', ssid_actual, '| IP Recibida:', ip_actual);

    // Sin red configurada no se puede validar: se rechaza en lugar de dejar pasar a todos
    if (!red || normalizarSsid(ssid_actual) !== normalizarSsid(red.ssid_permitido)) {
      return res.status(403).json({ ok: false, message: MENSAJE_RED_DENEGADA });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { validarRedInstituto };
