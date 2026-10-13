# TFHG — Jerarquía de roles en restaurantes top de NY

Investigación del 13 de octubre de 2026 que alimenta el blueprint v1.2. El banco de preguntas completo está en `docs/PREGUNTAS-DUENO.md`.

## Resumen
El sistema tiene que modelar 10 posiciones de piso en 4 capas (soporte, servicio, conducción del servicio y negocio), más el dueño, que configura todo. Es la estructura de los restaurantes high-class de Manhattan: los nombres cambian según la casa, pero las funciones son estables.

- **La jerarquía es por estaciones.** El salón se divide en secciones, cada una con un captain o server al frente y busser y runners de apoyo. El dato más importante para un empleado es en qué sección está hoy y con quién.
- **Faltaban server y host / maître d'** en la lista original. El sommelier es una 11.ª opcional.
- **Los puntos del tip pool los define cada casa.** El orden se repite (captain arriba, polisher abajo), pero el dueño tiene que poder cargarlos por rol y por local.
- **La ley de NY condiciona el diseño:** el manager no puede cobrar del pool; el captain sí, si atiende mesas.
- **El empleado ve poco y el manager ve todo.** Los warnings los ven el propio empleado y los managers, nunca los compañeros.

Confianza: alta en la estructura de roles; media en horarios y puntos, que varían por casa y hay que confirmar con TFHG.

## Las 10 posiciones
| # | Posición | Qué hace | Reporta a | Lo que necesita ver |
|---|---|---|---|---|
| 1 | Polisher | Pule cristalería y cubiertos, repone estaciones, dobla servilletas | Captain / manager de turno | Horario, checklist de reposición, reglas de cristal |
| 2 | Busser / back server | Limpia y resetea mesas, agua y pan, retira platos, café y bebidas si la casa lo permite | Captain / server de su sección | Su sección, su captain, reglas, horario, sus warnings |
| 3 | Barback | Lo mismo para la barra: hielo, cristalería, garnish, reposición de botellas | Bartender / head bartender | Horario, botellas a reponer, checklist de barra |
| 4 | Food runner | Único que lleva la comida de la cocina a la mesa, por mesa y posición | Expo | Plano con mesas y posiciones, menú con alérgenos |
| 5 | Expo | Trabaja el pase: lee cada ticket, controla cada plato antes de que salga | Chef / manager | Menú completo, plano, reglas del pase |
| 6 | Server / front waiter | Toma la orden y guía al comensal | Captain | Sección y mesas, menú, reglas, horario, warnings |
| 7 | Bartender | Vende y prepara bebidas; con el barback responde por las botellas que se terminan | Head bartender / manager | Carta, horario, faltantes, reglas de barra |
| 8 | Captain | Lleva el servicio de una zona: reservas, ritmo, cocina; entrena a los nuevos | Maître d' / manager | Mapa de secciones en vivo, quién está dónde, warnings de su equipo |
| 9 | Host / maître d' | Recibe al comensal, maneja reservas y asigna mesas | Manager / GM | Reservas, plano, secciones del día |
| 10 | Manager (FOH, AGM, GM) | Controla el negocio: horarios, aprobaciones, sanciones, contrataciones | Dueño | Todo su local |

"Sin ticket no hay nada" es la lógica del expo: queda como regla escrita del local, no como función de POS.

## Escalera de carrera
- **Salón:** polisher → busser → food runner → expo → server → captain → maître d' → manager (AGM → GM).
- **Barra:** polisher → barback → bartender → head bartender → manager.

Cada empleado tiene un rol principal y una lista de roles habilitados. El ascenso es un cambio de rol con fecha, no un usuario nuevo.

## Horario típico (a confirmar por local)
| Bloque | Horario habitual | Quién |
|---|---|---|
| Montaje almuerzo | ~10:00 a 11:00 | Polisher, bussers, barback, primer manager |
| Pre-shift | ~30 min antes de abrir | Todo el piso + manager |
| Servicio almuerzo | ~11:30 a 15:00 | Piso completo, bar, expo |
| Cambio de turno | ~15:00 a 16:30 | Cierre de almuerzo, montaje de cena |
| Servicio cena | ~17:00 a 23:00 | Piso completo; pico 19:00 a 21:00 |
| Cierre | hasta ~00:30 | Bussers, barback, bartender, manager |

Los dobles son comunes y se muestran como un día con dos bloques. La cena en NY se adelantó, así que el horario debe configurarse por día de la semana. El pre-shift es parte del turno.

## Tip pool por puntos (referencia, no modelo)
| Rol | Del Posto (2010) | Ejemplo Ferry | iTrulli (2015) |
|---|---|---|---|
| Captain | 6 | 10 | — |
| Server | 4 | 8 | 1 parte |
| Bartender | 5 | — | — |
| Sommelier | — | 6 | media parte |
| Expo | 4 | 4 | — |
| Back waiter / busser | menos de 4 | 5 / 3 | media parte |
| Runner | menos de 4 | — | media parte |
| Polisher | 2 | — | — |

Reglas de NY que tocan el diseño: el manager queda fuera del pool; el empleador pierde el tip credit si un empleado con propina pasa más de 2 horas o el 20 % del turno en tareas sin propina; la política del pool tiene que estar por escrito. Nada de esto es asesoría legal: lo valida el abogado laboral de TFHG.

## Qué ve y qué hace cada capa
| Función | Soporte | Servicio | Conducción | Manager | Dueño |
|---|---|---|---|---|---|
| Su horario y sección | Sí | Sí | Sí | Sí | Sí |
| Mapa de secciones completo | Lectura | Lectura | Sí | Sí | Sí |
| Menú con fotos | Sí | Sí | Sí | Sí | Edita |
| Reglas y confirmación | Sí | Sí | Sí | Sí | Edita |
| Cambio de turno / disponibilidad | Sí | Sí | Sí | Aprueba | Aprueba |
| Ver warnings | Propios | Propios | Su equipo | Su local | Todos |
| Emitir warning | No | No | Propone | Emite | Emite |
| Asignar secciones | No | No | Sí | Sí | Sí |
| 86s y notas de pre-shift | No | Expo | Sí | Sí | Sí |
| Armar y publicar horario | No | No | No | Sí | Sí |
| Log del turno | No | No | Sí | Sí | Lee |
| Configurar roles, puntos, locales | No | No | No | No | Sí |

## Fuentes
Waiting staff (Wikipedia) · How to staff a restaurant (Toast) · Busser y Expeditor (Loyalist) · What does expo refer to (Tasting Table) · Kitchen Expeditor (USHG) · Floor Captain (Arlo Williamsburg) · Polisher (Zero Bond, The Grill) · Del Posto tip pool lawsuit (CNBC) · Fine dining tip pools (Ferry) · Matter of Marzovilla (NY Courts) · Barenboim v. Starbucks (Littler) · Tip pooling (Homebase) · Minimum wage for tipped workers (NY DOL) · How long are server shifts (OysterLink) · Restaurant shift change (Toast) · Early dining trend (NY Post vía AOL) · Roles (7shifts KB) · 7shifts editions (ADP).

Limitaciones: no hay un estándar único de roles ni de puntos en NY; los horarios son una estimación; no se consultaron manuales internos de grupos como USHG o Dinex. Lo que más cerraría la brecha es una semana real del 7shifts de TFHG y su manual del empleado.
