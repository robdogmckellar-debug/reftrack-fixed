import type {
  ImportPartnerSite,
  ImporterProgressEvent,
  ImporterResult,
} from '../../shared/ipc/contract';

export interface StaticImportResult {
  brandName: string;
  sites: ImportPartnerSite[];
  confidence: number;
  warnings: string[];
  sourceUrl: string;
  finalUrl: string;
  redirectCount: number;
  requiresBrowserFallback: boolean;
}

export interface BrowserImportResult {
  brandName: string;
  sites: ImportPartnerSite[];
  confidence: number;
  warnings: string[];
  finalUrl: string;
}

export type ImportProgressReporter = (event: Omit<ImporterProgressEvent, 'jobId'>) => void;

export function toImporterResult(
  staticResult: StaticImportResult,
  browserResult?: BrowserImportResult,
): ImporterResult {
  if (!browserResult) {
    return {
      brandName: staticResult.brandName,
      sites: staticResult.sites,
      method: 'static',
      confidence: staticResult.confidence,
      warnings: staticResult.warnings,
      sourceUrl: staticResult.sourceUrl,
      finalUrl: staticResult.finalUrl,
    };
  }

  const mergedSites = mergeSites(browserResult.sites, staticResult.sites);
  return {
    brandName: browserResult.brandName || staticResult.brandName,
    sites: mergedSites,
    method: 'browser',
    confidence: Math.max(browserResult.confidence, staticResult.confidence),
    warnings: [...new Set([...staticResult.warnings, ...browserResult.warnings])],
    sourceUrl: staticResult.sourceUrl,
    finalUrl: browserResult.finalUrl || staticResult.finalUrl,
  };
}

function mergeSites(
  primary: ImportPartnerSite[],
  secondary: ImportPartnerSite[],
): ImportPartnerSite[] {
  const byHost = new Map<string, ImportPartnerSite>();
  for (const site of [...primary, ...secondary]) {
    let host: string;
    try {
      host = new URL(site.url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue;
    }
    if (!byHost.has(host)) byHost.set(host, site);
  }
  return [...byHost.values()].slice(0, 500);
}
