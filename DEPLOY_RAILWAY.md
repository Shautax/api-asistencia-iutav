# Despliegue en Railway (API + MySQL)

`npm start` ejecuta primero `setup_db.js` (crea o migra las tablas, no borra datos) y luego la API.
`railway.json` define el health check en `/`.

## 1. Crear el proyecto
1. En https://railway.com → **New Project** → **Deploy from GitHub repo** → elige el repositorio de la API.
2. En el mismo proyecto: **+ Create** → **Database** → **MySQL**.

## 2. Variables del servicio de la API
Servicio de la API → pestaña **Variables** → **Raw Editor**, pega esto y completa los valores:

```
MYSQLHOST=${{MySQL.MYSQLHOST}}
MYSQLPORT=${{MySQL.MYSQLPORT}}
MYSQLUSER=${{MySQL.MYSQLUSER}}
MYSQLPASSWORD=${{MySQL.MYSQLPASSWORD}}
MYSQLDATABASE=${{MySQL.MYSQLDATABASE}}

JWT_SECRET=<cadena larga aleatoria>
JWT_EXPIRES_IN=8h
MASTER_INVITE_CODE=<tu código de instalación>

DB_TIMEZONE=-04:00
TZ=America/Caracas
TRUST_PROXY=1
CORS_ORIGIN=https://dashboard-asistencia-iutav.netlify.app
NODE_ENV=production
```

- `${{MySQL.…}}` son referencias: Railway las reemplaza con los datos de su MySQL
  (si tu servicio de base de datos tiene otro nombre, cambia `MySQL` por ese nombre).
- `JWT_SECRET`: genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
  No reutilices el de tu `.env` local.
- `DB_TIMEZONE` y `TZ`: Railway corre en UTC; sin ellas las clases quedarían 4 horas adelantadas.
- **No** definas `PORT` (lo pone Railway).

## 3. Volumen para los justificativos
Los archivos subidos se guardan en disco y Railway lo borra en cada despliegue.
Servicio de la API → **clic derecho** (o Settings) → **Attach Volume** → Mount path: `/app/uploads`.

## 4. Dominio público
Servicio de la API → **Settings** → **Networking** → **Generate Domain**.
Comprueba que `https://<tu-dominio>.up.railway.app/` responde `{"ok":true,...}`.

## 5. Conectar el panel (Netlify)
1. Netlify → Site configuration → Environment variables → `VITE_API_URL=https://<tu-dominio>.up.railway.app`
2. **Deploys** → **Trigger deploy** → **Deploy site** (Vite solo lee la variable al compilar).
3. Abre `https://dashboard-asistencia-iutav.netlify.app/registro` y crea el Coordinador Master
   con tu `MASTER_INVITE_CODE`. La base de Railway es distinta a la local: empieza vacía.

## 6. App Android
La app debe apuntar a `https://<tu-dominio>.up.railway.app/api` en lugar de la IP local.
