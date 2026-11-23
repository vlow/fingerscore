/** `table[key]` when the table itself holds the key, else undefined: text from a file never reaches a property every object inherits (`constructor`, `toString`, `__proto__`). */
export function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}
