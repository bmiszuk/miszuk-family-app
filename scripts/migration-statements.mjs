// Keep our trigger bodies intact when preparing migrations for local D1.
export function migrationStatements(sql) {
  const source = sql.replace(/--[^\n]*/g, '').trim();
  return [...source.matchAll(/\s*(CREATE TRIGGER\b[\s\S]*?\nEND|[^;]+);/g)].map(match => match[1].trim());
}
