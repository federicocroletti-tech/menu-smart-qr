import { deslugify, slugify } from './slug.util';

describe('slug util', () => {
  it('slugify should normalize and trim', () => {
    expect(slugify('  Pizza Napoletana  ')).toBe('pizza-napoletana');
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });

  it('deslugify should restore spaces', () => {
    expect(deslugify('pizze-speciali')).toBe('pizze speciali');
  });
});
