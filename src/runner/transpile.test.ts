import { describe, expect, it } from 'vitest';

import { transpile } from './transpile';

describe('transpile', () => {
  it('strips type annotations', () => {
    const result = transpile('const n: number = 1; export const double = (x: number): number => x * 2;');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).not.toContain(': number');
  });

  it('converts esm exports to commonjs so the harness can capture them', () => {
    const result = transpile('export function solve() { return 42; }');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('exports');
  });

  it('accepts code with no exports at all', () => {
    const result = transpile('document.title = "hi";');
    expect(result.ok).toBe(true);
  });

  it('strips interfaces and type-only imports', () => {
    const result = transpile('interface A { x: number }\nconst a: A = { x: 1 };\nconsole.log(a);');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).not.toContain('interface A');
  });

  it('returns a failure with a message on a syntax error instead of throwing', () => {
    const result = transpile('const = = =;');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
  });
});
