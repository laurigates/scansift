/**
 * Example usage of the ScanOrchestrator service
 *
 * This demonstrates how to use the orchestrator to coordinate
 * the full scanning workflow.
 */

import { createScanOrchestrator } from './scan-orchestrator';

async function runFullScanWorkflow() {
  // Create orchestrator instance
  const orchestrator = createScanOrchestrator({
    outputDirectory: './output/scans',
    scanTimeout: 30000, // 30 seconds
  });

  // Listen to state changes
  orchestrator.on('state:changed', (state) => {
    console.log('State changed:', state);
  });

  // Listen to scan progress
  orchestrator.on('scan:progress', (scanId, progress) => {
    console.log(`Scan ${scanId}: ${progress}% complete`);
  });

  // Listen to scan completion
  orchestrator.on('scan:complete', (scanId, photosDetected) => {
    console.log(`Scan ${scanId} complete: ${photosDetected} photos detected`);
  });

  // Listen to batch completion
  orchestrator.on('batch:complete', (result) => {
    console.log('Batch complete:', result);
  });

  try {
    // Check if scanner is ready
    const isReady = await orchestrator.isScannerReady();
    if (!isReady) {
      console.error('No scanner found. Please check scanner connection.');
      return;
    }

    console.log('Scanner ready. Starting front scan...');

    // Step 1: Scan fronts
    const frontResult = await orchestrator.startFrontScan({
      resolution: 300,
      colorMode: 'RGB24',
      format: 'image/jpeg',
    });

    console.log(`Front scan complete: ${frontResult.photosDetected} photos detected`);
    console.log(`Raw image saved to: ${frontResult.rawImagePath}`);

    // Prompt user to flip photos
    console.log('\n⚠️  Please flip the photos and press Enter to scan backs...');
    await waitForEnter();

    // Step 2: Scan backs
    console.log('Starting back scan...');
    const backResult = await orchestrator.startBackScan();

    console.log(`Back scan complete: ${backResult.photosDetected} photos detected`);
    console.log(`Raw image saved to: ${backResult.rawImagePath}`);

    // Step 3: Complete batch (pair and save)
    console.log('\nPairing photos and saving...');
    const batchResult = await orchestrator.completeBatch();

    console.log(`\n✓ Batch complete! Saved ${batchResult.pairsSaved} photo pairs`);
    console.log(`Output directory: ${batchResult.outputDirectory}`);
  } catch (error) {
    console.error('Scan workflow failed:', error);

    // Check if error is recoverable
    const state = orchestrator.getState();
    if (state.status === 'error' && state.recoverable) {
      console.log('Error is recoverable. You can try again.');
      orchestrator.reset();
    }
  }
}

/**
 * Wait for user to press Enter
 */
async function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

// Example 2: Scan fronts only (no backs)
// async function runFrontsOnlyWorkflow() {
//   const orchestrator = createScanOrchestrator();
//
//   try {
//     // Scan fronts
//     const frontResult = await orchestrator.startFrontScan();
//
//     console.log(`Front scan complete: ${frontResult.photosDetected} photos detected`);
//
//     // Complete batch without backs
//     const batchResult = await orchestrator.completeBatch();
//
//     console.log(`Batch complete: ${batchResult.pairsSaved} photos saved (fronts only)`);
//   } catch (error) {
//     console.error('Workflow failed:', error);
//   }
// }

// Example 3: Event-driven integration
// async function _runEventDrivenWorkflow() {
//   const orchestrator = createScanOrchestrator();
//
//   // Set up comprehensive event handlers
//   orchestrator.on('state:changed', (state) => {
//     console.log('State:', state);
//
//     // Update UI based on state
//     switch (state.status) {
//       case 'scanning_fronts':
//         console.log('UI: Show scanning indicator');
//         break;
//       case 'ready_for_backs':
//         console.log('UI: Enable "Scan Backs" button');
//         break;
//       case 'complete':
//         console.log('UI: Show success message');
//         break;
//       case 'error':
//         console.log('UI: Show error:', state.message);
//         if (state.recoverable) {
//           console.log('UI: Enable retry button');
//         }
//         break;
//     }
//   });
//
//   orchestrator.on('scan:started', (scanId, type) => {
//     console.log(`Scan started: ${type} (${scanId})`);
//   });
//
//   orchestrator.on('scan:progress', (_scanId, progress) => {
//     console.log(`Progress: ${progress}%`);
//     // Update progress bar in UI
//   });
//
//   orchestrator.on('scan:error', (scanId, error) => {
//     console.error(`Scan error: ${scanId}`, error.message);
//   });
//
//   orchestrator.on('batch:complete', (result) => {
//     console.log(`Batch ${result.batchId} saved ${result.pairsSaved} pairs`);
//   });
//
//   // Start workflow
//   try {
//     await orchestrator.startFrontScan();
//     // User action: flip photos
//     await orchestrator.startBackScan();
//     // Finalize
//     await orchestrator.completeBatch();
//   } catch (error) {
//     console.error('Workflow error:', error);
//   }
// }

// Run example (comment out others to test individually)
if (import.meta.main) {
  console.log('=== PhotoScan Orchestrator Example ===\n');
  await runFullScanWorkflow();
  // await runFrontsOnlyWorkflow();
  // await runEventDrivenWorkflow();
}
