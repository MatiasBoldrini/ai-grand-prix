# Playtest, ronda 1

Sesión en escritorio a 1920×1080. No se tocó el código del juego. Se dejaron afuera el look (hay otro agente en el estilo de día y la UI nueva), los nombres de los circuitos y la temática de los autos.

## Cómo se jugó

- `npm install` y `npm run dev` en http://127.0.0.1:4317/
- Viewport 1920×1080. El renderer de esta máquina es SwiftShader (Vulkan por software, ANGLE). No hay GPU real.
- Teclado de verdad (W/A/S/D, Escape, R) en los tres circuitos. En el Gradiente hubo tandas largas: muro, pasto, daño, reaparición y pausa. En Costanera y Embeddings, una salida con acelerador y correcciones cortas de dirección.
- `/?autodrive=1` solo para llegar a la bandera del Gradiente después de que el teclado y el piloto automático se quedaran en el pasto. Sirvió para ver el fantasma, el podio y el audio.
- Pantallas recorridas: menú, garaje (los dos autos, los tres rivales, las cuatro puestas a punto), campeonato (largar la fecha 1, abandonar, volver a entrar, recargar), ajustes (volumen 0 / 100 / 90, música, las tres calidades), HUD, pausa y podio.

## Tiempo de cuadro

Medido con `/?fps=1` y `window.__AGP`, sin contar los frames en los que la herramienta sacaba capturas.

| Momento | Cuadro | Simulación |
| --- | --- | --- |
| Carrera quieta, sin capturas | 26–32 ms (unos 31–38 fps) | 0,05–0,15 ms |
| Carrera con capturas encima | 35–46 ms | sigue por debajo de 0,2 ms |
| Presupuesto que muestra el HUD | 16,7 ms | |

El canvas CSS es 1920×1080 y el buffer quedó en 1905×1081 con `devicePixelRatio` 1. La consola avisó stalls de ReadPixels al componer. La simulación está holgada. El faltante contra 60 fps es el rasterizador por software de esta VM. No hay un ítem de performance: no aparece un costo de juego que convenga atacar aparte de eso.

## Lo que ya funciona

- El garaje aplica la puesta y lo dice: motor abierto +14% de motor y −22% de tanque, piso firme −8% y +10% de agarre, tanque largo −10% y +35% de tanque. El menú se entera del auto y del rival. La puesta queda en `localStorage`.
- Ajustes: la barra va de a 5, Home/End llegan a 0% y 100%, la música se apaga y queda guardada, la calidad balanceada sigue en tope 1,25.
- La radio habla en carrera: muro, vuelta del rival en 0:35.500, y «Cerraste la vuelta en 1:12.033. Te queda una.»
- R te suelta en el asfalto a unos 14–20 m/s. El minimapa sigue al auto. El podio cierra la cuenta (1:09.500 contra 2:09.383, diferencia 59.883 s).
- El audio arranca: un loop de música de 96 s, el motor, y cuatro golpes de choque de 0,27 s en la carrera automática. Cero errores de consola. El aviso de Collada es de carga del modelo, no se oye en juego.
- Costanera y Embeddings, con teclado, llegan a unos 27 m/s (97 km/h) en cuatro segundos con el chasis en 100%. El auto puede andar. El problema es salirse y la largada.

## Hallazgos

Ordenados por cuánto traban la carrera. Tamaño S o M. Ningún par comparte archivos: se pueden construir en paralelo. Abajo está dicho qué ítems se rozan en el síntoma y aun así no se pisan.

### 1. Salirse del asfalto deja la carrera colgada

**Tamaño:** M

**Problema.** En el Gradiente, con `/?autodrive=1`, el auto del jugador está en el pasto a los 12 s. A los 16 s va a 0,24 m/s, el chasis marca 85% y la radio dice «Tocaste el muro. Enderezá y seguí.» Sigue así por lo menos hasta los 40 s. El rival cierra su vuelta en 0:35.500. El jugador cierra la primera en 1:12.033 y en la segunda vuelve a quedar en el pasto a 1 km/h (chasis 72%, nota vacía, el auto mirando la cuerda desde afuera). Con teclado pasa lo mismo: a 0,1 m/s en el pasto, con W apretada, la nota dice «Te fuiste al pasto. Volvé al asfalto.» S solo frena. El rescate automático no dispara porque exige acelerador fuerte y casi no exige estar fuera del asfalto; si el piloto frena para no seguir contra el muro, el contador se reinicia.

