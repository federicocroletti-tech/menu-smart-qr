export function slugify(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

export function deslugify(value: string): string {
  return value
    .trim()
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ');
}
