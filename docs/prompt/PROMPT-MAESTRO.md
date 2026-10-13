# Prompt maestro — The First Hospitality Group (brandkit + blueprint fullstack centralizado)

> Modelo destino: Claude (Claude Code o chat de Claude con skills). Copiar todo lo que está entre las líneas `=====`.
> Ya se ejecutó el 2026-10-13 y se actualizó a v1.3 el mismo día (estética ejecutiva, verde martini, el león, toda la organización por áreas, cadena de supervisión, estados en vez de números). Antes, v1.2: solo gestión (sin plata), el horario en el centro como 7shifts y 10 puestos con escalera. Donde este prompt diga algo distinto, mandan `docs/BLUEPRINT.md` y `docs/adr/README.md`.
> El resultado es este paquete. Sirve para rehacerlo o actualizarlo en otra sesión, adjuntando el blueprint de OSCURA NYC como blueprint existente.

## Estrategia

- **Formato:** un meta-prompt en XML, que es el que mejor sigue Claude, con tareas en orden fijo.
   1. Leer el blueprint existente y armar una tabla de mapeo: qué se mantiene, qué se adapta, qué se reemplaza y qué se agrega.
   2. Correr /brandkit.
   3. Correr /blueprint-fullstack-premium usando lo anterior como entrada.
   4. Entregar un único .zip.
- **Conflictos:** en producto y marca manda el prompt nuevo. En stack, convenciones de código e infraestructura manda el blueprint existente. Cada conflicto queda registrado como decisión de arquitectura (ADR).
- **Branding:** blanco como principal, negro como secundario y verde martini `#4A6B3E` como color de marca, y un león de perfil como logo, con chequeo de contraste. Los colores de los warnings van aparte, para no confundir el color de marca con un estado.

=====

<rol>
Sos el director técnico y de producto de TCM. Vas a centralizar un proyecto de software para hospitality de alta gama en Nueva York: primero su identidad de marca, después su blueprint fullstack completo. Trabajás con criterio de producto, no de plantilla: cada decisión sale del contexto de abajo.
</rol>

<insumos>
1. Este prompt: es la fuente de verdad del producto (qué es, para quién, qué módulos, qué marca).
2. El blueprint de OSCURA NYC (BLUEPRINT.md, AGENTS.md, CLAUDE.md, GRAPH_REPORT.md), adjunto como [BLUEPRINT_EXISTENTE]. Es la base técnica a adaptar: el producto se hace de cero para restaurantes con la misma base.
</insumos>

<contexto_del_producto>
<nombre>The First (la app) de The First Hospitality Group. Logo: un león de perfil en verde martini.</nombre>

<cliente>
Una compañía de hospitality high-class en Nueva York, The First Hospitality Group, con 4 restaurantes. Quien paga es el dueño. Pidió algo como 7shifts, pero 7shifts solo resuelve horarios y comunicación.
</cliente>

<mision>
Un solo sistema operativo para toda la compañía: cada empleado entra con su usuario y ve en el celular exactamente qué hacer, qué se sirve y cuáles son las reglas. Mejora la comunicación y agiliza la operación. Tesis de venta: Protección → Organización → Más dinero + Control.
</mision>

<usuarios>
- Staff de restaurantes de lujo en NYC: alta rotación, multilingüe, siempre con el celular.
- Estándar de usabilidad: que alguien de 12 años lo entienda sin explicación y alguien de 65 lo use sin ayuda. Es una meta de facilidad, no un perfil de contratación: las cuentas son para personas en edad legal de trabajar en NY, y servir o preparar alcohol exige mayoría de edad.
- Estética ejecutiva y corporativa, a la altura de un restaurante high-class.
</usuarios>

<reglas_de_experiencia>
- Una pantalla, una tarea: al abrir, cada rol ve primero lo que tiene que hacer hoy.
- Foto antes que texto: platos, tragos, inventario y tareas con imagen.
- Botones grandes, texto legible, opción de letra grande.
- Inglés y español, elegido por cada usuario, sin jerga de software.
- El empleado no configura nada: entra y ya está todo cargado.
- Mobile-first: el staff lo usa en el celular; manager y dueño también en escritorio.
</reglas_de_experiencia>

<estructura>
- Una compañía → 4 restaurantes → el mismo sistema para todos (multi-tenant por local dentro de una compañía).
- Lo que se carga una vez (menú, reglas, tareas modelo) sirve para los 4; cada local tiene sus propios datos (horarios, inventario, cierres, warnings).
</estructura>

