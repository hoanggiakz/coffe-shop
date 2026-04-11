declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function expect(value: unknown): { toBe(expected: unknown): void };

describe('api-gateway smoke', () => {
  it('loads test runtime', () => {
    expect(true).toBe(true);
  });
});
