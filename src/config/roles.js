// Roles del sistema. El coordinador solo opera desde el panel web.
const ROLES = {
  ESTUDIANTE: 'estudiante',
  PROFESOR: 'profesor',
  COORDINADOR_MASTER: 'coordinador_master',
  COORDINADOR_CARRERA: 'coordinador_carrera',
};

const TODOS_LOS_ROLES = Object.values(ROLES);

// Cualquier tipo de coordinador (para rutas compartidas por ambos)
const COORDINADORES = [ROLES.COORDINADOR_MASTER, ROLES.COORDINADOR_CARRERA];

const esCoordinador = (rol) => COORDINADORES.includes(rol);

module.exports = { ROLES, TODOS_LOS_ROLES, COORDINADORES, esCoordinador };