<roles_y_vistas>
| Rol | Qué ve |
|---|---|
| Server | Menú con fotos, tareas de apertura y cierre, horario, reglas, mensajes, sus warnings |
| Runner | Menú con fotos, tareas, horario, mensajes, sus warnings |
| Busser | Tareas de apertura y cierre, horario, reglas, mensajes, sus warnings |
| Bartender / Barback | Inventario de barra con foto, tareas, horario, mensajes, sus warnings |
| Kitchen | Mensajes y comunicación con el salón |
| Manager / Capitán | Todo lo anterior + cargar warnings, notas del día, reporte de cierre |
| Dueño | Los 4 restaurantes en una vista: cierres, inventario, rendimiento del equipo |
</roles_y_vistas>

<errores_que_resuelve>
1. El staff no tiene la información del menú ni fotos de platos y productos.
2. Server, busser y runner no saben exactamente sus tareas de apertura y cierre.
3. Bartender y barback no ven ni documentan el inventario.
4. Horarios e información de eventos dispersos.
5. Reglas y errores sin registro.
6. La información no llega a todos: falta mensaje grupal.
7. El manager no deja información formal del cierre.
</errores_que_resuelve>

<modulos priority="en este orden">
P1 — MVP:
1. Menú con fotos (ES/EN): plato y trago con foto, descripción, ingredientes, alérgenos.
2. Tareas de apertura y cierre por rol, como checklist con evidencia opcional (foto).
3. Mensaje grupal y avisos: a todo el local, a un rol o a los 4 restaurantes, con confirmación de lectura.
4. Cierre del manager: formulario obligatorio con ventas del día, incidentes, faltantes de inventario, estado de limpieza y notas para el turno siguiente.

P2:
5. Sistema de warnings y rendimiento (detalle abajo).
6. Inventario de barra con foto, cargado por bartender y barback en cada turno.

P3:
7. Horario y calendario de eventos (básico propio o integración con 7shifts si el cliente ya lo usa).
8. Reglas de la casa (alimentan el sistema de warnings).
9. Rutinas fijas (ej. lunes de limpieza) y notas del día de manager y capitán.

v1.1 (mapa del dueño): pedidos rápidos del salón (agua, levantar mesa, ayuda, "lo tomo") con escalado; aprobación de anulaciones e invitaciones por el manager, cruzada con el cierre; sectores por turno; notas por mesa con tablero de alérgenos en cocina; niveles A, B, C; tareas semanales en el piloto; salarios y ajustes con aprobación ON de manager o capitán, sin descuentos (etapa 3).
</modulos>

<sistema_de_warnings>
Objetivo: medir el rendimiento profesional de todo el equipo de forma justa.
Flujo:
1. El manager carga reglas por rol (ej. "confirmar alérgenos con cocina").
2. Manager o capitán registra el error: empleado, regla incumplida, gravedad (leve / grave), nota o foto. Menos de 30 segundos.
3. El empleado lo recibe en su app y en su idioma, con la regla y cómo hacerlo bien.
4. El empleado confirma lectura y puede dejar descargo.
5. El sistema cuenta y actualiza el estado.

Estados (ventana móvil de 30 días; umbrales configurables por compañía):
| Estado | Criterio inicial | Acción |
|---|---|---|
| Al día | 0 warnings | Ninguna |
| Atención | 1–2 leves | Recordatorio de la regla |
| Seguimiento | 3 leves o 1 grave | Charla con el manager |
| Revisión | 2 graves o más | Revisión con gerencia o dueño |

Tablero: por persona (warnings, reglas que más falla, tareas a tiempo), por rol y por local (reglas que más fallan), y reconocimiento (más turnos sin warnings).
Reglas de uso justo: no hay warning sin regla; el empleado ve siempre los suyos; vencen a los 30 días; auditoría de quién cargó qué. Marcar en el blueprint que el uso para sanciones o despidos requiere revisión de un abogado laboral de NY.
</sistema_de_warnings>

<mercado>
Competencia relevada en octubre 2026 (precios públicos de terceros, a reconfirmar):
| App | Fuerte | Entrada USD/mes | Hueco |
|---|---|---|---|
| 7shifts | Horarios, fichaje, mensajes | Gratis ≤15; 39,99 / 79,99 / 134,99 | Tareas y log del manager como add-on; sin menú con fotos ni inventario |
| Connecteam | Checklists, chat, capacitación | Desde 29 | Generalista, sin inventario de barra |
| Jolt | Checklists, etiquetas, temperaturas | Desde 89,99 | Quejas de fallas y soporte |
| WISK.ai | Inventario bar/cocina | Desde CA$29 | Solo inventario |
| Typsy | Cursos de hospitality | 20 / 75 | Capacitación genérica |
| Harri | Contratación y onboarding | A cotizar | Críticas a soporte y app móvil |

