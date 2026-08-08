# Magaluf — Cómo se juega

**De 3 a 6 jugadores.** Estáis de finde golfo en Magaluf. España es el paraíso de la fiesta y el alcohol barato, y vas a amortizar cada segundo y ese es precisamente tu objetivo. . Gana quien tenga más puntos de fiesta el lunes por la mañana. Pero ten cuidadocon  cuanto bebes, no todos llegan al lunes por la mañana.

---

## 1. El fin de semana

La partida dura **tres días**, y cada día tiene **tres fases**:

| Días | Fases |
|---|---|
| Viernes → Sábado → Domingo | Tardeo → Noche → After |

Nueve fases en total. Cada fase se juega por turnos en sentido horario; pero solo juegan los que siguen de fiesta. En tu turno tendrás que decidir si beber o retirarte.  La fase termina cuando no queda nadie de fiesta u os echan del bar para cerrar. Retirarse es **por fase**: si te vas a casa durante la Noche, vuelves para el After.

## 2. Tus cuatro números

| Número | Qué significa |
|---|---|
| **Intoxicación** | Lo borracho que estás ahora mismo. Se reinicia cada mañana. Nunca baja de cero. |
| **Resaca** | Daño permanente. Solo sube, y marca el nivel al que empieza tu Intoxicación cada mañana que te quede. |
| **En juego** | Puntos conseguidos durante la fiesta de hoy que todavía no están a salvo. |
| **Banco** | Puntos tuyos para siempre. Esto es lo que decide la partida. |

Los números de todos son visibles para todos en todo momento.

## 3. El Límite de Consumo

Cada mañana se roba una **carta de Límite** boca abajo. Es el mismo número
para todos los jugadores y es **la única información oculta del juego**. Sabes
qué números contiene la baraja del día, pero no cuál ha salido (valores provisionales):

| Día | Límites posibles |
|---|---|
| Viernes | 26 / 27 / 28 / 29 |
| Sábado | 20 / 23 / 26 / 29 |
| Domingo | 14 / 18 / 22 / 26 |

Por defecto, el límite se revela **al empezar el After**. El anfitrión puede
configurar que se revele antes, o que no se revele nunca.

Al final del día, todo jugador cuya Intoxicación esté **por encima** del
límite terminará la juerga en el balcón (sección 7). Estar exactamente en el límite es seguro.

## 4. Tu turno

En tu turno haces **una** de estas acciones:

- **Beber.** Levantas una carta de Alcohol y aplicas su Intoxicación y sus
  puntos. Después robas una carta de Evento, que se queda **boca abajo**. Tu
  turno todavía no ha terminado.
- **Revelar evento.** Le das la vuelta a tu carta de Evento y la resuelves.
  Esto termina tu turno.
- **Retirarte.** Te vas a casa el resto de la fase. Esto termina tu turno.

Beber son dos pasos a propósito: primero la mesa aplica la copa y solo después
se lee el evento en voz alta. **Mientras tu evento está boca abajo no puedes
hacer nada más** — ni beber otra vez, ni retirarte, ni usar objetos — y nadie
más puede darle la vuelta por ti.

Además, una vez por turno puedes **usar un objeto**. Usar un objeto es gratis
y no termina tu turno (salvo las dos excepciones de la sección 5). No se
permite usar un segundo objeto en el mismo turno.

Las copas que no eliges tú — una Ronda, un Chupito de la casa — también cuentan
como copas tuyas en esta fase.

## 5. Topes de fase y salidas

| Fase | Copas máx. | Copas mín. | Penalización por aguafiestas | Bonus de Último en Pie |
|---|---|---|---|---|
| Tardeo | 4 | 2 | −2 puntos | +2 puntos |
| Noche | 5 | 3 | −4 puntos | +3 puntos |
| After | 4 | 1 | −5 puntos | +5 puntos |

- Llegar al **máximo** te manda a casa automáticamente: cierran el local.
- Retirarte con **menos copas que el mínimo** te cuesta la penalización por
  aguafiestas.
- El bonus de **Último en Pie** es para el último jugador que abandona la
  fase, y solo si ese jugador ha cumplido el mínimo de copas.
- Que te eche el portero, que te lleve la ambulancia o que te detengan no
  cuenta como retirarse, y nunca cuesta la penalización por aguafiestas.

## 6. Objetos

Puedes tener todos los objetos que quieras. Se conservan de un día para otro.

| Objeto | Efecto | ¿Legal? |
|---|---|---|
| Kebab | −3 de Intoxicación | Sí |
| Botella de agua | −2 de Intoxicación | Sí |
| Red Bull | Miras el Límite del día. Solo lo ves tú. | Sí |
| Porro | Te saltas tu robo este turno sin retirarte. **Termina tu turno** y no cuenta como copa. | No |
| Pastis | Duplica los puntos de tu próxima copa. | No |
| Farlopa | Bebes otra copa inmediatamente, con la **mitad** de su Intoxicación (redondeando hacia abajo). Esa copa también roba Evento. **Resaca +3.** No termina tu turno salvo que esa copa extra llegue al máximo de la fase. | No |

