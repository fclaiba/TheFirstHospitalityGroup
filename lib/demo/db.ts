// In-memory Convex database for preview mode (ADR 0010, ADR 0028). Implements the part of `ctx.db` the backend uses
// (get, insert, patch, replace, delete, normalizeId, query with indexes, filters, order, take, first, unique, collect,
// paginate) over plain arrays, with the index fields read from convex/schema.ts. Pure: no React, no storage.

export type Doc = { _id: string; _creationTime: number; [k: string]: unknown };
export type Tables = Record<string, Doc[]>;

type IndexDef = { name: string; fields: string[] };
export type IndexMap = Record<string, IndexDef[]>;

/** Index fields per table, from a Convex SchemaDefinition. */
export function indexesFromSchema(schema: unknown): IndexMap {
  const out: IndexMap = {};
  const tables = (schema as { tables: Record<string, { indexes?: Array<{ indexDescriptor: string; fields: string[] }> }> }).tables;
  for (const [name, def] of Object.entries(tables)) {
    out[name] = (def.indexes ?? []).map((i) => ({ name: i.indexDescriptor, fields: i.fields }));
  }
  return out;
}

// Convex ordering of values: undefined < null < number < boolean < string < arrays/objects (enough for indexes).
function rank(v: unknown): number {
  if (v === undefined) return 0;
  if (v === null) return 1;
  if (typeof v === "bigint" || typeof v === "number") return 2;
  if (typeof v === "boolean") return 3;
  if (typeof v === "string") return 4;
  return 5;
}

export function compare(a: unknown, b: unknown): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
}

const get = (doc: Doc, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), doc);

type Cond = { field: string; op: "eq" | "gt" | "gte" | "lt" | "lte"; value: unknown };

class RangeBuilder {
  conds: Cond[] = [];
  eq(field: string, value: unknown) {
    this.conds.push({ field, op: "eq", value });
    return this;
  }
  gt(field: string, value: unknown) {
    this.conds.push({ field, op: "gt", value });
    return this;
  }
  gte(field: string, value: unknown) {
    this.conds.push({ field, op: "gte", value });
    return this;
  }
  lt(field: string, value: unknown) {
    this.conds.push({ field, op: "lt", value });
    return this;
  }
  lte(field: string, value: unknown) {
    this.conds.push({ field, op: "lte", value });
    return this;
  }
}

function test(c: Cond, doc: Doc): boolean {
  const d = compare(get(doc, c.field), c.value);
  switch (c.op) {
    case "eq":
      return d === 0;
    case "gt":
      return d > 0;
    case "gte":
      return d >= 0;
    case "lt":
      return d < 0;
    case "lte":
      return d <= 0;
  }
}

// filter() expression builder: q.eq(q.field("x"), 1), q.and(...), q.or(...), q.not(...).
type Expr = (doc: Doc) => unknown;
const val = (x: unknown): Expr => (typeof x === "function" ? (x as Expr) : () => x);
const filterBuilder = {
  field: (name: string): Expr => (doc) => get(doc, name),
  eq: (a: unknown, b: unknown): Expr => (d) => compare(val(a)(d), val(b)(d)) === 0,
  neq: (a: unknown, b: unknown): Expr => (d) => compare(val(a)(d), val(b)(d)) !== 0,
  lt: (a: unknown, b: unknown): Expr => (d) => compare(val(a)(d), val(b)(d)) < 0,
  lte: (a: unknown, b: unknown): Expr => (d) => compare(val(a)(d), val(b)(d)) <= 0,
  gt: (a: unknown, b: unknown): Expr => (d) => compare(val(a)(d), val(b)(d)) > 0,
  gte: (a: unknown, b: unknown): Expr => (d) => compare(val(a)(d), val(b)(d)) >= 0,
  and: (...xs: unknown[]): Expr => (d) => xs.every((x) => !!val(x)(d)),
  or: (...xs: unknown[]): Expr => (d) => xs.some((x) => !!val(x)(d)),
  not: (x: unknown): Expr => (d) => !val(x)(d),
};

