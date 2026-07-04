const NAME_PARTICLES = new Set(['de', 'da', 'do', 'del', 'van', 'von']);

export function shortPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) return parts[0] ?? '';

  const previous = parts[parts.length - 2].toLowerCase();
  if (parts.length >= 3 && NAME_PARTICLES.has(previous)) {
    return parts.slice(-2).join(' ');
  }

  return parts[parts.length - 1];
}
