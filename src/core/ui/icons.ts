// Neon line icons, one per cabinet. 64×64 viewBox, stroked with currentColor so CSS sets the glow color.
const svg = (body: string) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  invaders: svg(
    '<path d="M20 14l6 8M44 14l-6 8"/><rect x="14" y="22" width="36" height="22" rx="4"/>' +
      '<circle cx="25" cy="32" r="3"/><circle cx="39" cy="32" r="3"/><path d="M14 36H6v10M50 36h8v10M22 44l-4 8M42 44l4 8M28 44v6M36 44v6"/>',
  ),
  phish: svg(
    '<rect x="6" y="16" width="38" height="28" rx="3"/><path d="M6 18l19 14 19-14"/>' +
      '<path d="M52 6v26a8 8 0 1 1-8-8"/><path d="M44 24l-3 5"/>',
  ),
  runner: svg(
    '<path d="M32 6L6 58M32 6l26 52M32 6v52"/><path d="M14 44h36M20 32h24"/>' +
      '<rect x="27" y="40" width="10" height="10" rx="2" fill="currentColor"/>',
  ),
  password: svg(
    '<rect x="12" y="28" width="40" height="28" rx="4"/><path d="M20 28v-8a12 12 0 0 1 24 0v8"/>' +
      '<circle cx="32" cy="40" r="4"/><path d="M32 44v6"/>',
  ),
  defense: svg(
    '<path d="M32 6l22 8v16c0 14-10 24-22 28C20 54 10 44 10 30V14z"/>' +
      '<path d="M10 24h44M10 36h44M24 14v10M40 14v10M32 24v12M22 36v12M42 36v10"/>',
  ),
  port: svg(
    '<rect x="8" y="10" width="48" height="16" rx="3"/><rect x="8" y="38" width="48" height="16" rx="3"/>' +
      '<circle cx="18" cy="18" r="2"/><circle cx="18" cy="46" r="2"/><path d="M28 18h20M28 46h20M32 26v12"/>',
  ),
  bughunt: svg(
    '<ellipse cx="32" cy="36" rx="12" ry="16"/><path d="M32 20v32M24 14l4 6M40 14l-4 6"/>' +
      '<path d="M20 30H8M20 40H8M20 48l-10 6M44 30h12M44 40h12M44 48l10 6"/>',
  ),
  classic: svg(
    '<rect x="8" y="30" width="48" height="24" rx="6"/><path d="M32 30V14"/><circle cx="32" cy="10" r="5"/>' +
      '<circle cx="44" cy="40" r="3"/><circle cx="50" cy="46" r="3"/><path d="M16 42h12M22 36v12"/>',
  ),
  selftest: svg(
    '<circle cx="32" cy="32" r="10"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M13 51l6-6M45 19l6-6"/>',
  ),
};
