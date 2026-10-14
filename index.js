require('dotenv').config();

// Se verifica antes de cargar las rutas, porque algunos controladores leen estas variables al cargarse
for (const variable of ['JWT_SECRET']) {
  if (!process.env[variable]) {
    console.error(`Falta la variable ${variable} en el archivo .env`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const { testConnection } = require('./src/config/db');
const indexRoutes = require('./src/routes/index.routes');
const authRoutes = require('./src/routes/authRoutes');
const claseRoutes = require('./src/routes/claseRoutes');
const asistenciaRoutes = require('./src/routes/asistenciaRoutes');
const justificativoRoutes = require('./src/routes/justificativoRoutes');
const alertaRoutes = require('./src/routes/alertaRoutes');
const academicoRoutes = require('./src/routes/academicoRoutes');
const coordinadorRoutes = require('./src/routes/coordinadorRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const profesorRoutes = require('./src/routes/profesorRoutes');
const configuracionRoutes = require('./src/routes/configuracionRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Solo si la API corre detrás de un proxy: así req.ip toma la IP real desde X-Forwarded-For
if (process.env.TRUST_PROXY) {
  const trustProxy = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// CORS_ORIGIN (opcional): dominios del panel web separados por coma, ej. https://mi-panel.netlify.app.
// Sin definir se acepta cualquier origen. La app Android no usa CORS, así que no le afecta.
const origenesPermitidos = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(origenesPermitidos.length ? { origin: origenesPermitidos } : undefined));
app.use(express.json());

app.use('/', indexRoutes);
app.use('/api', authRoutes);
app.use('/api', claseRoutes);
app.use('/api', asistenciaRoutes);
app.use('/api', justificativoRoutes);
app.use('/api', alertaRoutes);
app.use('/api', academicoRoutes);
app.use('/api', coordinadorRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', profesorRoutes);
app.use('/api', configuracionRoutes);

// 404 en formato JSON
app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada' });
});

// Manejo de errores en formato JSON
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, message: err.message || 'Error interno del servidor' });
});

app.listen(PORT, async () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  try {
    await testConnection();
    console.log('Conexión a MySQL establecida');
  } catch (error) {
    console.error('No se pudo conectar a MySQL:', error.code || error.message);
  }
});
