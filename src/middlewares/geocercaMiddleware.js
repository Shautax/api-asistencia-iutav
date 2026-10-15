const { obtenerRedConfigurada, coordenadaValida } = require('../controllers/configuracionController');

const RADIO_TIERRA_METROS = 6371000;

const aRadianes = (grados) => (grados * Math.PI) / 180;

// Fórmula de Haversine: distancia en metros, sobre la superficie terrestre, entre dos puntos (lat, lng) en grados
const calcularDistanciaHaversine = (lat1, lng1, lat2, lng2) => {
  const dLat = aRadianes(lat2 - lat1);
  const dLng = aRadianes(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIO_TIERRA_METROS * c;
};

// Valida que el estudiante esté dentro de la geocerca de la sede configurada en configuracion_red.
// Si la sede aún no tiene coordenadas se deja pasar (con aviso) para no bloquear la asistencia.
const validarGeocerca = async (req, res, next) => {
  try {
    const sede = await obtenerRedConfigurada();

    if (!sede || sede.latitud === null || sede.longitud === null) {
      console.warn('[GEOCERCA] La geocerca de la sede no está configurada: se permite el registro sin validar ubicación');
      return next();
    }

    const { latitud, longitud } = req.body || {};
    if (!coordenadaValida(latitud, 90) || !coordenadaValida(longitud, 180)) {
      return res.status(400).json({
        ok: false,
        message: 'latitud y longitud son obligatorias y deben ser coordenadas válidas en grados decimales',
      });
    }

    const latApp = Number(latitud);
    const lngApp = Number(longitud);
    const distancia = calcularDistanciaHaversine(sede.latitud, sede.longitud, latApp, lngApp);
    console.log('[DEBUG GPS] Lat App:', latApp, '| Lng App:', lngApp, '| Distancia:', distancia.toFixed(2), 'm');

    if (distancia > sede.radio_permitido) {
      return res.status(403).json({
        ok: false,
        message: `Acceso denegado: Debes estar dentro del instituto para marcar asistencia (estás a ${Math.round(distancia)} m y el máximo permitido es ${sede.radio_permitido} m)`,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { calcularDistanciaHaversine, validarGeocerca };
