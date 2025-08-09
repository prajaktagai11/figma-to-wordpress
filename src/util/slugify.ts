export default function slugify (s: string): string {
  return s.toLowerCase()
    .replace(/page:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}