**Repro.**

1. Abrí `/?autodrive=1` a 1920×1080, Gradiente, Flash contra el rival de serie.
2. Esperá 16 s. Velocidad bajo 1 m/s, nota de pasto o radio de muro, puesto 2º.
3. Esperá otros 20 s. El auto no vuelve solo. El rival ya dio una vuelta.
4. Con teclado, en una carrera nueva, salí al pasto y frené. La nota pide volver al asfalto y el auto no retrocede.

**Cambio.** Si el auto está fuera del asfalto y va a menos de unos 1,5 m/s durante unos 2 s, reaparece en la pista aunque esté frenando. Es el mismo rescate que ya hace R. El jugador y el piloto automático tienen que poder seguir la carrera sin conocer una tecla escondida en la pausa.

**Archivos.** `src/race/world.ts`

**Aceptación.** En `/?autodrive=1` en el Gradiente, un auto que queda en el pasto a menos de 1,5 m/s vuelve al asfalto en menos de 3 s y sigue por encima de 8 m/s. Frenar contra el muro no cancela ese rescate. R sigue funcionando.

### 2. «Seguí corriendo» no suelta la pausa de Escape

**Tamaño:** S

**Problema.** Escape pausa de verdad. El botón «Seguí corriendo» vuelve a mostrar el HUD y deja la física congelada. La única forma de seguir es apretar Escape otra vez. El botón Pausa del HUD, si la carrera no venía de Escape, sí deja acelerar.

**Repro.**

1. Carrera nueva en el Gradiente, teclado.
2. W alrededor de 1,2 s. La velocidad llega a 10,7 m/s.
3. Escape. A los 0,5 s la velocidad sigue en 10,964 m/s. Bien: está pausada.
4. Clic en «Seguí corriendo». El HUD vuelve.
5. W durante 1 s. La velocidad queda exactamente en 10,963963572497851.
6. Escape, Escape, W durante 0,8 s. La velocidad sube a 17,6 m/s.

**Cambio.** Volver al HUD tiene que limpiar la pausa, venga del botón o de Escape. Con el HUD activo y una carrera cargada, el paso de física corre.

**Archivos.** `src/game/app.ts`

**Aceptación.** El repro de arriba termina el paso 5 con la velocidad por encima de 14 m/s. Escape sigue pausando y, apretado de nuevo sobre la pausa, sigue reanudando.

### 3. Un roce con el muro liquida el auto, y R no lo arregla

**Tamaño:** M

**Problema.** Cada toque de muro saca alrededor de 4% cada 0,45 s, y el piso es 20%. En una sola salida con teclado el chasis pasó de 100% a 22% entre 0:03.883 y 0:12.100 («Perdiste 8%», después «Perdiste 14%», radio «Otra vez el muro. Abrí la línea.»). Ahí el cartel dice «Quedó muy tocado. Ya casi no empuja.» R devuelve el auto a la pista y deja el número igual: 20% seguía en 20%, y en la carrera automática 72% seguía en 72%. A partir de ese momento la carrera ya está perdida aunque vuelvas al asfalto.

**Repro.**

1. Gradiente, teclado, W hacia el muro de la primera curva.
2. Mirá el chasis: en unos 8 s de contacto baja hasta el piso.
3. R. La velocidad vuelve. El porcentaje no.

**Cambio.** Un raspado continuo no puede cobrar un choque nuevo cada medio segundo hasta dejar el motor en el piso. Un toque duele una vez. Reaparecer (R o el rescate del ítem 1) devuelve el chasis al menos a 85%.

**Archivos.** `src/race/hooks/damage.ts`

**Aceptación.** Diez segundos apoyado en el muro bajan el chasis como máximo 15 puntos desde el valor al primer contacto. Después de R, el chasis queda en 85% o más. Un golpe aislado sigue restando y el HUD lo muestra.

### 4. El muro puede disparar el auto a miles de km/h

**Tamaño:** S

