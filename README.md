# AI Grand Prix

Carrera de circuito en el navegador. Cada auto está afinado como un modelo: velocidad, contexto, razonamiento, creatividad y costo. El piloto elige un auto, corre contra un rival con personalidad propia y cierra las vueltas en el Autódromo del Gradiente.

La interfaz está en español rioplatense. El código y los contratos están en inglés para que otros agentes puedan sumar features en paralelo. El mapa de módulos, las reglas de performance y el backlog están en [ARCHITECTURE.md](ARCHITECTURE.md). Licencias de los assets en [ASSETS.md](ASSETS.md).

## Cómo correrlo

```bash
npm install
npm run dev
```

El servidor de desarrollo queda en http://127.0.0.1:4317.

| Comando            | Qué hace                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run dev`      | Vite en el puerto 4317                                                  |
| `npm run build`    | Chequeo de tipos y build estático en `dist/`                            |
| `npm run preview`  | Sirve el build en el puerto 4391                                        |
| `npm test`         | Vitest, física y vuelta completa sin navegador                          |
| `npm run test:e2e` | Playwright: menú, carrera, vuelta con autodrive y presupuesto de frames |
| `npm run lint`     | ESLint                                                                  |
| `npm run format`   | Prettier                                                                |

En carrera: flechas o WASD, S frena y no hay marcha atrás, Esc pausa, R reaparece, F3 muestra los FPS. Un gamepad usa el stick izquierdo, RT, LT y Start. `/?autodrive=1` maneja el auto del jugador con la IA. `/?fps=1` abre el overlay de frames.

El sitio es estático. `vercel.json` publica `dist/`.
