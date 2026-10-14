# Contexto de la base de datos — Sistema de Asistencia IUTAV

Este documento es para que un asistente (Claude Cowork) me ayude a **escribir consultas SQL**
sobre la base de datos del sistema de asistencia. Yo ejecuto las consultas en **phpMyAdmin**
y le paso los resultados.

## Qué es el sistema

Sistema de **control de asistencia y justificativos** del instituto IUTAV
(NO maneja notas ni calificaciones).

- **Profesor:** desde la app Android inicia una clase → se genera un **código QR** único.
- **Estudiante:** escanea el QR con la app → queda **presente**. Debe estar en la red Wi-Fi
  del instituto y estar inscrito en la materia.
- **Profesor:** cierra la clase → los inscritos que no escanearon quedan **ausentes**
  y se les suma una falta.
- **Estudiante:** puede enviar un **justificativo** (archivo + motivo) por una inasistencia;
  el profesor lo **aprueba** (la asistencia pasa a `justificado` y se resta la falta) o lo **rechaza**.
- **Coordinador:** gestiona carreras, materias y asignaciones (desde una plataforma web).

## Conexión

- Motor: **MariaDB 10.4** (XAMPP), servidor `localhost:3306`, usuario `root`
- Base de datos: **`asistencia_db`**
- Herramienta: phpMyAdmin en `http://localhost/phpmyadmin` → pestaña **SQL**
- La contraseña está en el archivo `.env` de la API: **no la incluyas en respuestas**.

## Tablas

### `usuarios`
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| cedula | VARCHAR(20) NULL UNIQUE | solo dígitos, ej. `30123456` (en pantalla se muestra `V-30.123.456`). NULL en coordinadores que solicitaron acceso desde el panel |
| nombre | VARCHAR(100) | |
| correo | VARCHAR(150) UNIQUE | |
| password | VARCHAR(255) | hash bcrypt — **nunca seleccionar ni mostrar esta columna** |
| rol | ENUM('estudiante','profesor','coordinador_master','coordinador_carrera') | el coordinador solo usa el panel web; solo `coordinador_master` puede crear otros coordinadores |
| carrera_id | INT NULL FK → carreras.id (ON DELETE SET NULL) | `estudiante`: carrera que cursa. `coordinador_carrera`: carrera que administra. NULL para los demás roles |
| semestre | TINYINT UNSIGNED NULL | solo `estudiante` (1..6): junto con `carrera_id` define qué materias puede ver e inscribir |
| estado | ENUM('aprobado','pendiente') (default `aprobado`) | `pendiente` = coordinador que pidió acceso desde el panel; no puede iniciar sesión hasta que el `coordinador_master` lo apruebe y le asigne carrera |

### `carreras`
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| nombre | VARCHAR(100) | |
| codigo | VARCHAR(20) UNIQUE | |

### `materias`
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| nombre | VARCHAR(100) | |
| carrera_id | INT FK → carreras.id | |
| semestre | TINYINT UNSIGNED NULL | 1..12; NULL = sin semestre asignado (el panel las agrupa aparte) |
| codigo | VARCHAR(30) NULL | código oficial del pensum (ej. `ING-186IM`) |
| codigo_inscripcion | VARCHAR(10) UNIQUE | código antiguo de inscripción (ej. `BDTEST`); los estudiantes ya no se inscriben con él |
| inscripciones_abiertas | BOOLEAN (default 1) | 0 = el profesor "cerró la lista": nadie más puede inscribirse |

Los estudiantes se inscriben por catálogo: solo en materias con `carrera_id` y `semestre` iguales a los suyos.

### `profesor_materia` — qué materias dicta cada profesor (un profesor puede tener varias)
| Columna | Tipo |
|---|---|
| id | INT PK |
| profesor_id | INT FK → usuarios.id |
| materia_id | INT FK → materias.id |
Única por (profesor_id, materia_id).

### `estudiante_materia` — inscripciones
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| estudiante_id | INT FK → usuarios.id | |
| materia_id | INT FK → materias.id | |
| faltas_acumuladas | INT (default 0) | la mantiene el backend: +1 al cerrar una clase sin asistencia, −1 al aprobar un justificativo. Con **más de 3** la app del profesor marca al estudiante "en riesgo" (⚠️) |
Única por (estudiante_id, materia_id).