**Problema.** Con W metido contra el muro, `window.__AGP.playerSpeed` pegó picos de 640 m/s, 749 m/s y 1066 m/s (unos 2300–3800 km/h) y también valores negativos. El HUD de velocidad redondea y esconde el signo, así que el jugador ve un salto o un 0. Esos picos, además, le ganan al contador de «estoy atascado» porque durante un frame la velocidad ya no es baja.

**Repro.**

1. Gradiente, teclado, W a fondo contra la barrera.
2. Leé `__AGP.playerSpeed` varias veces por segundo.
3. Aparecen picos de cientos de m/s entre muestras de casi 0.

**Cambio.** Después de resolver el muro, la velocidad longitudinal no puede superar la de antes del golpe ni un techo sano (45 m/s alcanza). El golpe frena. No catapulta.

**Archivos.** `src/race/contact.ts`

**Aceptación.** El repro, muestreado durante 15 s, no pasa de 45 m/s. El auto sigue perdiendo velocidad contra la barrera.

### 5. La largada ya te encuentra segundo y quieto

**Tamaño:** M

**Problema.** No hay cuenta atrás. El rival acelera en el primer instante y el reloj corre. En las tres pistas, antes de tocar una tecla, el HUD ya decía 2º a 0 km/h: Gradiente a los 0,45 s, Costanera a los 0,47 s, Embeddings a los 0,48 s, y la fecha 1 del campeonato a los 0,72 s. Con teclado, a los cuatro segundos y a 97 km/h seguías 2º.

**Repro.**

1. Elegí cualquiera de los tres circuitos y entrá a la carrera.
2. No toques el teclado.
3. Antes del primer segundo el puesto es 2º, la velocidad es 0 y el tiempo ya avanzó.

**Cambio.** Un hook nuevo congela a los dos autos unos 3 s y un widget nuevo muestra la cuenta (3, 2, 1, ya). El reloj de vuelta arranca cuando se apagan las luces. Los dos salen juntos. No hace falta editar el registro: el hook y el widget entran por el glob.

**Archivos.** `src/race/hooks/lights.ts` (nuevo), `src/ui/widgets/lights.ts` (nuevo)

**Aceptación.** Durante la cuenta, los dos autos se quedan en la grilla y el puesto no pasa a 2º por el solo paso del tiempo. Al soltar, el jugador con W puede ir primero si sale mejor. El widget se ve a 1920×1080 y no tapa el botón de pausa.

### 6. El fantasma miente después de R

**Tamaño:** S

**Problema.** El fantasma sí compara cuando hay una vuelta guardada: en la segunda vuelta del Gradiente automático marcaba +19,200 s. R teletransporta el auto hacia adelante y el delta pasa a decir que vas adelante. Unos 8 s después de R, el mismo widget marcaba −16,976 s. No adelantaste: te movieron.

**Repro.**

1. Llegá a una segunda vuelta con fantasma visible (en esta sesión, el automático del Gradiente).
2. Anotá el delta.
3. R.
4. El delta cambia de signo a favor del jugador sin que el auto haya recorrido ese tramo.

**Cambio.** Un salto de reaparición no cuenta como tiempo ganado. Hasta que el auto vuelva a pasar por donde iba, el delta sigue en la fase de grabación o se congela en el último valor honesto.

**Archivos.** `src/race/hooks/ghost.ts`

**Aceptación.** R en la segunda vuelta no invierte el delta. La vuelta en la que reapareciste no reemplaza la mejor vuelta. Una segunda vuelta limpia, sin R, sigue mostrando adelante o atrás.

### 7. El podio te llama «Vos, vos»

**Tamaño:** S

**Problema.** El auto del jugador ya se llama «Vos». El podio le agrega «, vos». En la carrera terminada del Gradiente, el escalón y la tabla decían «Vos, vos» (2º, 2:09.383, vueltas 1:12.033 y 0:57.350). El resto del podio está bien: el rival, los parciales y la diferencia cierran.

**Repro.**

1. Terminá una carrera (en esta sesión, `/?autodrive=1` en el Gradiente, con R para salir del pasto).
2. Leé el podio y la lista de tiempos.

**Cambio.** Si el nombre ya es el del jugador, el podio lo muestra una sola vez.

**Archivos.** `src/ui/screens/results.ts`

