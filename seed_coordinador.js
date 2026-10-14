require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('./src/config/db');

// Cuenta master por defecto (ver credenciales_master.txt en el dashboard). Cambiar la contraseña en producción.
const COORDINADOR = {
  cedula: null,
  nombre: 'Coordinador Master',
  correo: 'admin@iutav.edu.ve',
  password: 'Master1234*',
  rol: 'coordinador_master',
};

async function seed() {
  const hash = await bcrypt.hash(COORDINADOR.password, 10);

  try {
    const [result] = await pool.query(
      'INSERT INTO usuarios (cedula, nombre, correo, password, rol) VALUES (?, ?, ?, ?, ?)',
      [COORDINADOR.cedula, COORDINADOR.nombre, COORDINADOR.correo, hash, COORDINADOR.rol]
    );
    console.log(`Coordinador maestro creado con id ${result.insertId} (${COORDINADOR.correo}).`);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log(`El coordinador maestro ya existe (${COORDINADOR.correo}). No se hizo ningún cambio.`);
    } else {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Error al crear el coordinador maestro:', error.code || error.message);
  process.exit(1);
});
