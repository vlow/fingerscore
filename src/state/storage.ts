type Area = 'local' | 'session';

function area(a: Area): Storage {
  return a === 'local' ? window.localStorage : window.sessionStorage;
}

/** Returns null when the key is missing, the JSON is corrupt or storage is blocked. */
export function readJSON<T>(a: Area, key: string): T | null {
  try {
    const raw = area(a).getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

/** Returns false when storage is blocked or full. */
export function writeJSON(a: Area, key: string, value: unknown): boolean {
  try {
    area(a).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** A value stored as it is, without JSON. Returns null when the key is missing or storage is blocked. */
export function readText(a: Area, key: string): string | null {
  try {
    return area(a).getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when storage is blocked or full. */
export function writeText(a: Area, key: string, value: string): boolean {
  try {
    area(a).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(a: Area, key: string): void {
  try {
    area(a).removeItem(key);
  } catch {
    // storage blocked: nothing to remove
  }
}

/** True when a value can be written and removed; false when storage is blocked. Never throws. */
export function probe(a: Area, key: string): boolean {
  try {
    const s = area(a);
    s.setItem(key, '1');
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
