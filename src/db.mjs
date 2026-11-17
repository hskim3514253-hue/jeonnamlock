export function database(env) {
  if (!env.DB?.prepare) throw new Error('DATABASE_UNAVAILABLE');
  return {
    one: (sql, ...args) => env.DB.prepare(sql).bind(...args).first(),
    all: async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results,
    run: (sql, ...args) => env.DB.prepare(sql).bind(...args).run(),
    batch: statements => env.DB.batch(statements.map(([sql, ...args]) => env.DB.prepare(sql).bind(...args)))
  };
}
