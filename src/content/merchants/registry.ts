import { amazonFrExtractor } from './amazon-fr/extractor';

/** Registry of merchant extractors. Any addition must also appear in MERCHANTS.md. */
export const MERCHANTS = [amazonFrExtractor] as const;
