// Reglas del negocio compartidas por varios controladores

// Con MÁS de esta cantidad de faltas sin justificar en una materia, el estudiante queda "en riesgo"
// (el profesor lo ve marcado con ⚠️ y el estudiante recibe el aviso en su panel)
const LIMITE_FALTAS_AVISO = 3;

// Panel web: un alumno es "grave" en una materia si sus faltas sin justificar
// alcanzan este porcentaje de las clases cerradas de esa materia
const PORCENTAJE_INASISTENCIA_GRAVE = 25;

// Semestres que puede cursar un estudiante (el pensum de cada carrera tiene 6 periodos)
const SEMESTRES_ESTUDIANTE = 6;

module.exports = { LIMITE_FALTAS_AVISO, PORCENTAJE_INASISTENCIA_GRAVE, SEMESTRES_ESTUDIANTE };
