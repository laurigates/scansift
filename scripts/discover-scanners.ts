#!/usr/bin/env bun
/**
 * Scanner Discovery Script
 *
 * Run with: bun scripts/discover-scanners.ts
 *
 * Discovers eSCL scanners on the local network and displays their capabilities.
 */

import {
  discoverScanners,
  getScannerCapabilities,
  getScannerStatus,
} from '../src/server/services/scanner/discovery';

const main = async () => {
  console.log('🔍 Scanning for eSCL scanners on local network...\n');
  console.log('   (This will take about 3 seconds)\n');

  const scanners = await discoverScanners();

  if (scanners.length === 0) {
    console.log('❌ No scanners found on the network.\n');
    console.log('Troubleshooting tips:');
    console.log('  1. Make sure your scanner is powered on');
    console.log('  2. Ensure the scanner is connected to the same network');
    console.log('  3. Check that the scanner supports eSCL/AirPrint scanning');
    console.log('  4. Try restarting the scanner\n');
    process.exit(1);
  }

  console.log(`✅ Found ${scanners.length} scanner(s):\n`);

  for (const scanner of scanners) {
    console.log('━'.repeat(60));
    console.log(`📠 ${scanner.name}`);
    console.log(`   Host: ${scanner.host}:${scanner.port}`);
    console.log(`   IP Addresses: ${scanner.addresses.join(', ')}`);

    if (scanner.txt) {
      console.log('   TXT Records:');
      for (const [key, value] of Object.entries(scanner.txt)) {
        console.log(`     ${key}: ${value}`);
      }
    }

    // Get capabilities
    console.log('\n   Fetching capabilities...');
    const capabilities = await getScannerCapabilities(scanner);

    if (capabilities) {
      console.log('   📋 Capabilities:');
      if (capabilities.makeAndModel) {
        console.log(`      Make/Model: ${capabilities.makeAndModel}`);
      }
      if (capabilities.serialNumber) {
        console.log(`      Serial: ${capabilities.serialNumber}`);
      }
      console.log(`      Resolutions: ${capabilities.supportedResolutions.join(', ')} DPI`);
      console.log(`      Color Modes: ${capabilities.colorModes.join(', ')}`);
      console.log(`      Formats: ${capabilities.documentFormats.join(', ')}`);
      console.log(`      Max Size: ${capabilities.maxWidth}x${capabilities.maxHeight} (internal units)`);
    } else {
      console.log('   ⚠️  Could not fetch capabilities');
    }

    // Get status
    const status = await getScannerStatus(scanner);
    if (status) {
      console.log(`\n   📊 Status: ${status.state}`);
      if (status.adfState) {
        console.log(`      ADF State: ${status.adfState}`);
      }
    }

    console.log('');
  }

  console.log('━'.repeat(60));
  console.log('\n✨ Scanner discovery complete!\n');

  // Return first scanner for further testing
  if (scanners.length > 0) {
    const primary = scanners[0];
    console.log(`Primary scanner for testing: ${primary.name}`);
    console.log(`  URL: http://${primary.addresses[0] || primary.host}:${primary.port}/eSCL/`);
  }
};

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