El Porro, el Pastis y la Farlopa son **contrabando**, lo cual importa cuando
aparece la policía.

## 7. El final del día

Al final de cada día se comprueba el límite a todo jugador vivo que no esté en
el calabozo.

**Igual o por debajo del límite:** sobrevives la noche. Tus puntos en juego
pasan al banco, multiplicados por el ritmo del día y redondeados:

| Día | Multiplicador |
|---|---|
| Viernes | ×1 |
| Sábado | ×1,5 |
| Domingo | ×2,25 |

**Por encima del límite:** vas al balcón. Llamamos **`d`** a cuánto te has
pasado (Intoxicación − Límite; siempre al menos 1).

Tiras **1d6**. Sobrevives si sacas **estrictamente más que `d`**.

- **Piscina.** Sobrevives, y la noche sobrevive contigo. Tus puntos en juego
  pasan al banco con el multiplicador del día, igual que si no te hubieras
  pasado, conservas tus objetos y además guardas **3 + `d`** puntos como
  leyenda de Magaluf (este bonus no se multiplica). Te llevas **Resaca +4** y
  sigues jugando.
- **Cemento.** Estás muerto. **Pierdes todos los puntos en juego de hoy y
  todos tus objetos**, y no participas en el resto del fin de semana. Los
  puntos que guardaste noches anteriores siguen siendo tuyos.

Con un d6, una `d` de 6 o más no se puede sobrevivir. El anfitrión puede
elegir otro dado antes de empezar la partida.

## 8. A la mañana siguiente

- Tu Intoxicación se reinicia a tu **Resaca**.
- Los contadores de copas se reinician y todos vuelven a estar de fiesta.
- Quien fuera detenido el día anterior sale y juega con normalidad.
- Los muertos no vuelven.

## 9. La policía

Hay dos cartas de Evento con policía. **Las dos alcanzan solo a los jugadores
que siguen de fiesta**: a quien ya se ha ido a casa no le pasa nada.

- **Cacheo.** Todo jugador de fiesta que lleve contrabando lo tira y pierde 3
  puntos.
- **Redada.** Todo jugador de fiesta que lleve contrabando es **detenido**:
  sus puntos en juego pasan al banco inmediatamente con el multiplicador del
  día, se queda fuera del resto de fases de ese día, no paga penalización por
  aguafiestas y **no tiene comprobación de límite esa noche**. Sale a la
  mañana siguiente. Si nadie lleva contrabando, no pasa nada.

## 10. Eventos que conviene conocer de antemano

La mayoría de los Eventos simplemente dan o quitan puntos e Intoxicación, y lo
dicen en la carta. Algunos cambian la estructura del turno:

- **Ronda** — todos los que sigan de fiesta beben una carta de Alcohol.
- **Chupito de la casa** — bebes una carta de Alcohol más.
- **Portero** — abandonas la fase inmediatamente, sin penalización.
- **Te pierdes** — pierdes tu próximo turno, pero sigues de fiesta.
- **Vomitona** — −4 de Intoxicación ahora, **Resaca +3** para siempre.
- **Ambulancia** — se llevan al jugador más borracho de la mesa: −5 de
  Intoxicación, **Resaca +4**, y se le acaba la fase.
- **Te roban la cartera / Despiertas sin nada** — pierdes todos tus objetos.
- **Camello** — recibes una pieza de contrabando.

## 11. Cómo se gana

Gana quien tenga más puntos **en el banco** tras la resolución del domingo.
Los jugadores muertos conservan todo lo que guardaron las noches que
sobrevivieron. Los empates se resuelven a favor de quien haya sobrevivido a
más Intoxicación total durante el fin de semana; si eso también empata, la
victoria es compartida.

---

## Comprobación de comprensión

Responde de memoria antes de tu primera partida.

1. Tu Intoxicación es exactamente igual al límite del día al final del sábado.
   ¿Qué ocurre?
2. Llevas 2 copas en la Noche y te retiras. ¿Qué te cuesta?
3. Bebes y robas una carta de Evento. ¿Puedes usar un Kebab antes de
   revelarla?
4. Te has pasado 3 del límite el domingo por la noche y llevas 20 puntos en
   juego. ¿Qué necesitas sacar y qué pasa con esos 20 puntos en cada uno de
   los dos resultados?
5. Vomitas el viernes. ¿Con cuánta Intoxicación empiezas el sábado por la
   mañana y el domingo por la mañana, si no pasa nada más?
6. Sale una Redada mientras llevas un Porro y sigues de fiesta. Enumera todo
   lo que te pasa.
7. ¿Qué única información del juego está oculta para ti y cuáles son las dos
   formas de conocerla?
8. Usas Farlopa y la copa extra es un Cubata (3 de Intoxicación). ¿Cuánta
   Intoxicación te llevas y qué más te cuesta?
9. Eres el último jugador que queda en el After y has bebido una vez.
   ¿Recibes el bonus?
10. Mueres el sábado por la noche con 40 puntos en el banco. ¿Cuál es tu
    puntuación final?
