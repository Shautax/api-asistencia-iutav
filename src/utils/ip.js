// Utilidades de IP compartidas por redMiddleware (configuracion_red) y asistenciaController (INSTITUTE_IP)

const ipv4ANumero = (ip) => {
  const partes = String(ip).split('.');
  if (partes.length !== 4 || partes.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  const [a, b, c, d] = partes.map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
};

// Quita el prefijo IPv4-mapeado (::ffff:192.168.1.5 -> 192.168.1.5) y espacios
const normalizarIp = (ip) => {
  const limpia = String(ip || '').trim();
  return limpia.startsWith('::ffff:') ? limpia.slice(7) : limpia;
};

// Rango CIDR IPv4 válido, ej. 192.168.43.0/24
const esCidrIpv4 = (entrada) => {
  const [red, bitsTexto, ...resto] = String(entrada).split('/');
  return resto.length === 0 && /^\d{1,2}$/.test(bitsTexto || '') && Number(bitsTexto) <= 32 && ipv4ANumero(red) !== null;
};

// entrada puede ser una IP exacta (IPv4 o IPv6) o un rango CIDR IPv4
const ipEnRango = (ip, entrada) => {
  const ipNormalizada = normalizarIp(ip);
  const entradaNormalizada = String(entrada || '').trim();
  if (!entradaNormalizada.includes('/')) return entradaNormalizada === ipNormalizada;
  if (!esCidrIpv4(entradaNormalizada)) return false;

  const [red, bitsTexto] = entradaNormalizada.split('/');
  const bits = Number(bitsTexto);
  const ipNum = ipv4ANumero(ipNormalizada);
  if (ipNum === null) return false;
  const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mascara) === (ipv4ANumero(red) & mascara);
};

module.exports = { normalizarIp, esCidrIpv4, ipEnRango };
