# backend-api

API intermediaria entre la app mobile y SAIJ. Provee búsqueda paginada, detalle de documentos y caché con MongoDB.

## Requisitos
- Node.js 18+
- MongoDB en ejecución

## Configuración rápida
1) Copiar `.env.example` a `.env` y ajustar `MONGO_URI`/`PORT`/`SAIJ_BASE_URL`.  
   - Local: `mongodb://localhost:27017/leyes-app`  
   - Atlas: `mongodb+srv://USER:PASS@HOST/leyes-app?retryWrites=true&w=majority&appName=leyes-app`
2) Instalar dependencias:
   ```bash
   npm install
   ```
3) Ambiente de desarrollo:
   ```bash
   npm run dev
   ```
4) Build + producción local:
   ```bash
   npm run build && npm start
   ```

## Endpoints iniciales
- `GET /api/health` — healthcheck.
- `POST /api/saij/search` — endpoint estructurado, aún sin lógica de búsqueda (responde 501).

## Estructura principal
- `src/app.ts` — bootstrap de Express y rutas.
- `src/server.ts` — arranque del servidor y conexión Mongo.
- `src/config/` — carga de env y conexión DB.
- `src/modules/saij/` — módulo SAIJ (cliente, service, controller, rutas, tipos).
- `src/modules/health/` — ruta de health.
- `src/middlewares/` — manejo de errores y 404.
- `src/utils/` — logger y utilidades.

Las siguientes etapas completarán la lógica de búsqueda, detalle de documentos, caché y prefetch.
