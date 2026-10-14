const fs = require('fs/promises');
const { pool } = require('../config/db');
const { UPLOAD_DIR } = require('../middlewares/uploadMiddleware');
const { esCoordinador } = require('../config/roles');

const ESTADOS_REVISION = ['aprobado', 'rechazado'];
const RUTA_ARCHIVOS = '/api/justificativos/archivo';
const NOMBRE_ARCHIVO_VALIDO = /^[\w-]+\.(pdf|jpg|png)$/;

// Si la petición no prospera, se borra el archivo que multer ya guardó en disco
const borrarArchivo = (req) => (req.file ? fs.unlink(req.file.path).catch(() => {}) : Promise.resolve());

const crearJustificativo = async (req, res, next) => {
  try {
    const { asistencia_id } = req.body || {};
    // Opcional: texto corto que el profesor ve en su bandeja (ej. "Reposo médico - 48h")
    const motivo = String((req.body || {}).motivo || '').trim().slice(0, 255) || null;

    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Debes adjuntar el archivo del justificativo (campo "archivo")' });
    }
    if (!asistencia_id) {
      await borrarArchivo(req);
      return res.status(400).json({ ok: false, message: 'asistencia_id es obligatorio' });
    }

    const [asistencias] = await pool.query(
      'SELECT id, estudiante_id, estado FROM asistencias WHERE id = ?',
      [asistencia_id]
    );
    const asistencia = asistencias[0];

    if (!asistencia || asistencia.estudiante_id !== req.usuario.id) {
      await borrarArchivo(req);
      return res.status(404).json({ ok: false, message: 'La asistencia no existe o no te pertenece' });
    }
    if (asistencia.estado !== 'ausente') {
      await borrarArchivo(req);
      return res.status(400).json({ ok: false, message: 'Solo se pueden justificar inasistencias' });
    }

    const [previos] = await pool.query(
      "SELECT id FROM justificativos WHERE asistencia_id = ? AND estado_revision IN ('pendiente', 'aprobado')",
      [asistencia_id]
    );
    if (previos.length > 0) {
      await borrarArchivo(req);
      return res.status(409).json({ ok: false, message: 'Esta inasistencia ya tiene un justificativo pendiente o aprobado' });
    }

    const archivoUrl = `${RUTA_ARCHIVOS}/${req.file.filename}`;
    const [result] = await pool.query(
      "INSERT INTO justificativos (asistencia_id, archivo_url, motivo, estado_revision) VALUES (?, ?, ?, 'pendiente')",
      [asistencia_id, archivoUrl, motivo]
    );

    res.status(201).json({
      ok: true,
      message: 'Justificativo enviado correctamente',
      justificativo: { id: result.insertId, asistencia_id: asistencia.id, archivo_url: archivoUrl, motivo, estado_revision: 'pendiente' },
    });
  } catch (error) {
    await borrarArchivo(req);
    next(error);
  }
};

const listarPendientes = async (req, res, next) => {
  try {
    // Cada profesor solo ve los justificativos de sus propias clases
    const [justificativos] = await pool.query(
      `SELECT j.id, j.archivo_url, j.motivo, j.estado_revision, j.asistencia_id,
              c.id AS clase_id, c.fecha AS fecha_clase, m.nombre AS materia,
              u.nombre AS estudiante, u.cedula
       FROM justificativos j
       INNER JOIN asistencias a ON a.id = j.asistencia_id
       INNER JOIN clases c ON c.id = a.clase_id
       INNER JOIN materias m ON m.id = c.materia_id
       INNER JOIN usuarios u ON u.id = a.estudiante_id
       WHERE j.estado_revision = 'pendiente' AND c.profesor_id = ?
       ORDER BY c.fecha, u.nombre`,
      [req.usuario.id]
    );

    res.json({ ok: true, total: justificativos.length, justificativos });
  } catch (error) {
    next(error);
  }
};

const actualizarEstado = async (req, res, next) => {
  const { id } = req.params;
  const { estado_revision } = req.body || {};

  if (!ESTADOS_REVISION.includes(estado_revision)) {
    return res.status(400).json({ ok: false, message: `estado_revision debe ser: ${ESTADOS_REVISION.join(' o ')}` });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT j.id, j.estado_revision, j.asistencia_id, c.profesor_id
       FROM justificativos j
       INNER JOIN asistencias a ON a.id = j.asistencia_id
       INNER JOIN clases c ON c.id = a.clase_id
       WHERE j.id = ?
       FOR UPDATE`,
      [id]
    );
    const justificativo = rows[0];

    let error = null;
    if (!justificativo) {
      error = [404, 'El justificativo no existe'];
    } else if (justificativo.profesor_id !== req.usuario.id) {
      error = [403, 'Solo el profesor de la clase puede revisar este justificativo'];
    } else if (justificativo.estado_revision !== 'pendiente') {
      error = [409, `El justificativo ya fue ${justificativo.estado_revision}`];
    }
    if (error) {
      await connection.rollback();
      return res.status(error[0]).json({ ok: false, message: error[1] });
    }

    await connection.query('UPDATE justificativos SET estado_revision = ? WHERE id = ?', [estado_revision, id]);
    if (estado_revision === 'aprobado') {
      await connection.query("UPDATE asistencias SET estado = 'justificado' WHERE id = ?", [justificativo.asistencia_id]);
      // Una falta justificada deja de contar en el acumulado del estudiante
      await connection.query(
        `UPDATE estudiante_materia em
         INNER JOIN asistencias a ON a.estudiante_id = em.estudiante_id
         INNER JOIN clases c ON c.id = a.clase_id AND c.materia_id = em.materia_id
         SET em.faltas_acumuladas = GREATEST(em.faltas_acumuladas - 1, 0)
         WHERE a.id = ?`,
        [justificativo.asistencia_id]
      );
    }

    await connection.commit();

    res.json({
      ok: true,
      message: `Justificativo ${estado_revision}`,
      justificativo: { id: justificativo.id, asistencia_id: justificativo.asistencia_id, estado_revision },
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

const verArchivo = async (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!NOMBRE_ARCHIVO_VALIDO.test(filename)) {
      return res.status(404).json({ ok: false, message: 'Archivo no encontrado' });
    }

    const [rows] = await pool.query(
      `SELECT a.estudiante_id, c.profesor_id
       FROM justificativos j
       INNER JOIN asistencias a ON a.id = j.asistencia_id
       INNER JOIN clases c ON c.id = a.clase_id
       WHERE j.archivo_url = ?`,
      [`${RUTA_ARCHIVOS}/${filename}`]
    );
    const justificativo = rows[0];
    if (!justificativo) {
      return res.status(404).json({ ok: false, message: 'Archivo no encontrado' });
    }

    // Documentos médicos: solo el estudiante dueño, el profesor de la clase o un coordinador
    const { id, rol } = req.usuario;
    const autorizado = esCoordinador(rol)
      || (rol === 'estudiante' && justificativo.estudiante_id === id)
      || (rol === 'profesor' && justificativo.profesor_id === id);
    if (!autorizado) {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para ver este archivo' });
    }

    res.sendFile(filename, { root: UPLOAD_DIR }, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ ok: false, message: 'Archivo no encontrado' });
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { crearJustificativo, listarPendientes, actualizarEstado, verArchivo };
