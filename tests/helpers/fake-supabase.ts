import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal in-memory stand-in for the Supabase JS query builder, covering
 * the chains the admin libs use (select / insert / update / delete with
 * eq / is / in / lt / or filters, order, limit, single / maybeSingle).
 * Rows are plain objects in per-table arrays; mutations act on the same
 * arrays, so tests can assert the final table state.
 */

export type FakeRow = Record<string, unknown>;

export type FakeTable = {
  rows: FakeRow[];
  /** Return true for a row to make an insert containing it fail atomically. */
  failInsertIf?: (row: FakeRow) => boolean;
};

type Filter = (row: FakeRow) => boolean;

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private insertRows: FakeRow[] = [];
  private patch: FakeRow = {};
  private returning = false;
  private shape: "many" | "single" | "maybe" = "many";

  constructor(private readonly table: FakeTable) {}

  select(): this {
    if (this.op !== "select") {
      this.returning = true;
    }
    return this;
  }

  insert(rows: FakeRow | FakeRow[]): this {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: FakeRow): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => compareValues(row[column], value) < 0);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push((row) => compareValues(row[column], value) <= 0);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push((row) => compareValues(row[column], value) > 0);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => compareValues(row[column], value) >= 0);
    return this;
  }

  or(expression: string): this {
    const parts = expression.split(",").map((part) => {
      const match = /^([a-z_]+)\.ilike\.%(.*)%$/.exec(part.trim());
      if (!match) {
        throw new Error(`fake-supabase: unsupported or() part: ${part}`);
      }
      const [, column, term] = match;
      return (row: FakeRow) =>
        String(row[column] ?? "")
          .toLowerCase()
          .includes(term.toLowerCase());
    });
    this.filters.push((row) => parts.some((part) => part(row)));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.shape = "single";
    return this;
  }

  maybeSingle(): this {
    this.shape = "maybe";
    return this;
  }

  private matches(row: FakeRow): boolean {
    return this.filters.every((filter) => filter(row));
  }

  private applyOrders(rows: FakeRow[]): FakeRow[] {
    const sorted = [...rows];
    for (const { column, ascending } of [...this.orders].reverse()) {
      sorted.sort((a, b) => compareValues(a[column], b[column]) * (ascending ? 1 : -1));
    }
    return sorted;
  }

  private execute(): { data: unknown; error: { message: string; code?: string } | null } {
    const matched = this.table.rows.filter((row) => this.matches(row));
    let resultRows: FakeRow[] | null = null;

    if (this.op === "select") {
      let rows = this.applyOrders(matched);
      if (this.limitCount !== null) {
        rows = rows.slice(0, this.limitCount);
      }
      resultRows = rows.map((row) => ({ ...row }));
    } else if (this.op === "insert") {
      if (this.table.failInsertIf && this.insertRows.some((row) => this.table.failInsertIf!(row))) {
        return {
          data: null,
          error: { message: "insert rejected by fake table constraint", code: "23503" }
        };
      }
      const inserted = this.insertRows.map((row) => ({ ...row }));
      this.table.rows.push(...inserted);
      resultRows = this.returning ? inserted.map((row) => ({ ...row })) : null;
    } else if (this.op === "update") {
      for (const row of matched) {
        Object.assign(row, this.patch);
      }
      resultRows = this.returning ? matched.map((row) => ({ ...row })) : null;
    } else if (this.op === "delete") {
      const removed = matched;
      this.table.rows = this.table.rows.filter((row) => !removed.includes(row));
      resultRows = this.returning ? removed.map((row) => ({ ...row })) : null;
    }

    if (this.shape === "single") {
      if (!resultRows || resultRows.length !== 1) {
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116"
          }
        };
      }
      return { data: resultRows[0], error: null };
    }

    if (this.shape === "maybe") {
      if (!resultRows || resultRows.length === 0) {
        return { data: null, error: null };
      }
      if (resultRows.length > 1) {
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            code: "PGRST116"
          }
        };
      }
      return { data: resultRows[0], error: null };
    }

    return { data: resultRows, error: null };
  }

  then<TResult1, TResult2>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onFulfilled, onRejected);
  }
}

export function createFakeSupabase(tables: Record<string, FakeTable>): {
  client: SupabaseClient;
  tables: Record<string, FakeTable>;
} {
  const client = {
    from(table: string) {
      const fakeTable = tables[table];
      if (!fakeTable) {
        throw new Error(`fake-supabase: no table registered for "${table}"`);
      }
      return new FakeQuery(fakeTable);
    }
  };
  return { client: client as unknown as SupabaseClient, tables };
}
