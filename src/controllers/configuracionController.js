const { pool } = require('../config/db');

// La configuración de la geocerca es una sola fila (id = 1), creada por setup_db.js
const CONFIG_RED_ID = 1;
// Límites del radio de la geocerca, en metros
const RADIO_MINIMO = 10;
const RADIO_MAXIMO = 5000;

// Número (o texto numérico) dentro de [-limite, limite]: 90 para latitud, 180 para longitud
const coordenadaValida = (valor, limite) =>
  (typeof valor === 'number' || (typeof valor === 'string' && valor.trim() !== '')) &&
  Number.isFinite(Number(valor)) &&
  Math.abs(Number(valor)) <= limite;

// mysql2 devuelve las columnas DECIMAL como texto: se convierten a número (NULL = sin configurar)
const obtenerRedConfigurada = async () => {
  const [filas] = await pool.query(
    'SELECT id, latitud, longitud, radio_permitido FROM configuracion_red WHERE id = ?',
    [CONFIG_RED_ID]
  );
  const fila = filas[0];
  if (!fila) return null;
  return {
    id: fila.id,
    latitud: fila.latitud === null ? null : Number(fila.latitud),
    longitud: fila.longitud === null ? null : Number(fila.longitud),
    radio_permitido: fila.radio_permitido,
  };
};

// Coordinador master: devuelve la geocerca (centro y radio) dentro de la que se permite marcar asistencia
const getConfiguracionRed = async (req, res, next) => {
  try {
    const red = await obtenerRedConfigurada();
    if (!red) {
      return res.status(404).json({ ok: false, message: 'No hay una geocerca configurada. Ejecuta npm run setup-db' });
    }

    res.json({ ok: true, red });
  } catch (error) {
    next(error);
  }
};

// Coordinador master: cambia la ubicación de la sede y el radio permitido
const actualizarConfiguracionRed = async (req, res, next) => {
  try {
    const { latitud, longitud, radio_permitido } = req.body || {};

    if (!coordenadaValida(latitud, 90)) {
      return res.status(400).json({ ok: false, message: 'latitud es obligatoria y debe estar entre -90 y 90' });
    }
    if (!coordenadaValida(longitud, 180)) {
      return res.status(400).json({ ok: false, message: 'longitud es obligatoria y debe estar entre -180 y 180' });
    }
    const radio = Number(radio_permitido);
    if (!Number.isInteger(radio) || radio < RADIO_MINIMO || radio > RADIO_MAXIMO) {
      return res.status(400).json({
        ok: false,
        message: `radio_permitido es obligatorio y debe ser un número entero de metros entre ${RADIO_MINIMO} y ${RADIO_MAXIMO}`,
      });
    }

    await pool.query(
      `INSERT INTO configuracion_red (id, latitud, longitud, radio_permitido) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE latitud = VALUES(latitud), longitud = VALUES(longitud), radio_permitido = VALUES(radio_permitido)`,
      [CONFIG_RED_ID, Number(latitud), Number(longitud), radio]
    );

    res.json({
      ok: true,
      message: 'Geocerca de la sede actualizada',
      red: await obtenerRedConfigurada(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { coordenadaValida, obtenerRedConfigurada, getConfiguracionRed, actualizarConfiguracionRed };