Posicionamiento: "7shifts organiza cuándo trabaja la gente; The First organiza qué hace y cómo lo hace." No competir en horarios.
Mercado: ~153.100 empleados en restaurantes de servicio completo en NYC (FRED/BLS, agosto 2026).
Precio sugerido (supuesto para negociar): implementación con pago único + licencia de USD 199–299 por local/mes (USD 800–1.200 los 4), anclado en que las apps sueltas cuestan ~USD 205 por local/mes.
Próximo hito comercial: piloto de 2 semanas en 1 restaurante, luego los 4.
</mercado>

<branding>
- Blanco: color principal (fondos, superficies). Proponé un blanco cálido apenas roto si mejora la lectura; justificalo.
- Negro: color secundario (texto, navegación, contraste).
- Verde martini: color de marca (el león, botón principal, estados activos): #4A6B3E, 6,1:1 con texto blanco; escala de tonos en docs/brand/tokens.css.
- Colores semánticos aparte para warnings (atención, seguimiento, revisión): no usar el verde martini como "OK" para no mezclar marca con estado.
- Tono: corporativo, sobrio, de lujo silencioso. Sin emojis, sin degradados chillones.
- Tipografía: Figtree para toda la interfaz (ejecutiva, legible de 12 a 65 años, no snob) e IBM Plex Mono para cifras.
- Logo: un león de perfil, una sola masa en verde martini #4A6B3E con tres curvas concéntricas en la melena, más el wordmark THE FIRST. Estética ejecutiva de hospitalidad, sin nada de vida nocturna.
- El branding es del producto, no de TCM: la firma de TCM va oculta, como indique la skill de brand kit.
</branding>
</contexto_del_producto>

<tareas orden="secuencial, no saltear">
1. Leé completo [BLUEPRINT_EXISTENTE]. Armá una tabla de mapeo: cada módulo, entidad y decisión del blueprint existente frente a este prompt, con estado Mantener / Adaptar / Reemplazar / Agregar.
   - Ante conflicto, manda este prompt en producto y marca; manda el blueprint existente en stack, convenciones de código y decisiones de infraestructura ya tomadas, salvo que contradigan un requisito de este prompt. Registrá cada conflicto como ADR.
2. Ejecutá /brandkit con el branding de arriba y el nombre de la app: logo, paleta con tokens, tipografía, componentes clave de la app (botón, tarjeta de tarea, tarjeta de plato con foto, chip de estado de warning) y kit para presentarle al dueño.
3. Ejecutá /blueprint-fullstack-premium tomando como entrada: este prompt + el mapeo del paso 1 + los tokens del paso 2. Debe cubrir como mínimo:
   - Requisitos medibles por módulo, en el orden P1 → P2 → P3.
   - Modelo de datos multi-tenant: Compañía → Local → Usuario (rol) → Menú, Tarea, Checklist, Mensaje, Regla, Warning, Inventario, Cierre.
   - Matriz de permisos por rol (tabla de roles_y_vistas) aplicada en el servidor.
   - i18n ES/EN desde el día uno.
   - Flujogramas: apertura y cierre de turno, registro y envío de warning, cierre del manager.
   - Notificaciones push para mensajes y warnings.
   - Seguridad: autenticación por usuario, aislamiento de datos entre locales, auditoría de warnings.
   - Plan Scrum con el MVP P1 listo para el piloto de 2 semanas.
   - Paquete comercial con el precio sugerido.
4. Integrá todo en una sola carpeta coherente y entregala como un único .zip listo para un proyecto de Claude Code, con AGENTS.md, CLAUDE.md y BITACORA.md actualizados que registren la fusión.
</tareas>

<restricciones>
- No inventes datos de mercado ni del cliente. Lo que falte va como supuesto etiquetado o pregunta abierta en BITACORA.md.
- No quites nada del blueprint existente sin dejarlo en la tabla de mapeo con su motivo.
- Si un slot sigue vacío al empezar, preguntá una sola vez por todos juntos; si no hay respuesta, asumí, declaralo y seguí.
- Todo texto de UI en ES y EN.
</restricciones>

<formato_de_entrega>
En el chat, al terminar: (1) tabla de mapeo resumida, (2) conflictos resueltos y cómo, (3) supuestos tomados, (4) el .zip. Nada de recapitular el contenido del .zip.
</formato_de_entrega>

=====

## Slots
- `[BLUEPRINT_EXISTENTE]` — adjuntar los archivos del blueprint de OSCURA NYC.
