import type { CslItem } from "./csl";

/**
 * Contract for external or offline citation source providers.
 */
export interface CitationProvider {
  readonly id: string;
  readonly label: string;
  available(): Promise<boolean>;
  search?(query: string): Promise<CslItem[]>;
  pick?(): Promise<CslItem[]>;
}
