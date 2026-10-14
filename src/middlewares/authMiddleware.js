const jwt = require('jsonwebtoken');

// Devuelve el payload del token Bearer de la cabecera Authorization, o null si no hay token válido
const getTokenPayload = (req) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

const verifyToken = (req, res, next) => {
  const payload = getTokenPayload(req);
  if (!payload) {
    return res.status(401).json({ ok: false, message: 'Token no proporcionado, inválido o expirado' });
  }

  req.usuario = payload;
  next();
};

const checkRole = (roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, message: 'No tienes permisos para realizar esta acción' });
  }
  next();
};

module.exports = { verifyToken, checkRole, getTokenPayload };