**Aceptación.** El podio y la tabla dicen «Vos» una vez. «Otra carrera» y «Volver al menú» siguen con ese texto. El orden y los tiempos no cambian.

### 8. La radio se sienta encima del fantasma

**Tamaño:** S

**Problema.** A 1920×1080, con el muro y con el aviso de vuelta, la pastilla de la radio y el delta del fantasma ocupan el mismo lugar. Cajas medidas: fantasma en x 907, y 72, 106×45; radio en x 853, y 80, 215×37. En la segunda vuelta se leía «Cerraste la vuelta en 1:12.033. Te queda una.» justo donde tiene que leerse el delta. El dato de vuelta y el dato de fantasma no se pueden leer juntos, y la radio aparece justo en la vuelta y en el muro.

**Repro.**

1. Carrera en el Gradiente a 1920×1080.
2. Tocá el muro, o cerrá una vuelta.
3. Medí las cajas de `[data-ghost-delta]` y `[data-widget="radio"]`. Se solapan.

**Cambio.** Bajá la radio para que quede debajo del fantasma, con un margen claro, en 1920×1080. El texto de la radio no cambia.

**Archivos.** `src/ui/widgets/radio.ts`

**Aceptación.** Con la radio visible y el fantasma en «Grabando» o con un delta, las dos cajas no se intersectan a 1920×1080. La radio sigue apareciendo una vez por evento.

### 9. El campeonato se olvida al recargar

**Tamaño:** S

**Problema.** La temporada vive en memoria. Abandonar una fecha la deja «En curso» y el botón pasa a «Retomá la fecha 1», eso está bien dentro de la misma sesión. En `localStorage` solo estaban `agp-preferences` y `agp-garage-setup`. Después de recargar, la fecha que estaba en curso volvió a «Pendiente», los dos a 0 pts, y el botón otra vez «Arrancá la fecha 1». Tres fechas no sobreviven un refresh. La puesta a punto y el volumen sí.

**Repro.**

1. Entrá a Campeonato y largá la fecha 1.
2. Escape, «Abandoná la carrera», volvé a Campeonato. La fecha 1 dice «En curso».
3. Recargá la página y abrí Campeonato. Las tres fechas están pendientes y la tabla está en 0.

**Cambio.** Guardá la temporada en `localStorage` con su propia clave y releela al abrir la pantalla. Un campeonato terminado sigue pudiendo empezar de cero con el botón que ya existe.

**Archivos.** `src/championship/standings.ts`

**Aceptación.** El repro del paso 3 muestra la fecha 1 en curso, no una tabla nueva. Borrar la clave vuelve a una temporada en cero. Los puntos de una carrera terminada también siguen ahí después de recargar.

## Conflictos

Ningún ítem comparte archivos con otro. Se pueden encargar los nueve a la vez.

| Ítem | Archivos | Se roza en el síntoma con |
| --- | --- | --- |
| 1 Rescate en el pasto | `src/race/world.ts` | 3 y 4. El rescate sigue haciendo falta cuando no hay pico de velocidad: el automático se quedó en 0,24 m/s sin catapulta. |
| 2 Pausa | `src/game/app.ts` | Ninguno. |
| 3 Daño y reparación | `src/race/hooks/damage.ts` | 1 y 6, porque los tres miran la reaparición. Cada uno edita su archivo. |
| 4 Pico de velocidad | `src/race/contact.ts` | 1. El pico también le miente al contador de atasco. El clamp va en el contacto; el rescate, en el mundo. |
| 5 Luces de largada | `src/race/hooks/lights.ts`, `src/ui/widgets/lights.ts` | Ninguno. No editar `world.ts` ni `app.ts`. |
| 6 Delta del fantasma | `src/race/hooks/ghost.ts` | 3. La reparación del chasis no tiene que cambiar el delta. |
| 7 «Vos, vos» | `src/ui/screens/results.ts` | Ninguno. |
| 8 Radio sobre el fantasma | `src/ui/widgets/radio.ts` | 6. El widget del delta no se mueve; se mueve la radio. |
| 9 Campeonato | `src/championship/standings.ts` | Ninguno. |

No hace falta un ítem de garaje, de ajustes, de audio ni de tiempo de cuadro.