class Query {
  private index: IndexDef | null = null;
  private range: Cond[] = [];
  private filters: Expr[] = [];
  private desc = false;
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  withIndex(name: string, fn?: (q: RangeBuilder) => RangeBuilder) {
    const def = name === "by_creation_time" ? { name, fields: [] } : name === "by_id" ? { name, fields: ["_id"] } : this.db.indexes[this.table]?.find((i) => i.name === name);
    if (!def) throw new Error(`Index ${this.table}.${name} not found`);
    this.index = def;
    this.range = fn ? fn(new RangeBuilder()).conds : [];
    return this;
  }
  filter(fn: (q: typeof filterBuilder) => Expr) {
    this.filters.push(fn(filterBuilder));
    return this;
  }
  order(o: "asc" | "desc") {
    this.desc = o === "desc";
    return this;
  }
  private rows(): Doc[] {
    let rows = this.db.tables[this.table] ?? [];
    rows = rows.filter((d) => this.range.every((c) => test(c, d)) && this.filters.every((f) => !!f(d)));
    const fields = [...(this.index?.fields ?? []), "_creationTime"];
    rows = [...rows].sort((a, b) => {
      for (const f of fields) {
        const c = compare(get(a, f), get(b, f));
        if (c) return c;
      }
      return compare(a._id, b._id);
    });
    if (this.desc) rows.reverse();
    return rows.map((d) => structuredClone(d));
  }
  async collect() {
    return this.rows();
  }
  async take(n: number) {
    return this.rows().slice(0, n);
  }
  async first() {
    return this.rows()[0] ?? null;
  }
  async unique() {
    const r = this.rows();
    if (r.length > 1) throw new Error(`unique() found ${r.length} documents in ${this.table}`);
    return r[0] ?? null;
  }
  async paginate(opts: { numItems: number; cursor: string | null }) {
    const all = this.rows();
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const page = all.slice(start, start + opts.numItems);
    const end = start + page.length;
    return { page, isDone: end >= all.length, continueCursor: String(end) };
  }
  async *[Symbol.asyncIterator]() {
    for (const d of this.rows()) yield d;
  }
}

export class FakeDb {
  constructor(
    public tables: Tables,
    public indexes: IndexMap,
    private nextId: () => string,
  ) {}

  private tableOf(id: string): string | null {
    const i = id.indexOf("|");
    return i > 0 ? id.slice(0, i) : null;
  }

  normalizeId(table: string, id: string): string | null {
    return typeof id === "string" && this.tableOf(id) === table && (this.tables[table] ?? []).some((d) => d._id === id) ? id : null;
  }

  async get(id: string) {
    const table = this.tableOf(String(id));
    if (!table) return null;
    const doc = (this.tables[table] ?? []).find((d) => d._id === id);
    return doc ? structuredClone(doc) : null;
  }

  query(table: string) {
    return new Query(this, table);
  }

  async insert(table: string, value: Record<string, unknown>) {
    const _id = `${table}|${this.nextId()}`;
    const doc = { ...strip(value), _id, _creationTime: Date.now() + Math.random() / 1000 } as Doc;
    (this.tables[table] ??= []).push(doc);
    return _id;
  }

  async patch(id: string, value: Record<string, unknown>) {
    const doc = this.find(id);
    for (const [k, v] of Object.entries(value)) {
      if (k === "_id" || k === "_creationTime") continue;
      if (v === undefined) delete doc[k];
      else doc[k] = structuredClone(v);
    }
  }

  async replace(id: string, value: Record<string, unknown>) {
    const doc = this.find(id);
    for (const k of Object.keys(doc)) if (k !== "_id" && k !== "_creationTime") delete doc[k];
    Object.assign(doc, strip(value));
  }

  async delete(id: string) {
    const table = this.tableOf(id)!;
    this.tables[table] = (this.tables[table] ?? []).filter((d) => d._id !== id);
  }

  /** `ctx.db.system` for file metadata. */
  get system() {
    return { get: (id: string) => this.get(id), query: (t: string) => this.query(t) };
  }

  private find(id: string): Doc {
    const table = this.tableOf(id);
    const doc = table ? (this.tables[table] ?? []).find((d) => d._id === id) : undefined;
    if (!doc) throw new Error(`Document ${id} not found`);
    return doc;
  }
}

function strip(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = structuredClone(v);
  return out;
}
