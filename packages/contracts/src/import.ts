import { oc } from '@orpc/contract';
import { z } from 'zod';

/*
 * Importing the original HeroArc's Google Sheet (downloaded as .xlsx) into the signed-in
 * account: preview first, then import. Safe to repeat: entries already imported are skipped.
 */

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE = 10 * 1024 * 1024;
const SheetFile = z.object({
  file: z.file().max(MAX_FILE).mime([XLSX, 'application/octet-stream']),
});

export const ImportTab = z.object({
  /** The old sheet's tab, e.g. "Nutrition Log". */
  tab: z.string(),
  /** Data rows found, and the entries read from them (Training Log rows group into sessions). */
  rows: z.number(),
  entries: z.number(),
  skipped: z.number(),
  /** Preview: entries not in HeroArc yet. Import: entries added. */
  new: z.number(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** The first few rows that couldn't be read, and why. */
  problems: z.array(z.string()),
});
export type ImportTab = z.infer<typeof ImportTab>;

export const ImportSummary = z.object({
  tabs: z.array(ImportTab),
  /** Sentences about goals, the plan, Oura… */
  notes: z.array(z.string()),
  /** New (preview) or added (import) entries in all. */
  total: z.number(),
});
export type ImportSummary = z.infer<typeof ImportSummary>;

export const importContract = {
  preview: oc
    .route({
      method: 'POST',
      path: '/api/v1/import/legacy/preview',
      summary:
        'Read the old HeroArc sheet (.xlsx) and say what an import would add. Writes nothing.',
      tags: ['import'],
    })
    .input(SheetFile)
    .output(ImportSummary),
  run: oc
    .route({
      method: 'POST',
      path: '/api/v1/import/legacy',
      summary:
        'Import the old HeroArc sheet (.xlsx) into this account. Already-imported entries are skipped.',
      tags: ['import'],
    })
    .input(SheetFile)
    .output(ImportSummary),
};
