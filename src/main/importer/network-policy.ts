import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { ApplicationError } from '../services/application-error';

const DISALLOWED_HOST_SUFFIXES = ['.internal', '.invalid', '.lan', '.local', '.localhost', '.test'];

const blockedAddresses = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

export interface ResolvedPublicAddress {
  address: string;
  family: 4 | 6;
}

export function validateImporterUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error: unknown) {
    throw new ApplicationError('VALIDATION_FAILED', 'Enter a complete HTTPS URL.', {
      field: 'url',
      recoverable: true,
      cause: error,
    });
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ApplicationError(
      'IMPORT_NETWORK_REJECTED',
      'The importer accepts only credential-free HTTPS URLs.',
      { field: 'url', recoverable: true },
    );
  }

  if (url.port && url.port !== '443') {
    throw new ApplicationError(
      'IMPORT_NETWORK_REJECTED',
      'The importer accepts only the standard HTTPS port.',
      { field: 'url', recoverable: true },
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || isDisallowedHostname(hostname)) {
    throw new ApplicationError(
      'IMPORT_NETWORK_REJECTED',
      'Local, private, and reserved network destinations are not allowed.',
      { field: 'url', recoverable: true },
    );
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0 && !isPublicIpAddress(hostname)) {
    throw new ApplicationError(
      'IMPORT_NETWORK_REJECTED',
      'Local, private, and reserved network destinations are not allowed.',
      { field: 'url', recoverable: true },
    );
  }

  url.hostname = hostname;
  url.hash = '';
  return url;
}

export async function resolvePublicAddress(hostname: string): Promise<ResolvedPublicAddress> {
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    if (!isPublicIpAddress(hostname)) {
      throw networkRejected();
    }
    return { address: hostname, family: literalFamily };
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error: unknown) {
    throw new ApplicationError('IMPORT_FAILED', 'The partner-page host could not be resolved.', {
      field: 'url',
      recoverable: true,
      cause: error,
    });
  }

  if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw networkRejected();
  }

  const preferred = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  if (!preferred || (preferred.family !== 4 && preferred.family !== 6)) {
    throw networkRejected();
  }
  return { address: preferred.address, family: preferred.family };
}

export function isPublicIpAddress(address: string): boolean {
  if (address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family !== 6 || blockedAddresses.check(address, 'ipv6')) return false;

  const firstHextet = Number.parseInt(address.split(':', 1)[0] ?? '', 16);
  return Number.isFinite(firstHextet) && firstHextet >= 0x2000 && firstHextet <= 0x3fff;
}

export function isDisallowedHostname(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  return DISALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

function networkRejected(): ApplicationError {
  return new ApplicationError(
    'IMPORT_NETWORK_REJECTED',
    'The host resolves to a local, private, or reserved network address.',
    { field: 'url', recoverable: true },
  );
}
