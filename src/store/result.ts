import type { Result, StoreError } from './types';

export interface Failure {
  ok: false;
  error: StoreError;
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(code: string, message: string, field?: string): Failure {
  const error: StoreError = field === undefined ? { code, message } : { code, message, field };
  return { ok: false, error };
}

export function notFound(what: string, field?: string): Failure {
  return fail('not-found', `No ${what} with that id.`, field);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function cloneResult<T>(result: Result<T>): Result<T> {
  return result.ok ? { ok: true, value: clone(result.value) } : result;
}
