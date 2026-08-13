# Reglas de Proyecto: Dashboard Gerencial

## TypeScript y React (Frontend)
- El pipeline de CI/CD (GitHub Actions) en este proyecto es extremadamente estricto con los errores de TypeScript y el linter.
- **NUNCA** dejes variables declaradas pero no usadas. Esto romperá el build.
- **NUNCA** importes `React` (`import React from 'react';`) en los archivos `.tsx` a menos que uses un hook o clase que lo requiera explícitamente como `React.useRef`. El proyecto usa Vite y React 18+, donde JSX se transforma automáticamente. Importar `React` sin usarlo fallará el CI por la regla `TS6133`.
- Siempre que modifiques código de frontend, ejecuta `npx tsc --noEmit` en el directorio `app/` para verificar los tipos antes de hacer push.

## Arquitectura de Backend
- Todos los endpoints nuevos deben usar `asyncHandler` y estar modularizados.
- La base de datos es PostgreSQL (`crisolweb`). Las conexiones y consultas deben ir a través de `dbClient.js`.
