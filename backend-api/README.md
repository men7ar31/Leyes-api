# backend-api

API intermediaria entre la app mobile y fuentes legales publicas. Provee busqueda paginada, detalle de documentos y cache con MongoDB.

## Requisitos
- Node.js 18+
- MongoDB en ejecucion

## Configuracion rapida
1) Copiar `.env.example` a `.env` y ajustar `MONGO_URI`/`PORT`/`SAIJ_BASE_URL`/`LEGAL_SOURCE`.
   - Local: `mongodb://localhost:27017/leyes-app`
   - Atlas: `mongodb+srv://USER:PASS@HOST/leyes-app?retryWrites=true&w=majority&appName=leyes-app`
   - `LEGAL_SOURCE` se mantiene por compatibilidad, pero el router interno decide la fuente por tipo de contenido.
2) Instalar dependencias:
   ```bash
   npm install
   ```
3) Ambiente de desarrollo:
   ```bash
   npm run dev
   ```
4) Build + produccion local:
   ```bash
   npm run build && npm start
   ```

## Endpoints
- `GET /api/health` - healthcheck.
- `POST /api/saij/search` - busqueda unificada (routing inteligente de fuentes).
- `GET /api/saij/document/:guid` - detalle unificado con cache y fallback.
- `POST /api/provincial-codes/document` - extraccion dedicada de codigos provinciales.
- `GET /api/admin/saij/proxy-status` - endpoint opcional de estado de proxies (solo si `ENABLE_ADMIN_DEBUG_ROUTES=true`).

## Estrategia de fuentes
- `Mongo/cache` - primera capa para search/document cuando hay datos vigentes.
- `Infoleg` - legislacion nacional (leyes, decretos, resoluciones y documentos nacionales generales).
- `SAIJ` - codigos provinciales, jurisprudencia, fallos, sumarios y doctrinas.
- `provincial-codes` - logica dedicada para texto actualizado de codigos provinciales, con fallback controlado.

## Estructura principal
- `src/app.ts` - bootstrap de Express y rutas.
- `src/server.ts` - arranque del servidor y conexion Mongo.
- `src/config/` - carga de env y conexion DB.
- `src/modules/saij/` - modulo SAIJ (cliente, service, controller, rutas, tipos).
- `src/modules/infoleg/` - modulo Infoleg (busqueda y detalle).
- `src/modules/provincial-codes/` - scraping dedicado de codigos provinciales.
- `src/modules/legal-source/` - router inteligente de fuentes legales.
- `src/modules/admin/` - endpoints de debug admin opcionales.
- `src/modules/health/` - ruta de health.
- `src/middlewares/` - manejo de errores y 404.
- `src/utils/` - logger y utilidades.

## Proxy opcional para SAIJ
- Los proxies aplican solo a SAIJ (`saijHttpClient`).
- Infoleg y `provincial-codes` no usan proxy.
- Variables:
  - `SAIJ_PROXY_ENABLED=false`
  - `SAIJ_PROXY_LIST=`
  - `SAIJ_PROXY_MAX_ATTEMPTS=5`
  - `SAIJ_PROXY_COOLDOWN_MS=300000`
  - `SAIJ_PROXY_TIMEOUT_MS=15000`
  - `ENABLE_ADMIN_DEBUG_ROUTES=false`
- Formato de proxy en lista: `usuario:password@host:port` (separados por coma).

## Prueba manual recomendada
1. Configurar en `.env`:
   - `SAIJ_PROXY_ENABLED=true`
   - `SAIJ_PROXY_LIST=usuario:password@host:port,usuario:password@host2:port2`
2. Ejecutar:
   ```bash
   npm run build
   ```
3. Reiniciar servicio (por ejemplo con pm2):
   ```bash
   pm2 restart leyes-api
   ```
4. Probar:
   - `GET /api/health`
   - `POST /api/saij/search` con `contentType` en `jurisprudencia|fallo|sumario|doctrina`
   - `GET /api/saij/document/:guid`
   - `GET /api/admin/saij/proxy-status` (solo si `ENABLE_ADMIN_DEBUG_ROUTES=true`)
