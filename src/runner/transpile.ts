import { transform } from 'sucrase';

export type TranspileResult = { ok: true; code: string } | { ok: false; message: string };

/**
 * Strips TypeScript types and lowers ESM syntax to CommonJS.
 *
 * Deliberately does not typecheck: Monaco's own TypeScript worker surfaces type errors
 * inline while editing, and a type error should warn the learner rather than block a run.
 */
export function transpile(source: string): TranspileResult {
  try {
    const { code } = transform(source, {
      transforms: ['typescript', 'imports'],
      preserveDynamicImport: true,
    });
    return { ok: true, code };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
