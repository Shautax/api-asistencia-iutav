const { obtenerRedConfigurada } = require('../controllers/configuracionController');
const { ipEnRango } = require('../utils/ip');

const MENSAJE_RED_DENEGADA = 'Acceso denegado: Debes estar conectado a la red WiFi del instituto para marcar asistencia';

// Doble cerradura contra la red configurada por el coordinador master en configuracion_red:
// - el SSID debe coincidir exactamente;
// - la IP local que reporta la app (ip_actual) debe pertenecer al rango CIDR de ip_permitida
//   (ej. 192.168.43.0/24), así varios teléfonos del mismo router pueden marcar. Si ip_permitida
//   es una IP sin máscara, se compara de forma exacta.
// Se valida ip_actual y no req.ip: detrás de NAT/Railway req.ip es la IP pública del router,
// nunca la privada 192.168.x.x. El filtro por IP pública (req.ip) es INSTITUTE_IP en asistenciaController.
const validarRedInstituto = async (req, res, next) => {
  try {
    const { ssid_actual, ip_actual } = req.body || {};

    if (typeof ssid_actual !== 'string' || typeof ip_actual !== 'string' || !ssid_actual || !ip_actual) {
      return res.status(400).json({ ok: false, message: 'ssid_actual e ip_actual son obligatorios' });
    }

    const red = await obtenerRedConfigurada();
    // Sin red configurada no se puede validar: se rechaza en lugar de dejar pasar a todos
    if (!red || ssid_actual !== red.ssid_permitido || !ipEnRango(ip_actual, red.ip_permitida)) {
      return res.status(403).json({ ok: false, message: MENSAJE_RED_DENEGADA });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { validarRedInstituto };
