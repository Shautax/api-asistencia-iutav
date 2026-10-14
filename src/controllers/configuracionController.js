const net = require('net');
const { pool } = require('../config/db');

// La configuración de red es una sola fila (id = 1), creada por setup_db.js
const CONFIG_RED_ID = 1;
// Un SSID de Wi-Fi tiene como máximo 32 bytes (estándar 802.11)
const MAX_BYTES_SSID = 32;

const obtenerRedConfigurada = async () => {
  const [filas] = await pool.query(
    'SELECT id, ssid_permitido, ip_permitida FROM configuracion_red WHERE id = ?',
    [CONFIG_RED_ID]
  );
  return filas[0] || null;
};

// Coordinador master: devuelve la red Wi-Fi desde la que se permite marcar asistencia
const getConfiguracionRed = async (req, res, next) => {
  try {
    const red = await obtenerRedConfigurada();
    if (!red) {
      return res.status(404).json({ ok: false, message: 'No hay una red configurada. Ejecuta npm run setup-db' });
    }

    res.json({ ok: true, red });
  } catch (error) {
    next(error);
  }
};

// Coordinador master: cambia el SSID y la IP permitidos
const actualizarConfiguracionRed = async (req, res, next) => {
  try {
    const { ssid_permitido, ip_permitida } = req.body || {};

    if (typeof ssid_permitido !== 'string' || typeof ip_permitida !== 'string' || !ssid_permitido || !ip_permitida) {
      return res.status(400).json({ ok: false, message: 'ssid_permitido e ip_permitida son obligatorios' });
    }
    if (Buffer.byteLength(ssid_permitido, 'utf8') > MAX_BYTES_SSID) {
      return res.status(400).json({ ok: false, message: `El SSID no puede superar los ${MAX_BYTES_SSID} bytes` });
    }
    if (!net.isIP(ip_permitida)) {
      return res.status(400).json({ ok: false, message: 'ip_permitida no es una dirección IP válida' });
    }

    // Se guarda tal cual: la validación de asistencia compara de forma exacta
    await pool.query(
      `INSERT INTO configuracion_red (id, ssid_permitido, ip_permitida) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ssid_permitido = VALUES(ssid_permitido), ip_permitida = VALUES(ip_permitida)`,
      [CONFIG_RED_ID, ssid_permitido, ip_permitida]
    );

    res.json({
      ok: true,
      message: 'Configuración de red actualizada',
      red: await obtenerRedConfigurada(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { obtenerRedConfigurada, getConfiguracionRed, actualizarConfiguracionRed };
