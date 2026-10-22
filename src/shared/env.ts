/**
 * HTTP est accepté pour l'instance HomeBox uniquement dans les builds `development`
 * (`bun run dev`) et `homelab` (`bun run build:homelab`). Le build de production exige HTTPS
 * (hors localhost) — constitution, principe V.
 */
export const ALLOW_HTTP = import.meta.env.DEV || import.meta.env.MODE === 'homelab';
