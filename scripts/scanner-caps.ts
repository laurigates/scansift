#!/usr/bin/env bun
/**
 * Get full scanner capabilities
 */

import { type DiscoveredScanner, discoverScanners } from '../src/server/services/scanner/discovery';

const getScannerBaseUrl = (scanner: DiscoveredScanner): string => {
  const host = scanner.addresses[0] || scanner.host;
  const protocol = scanner.port === 443 ? 'https' : 'http';
  return `${protocol}://${host}:${scanner.port}`;
};

const main = async () => {
  const scanners = await discoverScanners();
  if (scanners.length === 0) {
    console.log('No scanners found');
    process.exit(1);
  }

  const scanner = scanners[0];
  const baseUrl = getScannerBaseUrl(scanner);

  const response = await fetch(`${baseUrl}/eSCL/ScannerCapabilities`, {
    // @ts-expect-error - Bun supports this
    tls: { rejectUnauthorized: false },
  });

  const xml = await response.text();
  console.log(xml);
};

main().catch(console.error);
