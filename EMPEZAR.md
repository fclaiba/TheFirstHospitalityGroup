# Cómo arrancar — The First Hospitality Group

Sistema operativo para el staff de los 4 restaurantes de The First Hospitality Group en Nueva York, construido de cero sobre la base técnica de OSCURA NYC. Versión 1.3: estética ejecutiva de hospitalidad (verde martini y el león), toda la organización por áreas desde polisher hasta director de operaciones, cadena de supervisión sin trato de par a par, y estados en vez de números.

## Estrategia (cómo se armó y cómo se sigue)

- **Formato:** un meta-prompt en XML (`docs/prompt/PROMPT-MAESTRO.md`), que es el formato que mejor sigue Claude, con tareas en orden fijo:
   1. Leer el blueprint existente (OSCURA) y armar una tabla de mapeo: qué se mantiene, qué se adapta, qué se reemplaza y qué se agrega → `docs/MIGRATION-FROM-OSCURA.md`.
   2. Correr /brandkit → `docs/brand/`.
   3. Correr /blueprint-fullstack-premium usando lo anterior como entrada → `docs/BLUEPRINT.md`, ADRs, reglas de agentes, CI, runbook.
   4. Entregar un único .zip (este).
- **Conflictos:** en producto y marca manda el blueprint nuevo. En stack, convenciones de código e infraestructura manda el blueprint existente de OSCURA. Cada conflicto queda registrado como decisión de arquitectura (ADR) — ver ADR 0001.
- **Branding:** blanco como principal, negro como secundario y **verde martini** `#4A6B3E` como color de marca, con chequeo de contraste. Los colores de los warnings van aparte, para no confundir el color de marca con un estado. Logo: **un león de perfil**. Estética ejecutiva de hospitalidad, clara, sin nada de vida nocturna.

## Qué hay en el paquete

| Ruta | Qué es |
|---|---|
| `docs/BLUEPRINT.md` | Fuente de verdad: concepto, roles, flujos, contratos, datos, devops, seguridad, calidad, sprints |
| `docs/adr/` | 27 decisiones de arquitectura; el estado de cada una en `docs/adr/README.md` |
| `docs/PREGUNTAS-DUENO.md` | Banco de 126 preguntas para el dueño; las 8 primeras bloquean |
| `docs/research/JERARQUIA-ROLES-NY.md` | Investigación de puestos, escalera, horarios y propinas en NY |
| `docs/MIGRATION-FROM-OSCURA.md` | Qué se toma de OSCURA y qué no |
| `docs/brand/` | Marca completa: el león en SVG, logos, íconos de app, favicon, tokens, guía y lámina |
| `prototype/index.html` | Prototipo navegable (staff, manager y dueño) para mostrarle al dueño, funciona sin internet |
| `docs/PROPUESTA-COMERCIAL.md` | Propuesta para el dueño |
| `docs/research/ESTUDIO-DE-MERCADO.md` | Competencia, FODA y Pareto |
| `docs/prompt/PROMPT-MAESTRO.md` | El prompt que ordena todo, por si se rehace en otra sesión |
| `AGENTS.md` / `CLAUDE.md` | Reglas obligatorias para cualquier agente |
| `.github/workflows/ci.yml`, `.env.example`, `docs/runbooks/` | Kit de devops |

## Arranque

1. Descomprimí este .zip en una carpeta nueva, que va a ser el repo `the-first`.
2. Copiá `.env.example` a `.env.local` y completá los valores reales (nunca los commitees).
3. Tené a mano el repo de OSCURA NYC solo como referencia para copiar módulos (nunca se forkea).
4. Abrí una terminal en la carpeta y ejecutá `claude`.
5. Pegá este prompt:

```
Read CLAUDE.md, docs/BLUEPRINT.md, docs/DEVLOG.md, docs/MIGRATION-FROM-OSCURA.md and docs/adr/ in full. Start Sprint 0 of the development plan from the "Pending / next steps" of the latest devlog entry. The OSCURA NYC repo at <PATH_TO_OSCURA> is a reference only: port its platform modules with their tests as the migration table says, never its product code, secrets or brand. Work by tracks (front, back, devops) following every rule in CLAUDE.md, run the quality gates before closing, ask me only what cannot be invented, and close the session with a new devlog entry.
```

Cada vez que vuelvas, alcanza con escribir "seguí".

## Antes del primer arranque

Respondé con el dueño las 8 preguntas que bloquean y las decisiones de la v1.2, al principio de `docs/PREGUNTAS-DUENO.md`. Lo más importante:

- Los puestos definitivos de cada área (incluida cocina) y si los 4 locales usan los mismos.
- Qué hace el director de operaciones y quién aprueba los ascensos.
- Secciones, mesas y asientos de cada local.
- Qué usan hoy de 7shifts, idealmente con una semana real exportada.
- Qué es un evento y qué tipos de warning existen.
- Si quieren guardar los puntos de propinas o nada de números.
- Qué servicios abre cada local y en qué días.
- Confirmar que "no números" significa nada de plata, y que A, B, C no eran niveles.
- Revisión de un abogado laboral de NY sobre warnings, horarios, tareas sin propina y propinas.
- Precio de la propuesta comercial.
