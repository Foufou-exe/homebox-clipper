import { isVersion } from './version';

/** Project addresses opened by the "Support" and "GitHub" links. Single source: no parameter, no fragment. */
export const PROJECT_LINKS = {
  support: 'https://github.com/Foufou-exe/homebox-clipper/issues',
  github: 'https://github.com/Foufou-exe/homebox-clipper',
} as const;

/**
 * Release notes of a version (013, FR-013), opened by the browser on click only. `null` if the value is not a
 * version: nothing else can enter the address.
 */
export function releaseNotesUrl(version: string): string | null {
  return isVersion(version) ? `https://github.com/Foufou-exe/homebox-clipper/releases/tag/v${version}` : null;
}
