import { useEffect } from 'react';
import { ScanButton } from './components/ScanButton';
import { ScannerStatus } from './components/ScannerStatus';
import { useScanStore } from './stores/scan-store';

export const App = () => {
  const { connect, state } = useScanStore();

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-600 text-white p-4">
        <h1 className="text-2xl font-bold text-center">PhotoScan</h1>
      </header>

      <main className="container mx-auto p-4 max-w-lg">
        <div className="space-y-6">
          {/* Scanner Status */}
          <ScannerStatus />

          {/* Main Scan Button */}
          <ScanButton />

          {/* Status Display */}
          {state.status !== 'idle' && (
            <div
              role="status"
              aria-live="polite"
              className="bg-white rounded-lg shadow p-4"
            >
              <p className="text-center text-gray-700">
                {getStatusMessage(state)}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const getStatusMessage = (
  state: ReturnType<typeof useScanStore>['state']
): string => {
  switch (state.status) {
    case 'scanning_fronts':
      return 'Scanning photos...';
    case 'processing_fronts':
      return `Processing: ${state.progress}% complete`;
    case 'ready_for_backs':
      return `${state.photosDetected} photos detected. Flip and scan backs.`;
    case 'scanning_backs':
      return 'Scanning backs...';
    case 'processing_backs':
      return `Processing backs: ${state.progress}% complete`;
    case 'saving':
      return 'Saving photos...';
    case 'complete':
      return `✓ ${state.photosSaved} photos saved!`;
    case 'error':
      return `Error: ${state.message}`;
    default:
      return '';
  }
};
