import { amazonFrExtractor } from './amazon-fr/extractor';

/** Registre des extracteurs marchands. Tout ajout doit aussi figurer dans MERCHANTS.md. */
export const MERCHANTS = [amazonFrExtractor] as const;