### `clases` — cada sesión que el profesor inicia
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| materia_id | INT FK → materias.id | |
| profesor_id | INT FK → usuarios.id | |
| fecha | DATETIME | hora local de Venezuela (UTC−4) en que se inició |
| qr_token | VARCHAR(255) UNIQUE | contenido del QR — **secreto, no mostrarlo completo** |
| estado | ENUM('abierta','cerrada') | |

### `asistencias` — una fila por estudiante y clase
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| clase_id | INT FK → clases.id | |
| estudiante_id | INT FK → usuarios.id | |
| estado | ENUM('presente','ausente','justificado') | |
| ssid_validado | TINYINT(1) | 1 = registró desde la red Wi-Fi del instituto; 0 = fila de ausente creada al cerrar la clase |
Única por (clase_id, estudiante_id).

### `justificativos`
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| asistencia_id | INT FK → asistencias.id | la asistencia `ausente` que se justifica |
| archivo_url | VARCHAR(500) | ruta del PDF/imagen. El archivo vive en el disco del servidor, en `api-asistencia/uploads/justificativos/` (la BD solo guarda la ruta) |
| motivo | VARCHAR(255) NULL | ej. "Reposo médico - 48h" |
| estado_revision | ENUM('pendiente','aprobado','rechazado') | |

### `configuracion_red` — red Wi-Fi permitida para marcar asistencia (una sola fila, `id = 1`)
| Columna | Tipo | Notas |
|---|---|---|
| id | INT PK | siempre 1 |
| ssid_permitido | VARCHAR(64) | el SSID que reporta la app debe coincidir exactamente (distingue mayúsculas) |
| ip_permitida | VARCHAR(45) | la IP que reporta la app debe coincidir exactamente |
La edita el `coordinador_master` con `PUT /api/configuracion/red`; no hace falta tocarla a mano.

## Relaciones (resumen)

```
carreras 1─N materias 1─N clases 1─N asistencias 1─N justificativos
usuarios (profesor)   1─N clases
usuarios (estudiante) 1─N asistencias
usuarios N─N materias  vía profesor_materia   (profesores)
usuarios N─N materias  vía estudiante_materia (estudiantes inscritos)
```

## Reglas para el asistente

1. **Solo consultas de lectura (`SELECT`)**, salvo que yo pida explícitamente modificar algo.
   Si propones un `UPDATE`/`DELETE`/`INSERT`, explícame antes qué cambia y por qué.
2. **Nunca** incluir `usuarios.password` ni `clases.qr_token` completo en los resultados.
3. No modificar `faltas_acumuladas` ni el `estado` de asistencias a mano: lo calcula el backend
   (al cerrar clases y al revisar justificativos). Cambiarlo a mano descuadra los datos.
4. Usar alias en español y legibles (`AS estudiante`, `AS materia`) y `ORDER BY`.
5. Para tablas grandes, añadir `LIMIT` mientras exploramos.
6. Compatibilidad: **MariaDB 10.4** (sin funciones exclusivas de MySQL 8).
7. Explícame cada consulta en una o dos frases, en español.

## Consultas de ejemplo

Asistencia de cada clase:
```sql
SELECT c.id AS clase, m.nombre AS materia, c.fecha, c.estado AS estado_clase,
       u.nombre AS estudiante, u.cedula, a.estado AS asistencia
FROM asistencias a
JOIN clases c   ON c.id = a.clase_id
JOIN materias m ON m.id = c.materia_id
JOIN usuarios u ON u.id = a.estudiante_id
ORDER BY c.id DESC, u.nombre;
```

Resumen por estudiante y materia:
```sql
SELECT u.nombre AS estudiante, m.nombre AS materia,
       SUM(a.estado = 'presente')    AS presentes,
       SUM(a.estado = 'ausente')     AS ausencias,
       SUM(a.estado = 'justificado') AS justificadas
FROM asistencias a
JOIN usuarios u ON u.id = a.estudiante_id
JOIN clases c   ON c.id = a.clase_id
JOIN materias m ON m.id = c.materia_id
GROUP BY u.id, m.id
ORDER BY u.nombre, m.nombre;
```

## Datos actuales

- Versión Beta: la base se reinició con `npm run reset-db` (14/10/2026). Todas las tablas están vacías
  salvo `configuracion_red`, que tiene la red por defecto (`Wipod_Tesis` / `192.168.43.1`).
