/**
 * Shared safety helpers: path containment validation, SQL LIKE escaping,
 * per-key async mutex.
 */
import { resolve, sep, isAbsolute } from "node:path";

/**
 * Throws if `name` resolves outside `base`. Rejects absolute paths, ".."
 * traversal, and null bytes. Returns the resolved absolute path on success.
 */
export function assertPathInside(base: string, name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("Invalid path: empty");
  }
  if (name.includes("\0")) {
    throw new Error("Invalid path: null byte");
  }
  if (isAbsolute(name)) {
    throw new Error("Invalid path: absolute paths are not allowed");
  }
  const baseResolved = resolve(base);
  const target = resolve(baseResolved, name);
  if (target !== baseResolved && !target.startsWith(baseResolved + sep)) {
    throw new Error("Invalid path: escapes base directory");
  }
  return target;
}

/** Escape SQL LIKE metacharacters (%, _, \). Use with `ESCAPE '\'`. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

/**
 * Per-key serial async mutex. All callers with the same key run one at a time.
 */
const _locks = new Map<string, Promise<unknown>>();
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  _locks.set(key, next.catch(() => {}));
  return next;
}
