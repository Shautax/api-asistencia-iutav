const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'justificativos');
const MAX_SIZE_MB = 5;

// La extensión se decide por el tipo de archivo validado, no por el nombre que envía el cliente
const TIPOS_PERMITIDOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${TIPOS_PERMITIDOS[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_PERMITIDOS[file.mimetype]) {
      return cb(new Error('Tipo de archivo no permitido. Solo se aceptan JPG, PNG o PDF'));
    }
    cb(null, true);
  },
});

// Envuelve multer para que sus errores también respondan en JSON
const uploadArchivo = (campo) => (req, res, next) => {
  upload.single(campo)(req, res, (err) => {
    if (!err) return next();

    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `El archivo supera el límite de ${MAX_SIZE_MB} MB`
      : err.message;
    res.status(400).json({ ok: false, message });
  });
};

module.exports = { uploadArchivo, UPLOAD_DIR };
