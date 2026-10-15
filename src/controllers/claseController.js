const crypto = require('crypto');
const { pool } = require('../config/db');

const crearClase = async (req, res, next) => {
  try {
    const { materia_id } = req.body || {};
    const profesorId = req.usuario.id;

    if (!materia_id) {
      return res.status(400).json({ ok: false, message: 'materia_id es obligatorio' });
    }

    const [materias] = await pool.query('SELECT id FROM materias WHERE id = ?', [materia_id]);
    if (materias.length === 0) {
      return res.status(404).json({ ok: false, message: 'La materia no existe' });
    }

    const qrToken = crypto.randomBytes(32).toString('hex');
    const [result] = await pool.query(
      "INSERT INTO clases (materia_id, profesor_id, fecha, qr_token, estado) VALUES (?, ?, NOW(), ?, 'abierta')",
      [materia_id, profesorId, qrToken]
    );

    res.status(201).json({
      ok: true,
      message: 'Clase creada correctamente',
      clase: { id: result.insertId, qr_token: qrToken },
    });
  } catch (error) {
    next(error);
  }
};

const cerrarClase = async (req, res, next) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // FOR UPDATE evita que dos cierres simultáneos de la misma clase sumen las faltas dos veces
    const [clases] = await connection.query(
      'SELECT id, materia_id, profesor_id, estado FROM clases WHERE id = ? FOR UPDATE',
      [id]
    );
    const clase = clases[0];

    let error = null;
    if (!clase) {
      error = [404, 'La clase no existe'];
    } else if (clase.profesor_id !== req.usuario.id) {
      error = [403, 'Solo el profesor que abrió la clase puede cerrarla'];
    } else if (clase.estado === 'cerrada') {
      error = [409, 'La clase ya está cerrada'];
    }
    if (error) {
      await connection.rollback();
      return res.status(error[0]).json({ ok: false, message: error[1] });
    }

    await connection.query("UPDATE clases SET estado = 'cerrada' WHERE id = ?", [id]);

    // Pase de lista: los inscritos en la materia que no registraron asistencia quedan como ausentes
    const [faltantes] = await connection.query(
      `SELECT em.estudiante_id
       FROM estudiante_materia em
       WHERE em.materia_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM asistencias a WHERE a.clase_id = ? AND a.estudiante_id = em.estudiante_id
         )`,
      [clase.materia_id, clase.id]
    );

    if (faltantes.length > 0) {
      const ids = faltantes.map((f) => f.estudiante_id);
      await connection.query(
        'INSERT INTO asistencias (clase_id, estudiante_id, estado, ubicacion_validada) VALUES ?',
        [ids.map((estudianteId) => [clase.id, estudianteId, 'ausente', false])]
      );
      await connection.query(
        'UPDATE estudiante_materia SET faltas_acumuladas = faltas_acumuladas + 1 WHERE materia_id = ? AND estudiante_id IN (?)',
        [clase.materia_id, ids]
      );
    }

    await connection.commit();

    res.json({
      ok: true,
      message: 'Clase cerrada correctamente',
      clase: { id: clase.id, estado: 'cerrada' },
      ausentes_registrados: faltantes.length,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

module.exports = { crearClase, cerrarClase };
