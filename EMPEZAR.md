# Cómo arrancar — The First Hospitality Group

Sistema operativo para el staff de los 4 restaurantes de The First Hospitality Group en Nueva York, construido de cero sobre la base técnica de OSCURA NYC.

## Estrategia (cómo se armó y cómo se sigue)

- **Formato:** un meta-prompt en XML (`docs/prompt/PROMPT-MAESTRO.md`), que es el formato que mejor sigue Claude, con tareas en orden fijo:
   1. Leer el blueprint existente (OSCURA) y armar una tabla de mapeo: qué se mantiene, qué se adapta, qué se reemplaza y qué se agrega → `docs/MIGRATION-FROM-OSCURA.md`.
   2. Correr /brandkit → `docs/brand/`.
   3. Correr /blueprint-fullstack-premium usando lo anterior como entrada → `docs/BLUEPRINT.md`, ADRs, reglas de agentes, CI, runbook.
   4. Entregar un único .zip (este).
- **Conflictos:** en producto y marca manda el blueprint nuevo. En stack, convenciones de código e infraestructura manda el blueprint existente de OSCURA. Cada conflicto queda registrado como decisión de arquitectura (ADR) — ver ADR 0001.
- **Branding:** blanco como principal, negro como secundario y verde aceituna `#5C6B2F` como color de marca, con chequeo de contraste. Los colores de los warnings van aparte, para no confundir el color de marca con un estado. Logo: monograma TFHG.

## Qué hay en el paquete

| Ruta | Qué es |
|---|---|
| `docs/BLUEPRINT.md` | Fuente de verdad: concepto, roles, flujos, contratos, datos, devops, seguridad, calidad, sprints |
| `docs/adr/` | 17 decisiones de arquitectura |
| `docs/MIGRATION-FROM-OSCURA.md` | Qué se toma de OSCURA y qué no |
| `docs/brand/` | Marca completa: logos TFHG en SVG, íconos de app, favicon, tokens, guía y lámina |
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

## Antes del primer arranque, validá lo marcado `(to be validated)`

- Nombre del producto: "The First" (la app) dentro de The First Hospitality Group.
- Nombres de los 4 restaurantes, sus servicios (almuerzo, cena, late) y horarios.
- Cuántas cuentas de dueño (propuesta: hasta 3).
- Umbrales de warnings (propuesta: 30 días; Atención 1–2 leves, Seguimiento 3 leves o 1 grave, Revisión 2+ graves).
- Campos del cierre del manager y si van a tipear las cifras del POS (v1) o integrarlo más adelante.
- Reglas de la casa por rol (hay un set de ejemplo).
- Si siguen usando 7shifts para horarios.
- Dominio (propuesta `app.thefirsthg.com`) y plan de backups.
- Qué significan los niveles A, B y C: etapa de formación (C en formación, B formado, A líder) o nivel de inglés.
- Si el capitán puede aprobar invitaciones (comps) además del manager, y la lista de motivos de anulación e invitación.
- Sectores y mesas de cada restaurante.
- Quién ve los salarios (propuesta: solo el dueño y la propia persona) y quién aprueba cada ajuste.
- Revisión de un abogado laboral de NY sobre warnings, ajustes de sueldo (en NY no se pueden descontar multas del sueldo) y retención de registros.
- Precio de la propuesta comercial.
