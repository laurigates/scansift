#!/usr/bin/env bun
/**
 * Scanner Debug Script
 *
 * Performs detailed diagnostics on eSCL scanner communication.
 */

import { type DiscoveredScanner, discoverScanners } from '../src/server/services/scanner/discovery';

const getScannerBaseUrl = (scanner: DiscoveredScanner): string => {
  const host = scanner.addresses[0] || scanner.host;
  const protocol = scanner.port === 443 ? 'https' : 'http';
  return `${protocol}://${host}:${scanner.port}`;
};

const fetchWithTls = async (url: string, options: RequestInit = {}) => {
  return fetch(url, {
    ...options,
    // @ts-expect-error - Bun supports this option
    tls: { rejectUnauthorized: false },
  });
};

const main = async () => {
  console.log('🔍 Scanner Debug\n');

  const scanners = await discoverScanners();
  if (scanners.length === 0) {
    console.log('No scanners found');
    process.exit(1);
  }

  const scanner = scanners[0];
  const baseUrl = getScannerBaseUrl(scanner);

  console.log(`Scanner: ${scanner.name}`);
  console.log(`Base URL: ${baseUrl}\n`);

  // 1. Check capabilities
  console.log('1️⃣  Checking capabilities...');
  try {
    const capRes = await fetchWithTls(`${baseUrl}/eSCL/ScannerCapabilities`);
    console.log(`   Status: ${capRes.status}`);
    if (capRes.ok) {
      const xml = await capRes.text();
      console.log(`   Response length: ${xml.length} chars`);
      // Extract key info
      const makeMatch = xml.match(/<[^:]*:?MakeAndModel>([^<]+)</i);
      console.log(`   Make/Model: ${makeMatch?.[1] || 'N/A'}`);
    }
  } catch (e) {
    console.log(`   Error: ${e}`);
  }

  // 2. Check status
  console.log('\n2️⃣  Checking status...');
  try {
    const statusRes = await fetchWithTls(`${baseUrl}/eSCL/ScannerStatus`);
    console.log(`   Status: ${statusRes.status}`);
    if (statusRes.ok) {
      const xml = await statusRes.text();
      console.log(`   Full response:\n${xml.substring(0, 1000)}`);
    }
  } catch (e) {
    console.log(`   Error: ${e}`);
  }

  // 3. List existing jobs
  console.log('\n3️⃣  Checking for existing jobs...');
  try {
    const jobsRes = await fetchWithTls(`${baseUrl}/eSCL/ScanJobs`);
    console.log(`   Status: ${jobsRes.status}`);
    if (jobsRes.ok) {
      const xml = await jobsRes.text();
      console.log(`   Response:\n${xml.substring(0, 500)}`);
    }
  } catch (e) {
    console.log(`   Error: ${e}`);
  }

  // 4. Try minimal scan settings
  console.log('\n4️⃣  Trying minimal scan request...');
  const minimalSettings = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03">
  <scan:Intent>Preview</scan:Intent>
  <scan:XResolution>75</scan:XResolution>
  <scan:YResolution>75</scan:YResolution>
  <scan:ColorMode>Grayscale8</scan:ColorMode>
  <scan:InputSource>Platen</scan:InputSource>
</scan:ScanSettings>`;

  try {
    const scanRes = await fetchWithTls(`${baseUrl}/eSCL/ScanJobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: minimalSettings,
    });
    console.log(`   Status: ${scanRes.status}`);
    console.log(`   Location: ${scanRes.headers.get('Location')}`);
    if (!scanRes.ok) {
      const body = await scanRes.text();
      console.log(`   Response body:\n${body.substring(0, 500)}`);
    }
  } catch (e) {
    console.log(`   Error: ${e}`);
  }

  // 5. Try with different format
  console.log('\n5️⃣  Trying PDF format...');
  const pdfSettings = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03">
  <scan:Intent>Document</scan:Intent>
  <scan:XResolution>75</scan:XResolution>
  <scan:YResolution>75</scan:YResolution>
  <scan:ColorMode>Grayscale8</scan:ColorMode>
  <scan:InputSource>Platen</scan:InputSource>
  <scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
</scan:ScanSettings>`;

  try {
    const scanRes = await fetchWithTls(`${baseUrl}/eSCL/ScanJobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: pdfSettings,
    });
    console.log(`   Status: ${scanRes.status}`);
    console.log(`   Location: ${scanRes.headers.get('Location')}`);
    if (!scanRes.ok) {
      const body = await scanRes.text();
      console.log(`   Response body:\n${body.substring(0, 500)}`);
    }
  } catch (e) {
    console.log(`   Error: ${e}`);
  }
};

main().catch(console.error);
