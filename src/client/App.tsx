import { useEffect } from 'react';
import { PhotoPreview } from './components/PhotoPreview';
import { ScanButton } from './components/ScanButton';
import { ScannerStatus } from './components/ScannerStatus';
import { useScanStore } from './stores/scan-store';

export const App = () => {
  const { connect, state, reset, previews } = useScanStore();

  useEffect(() => {
    connect();
  }, [connect]);

  const statusMessage = getStatusMessage(state);
  const showStatus = state.status !== 'idle';
  const showProgress = state.status === 'processing_fronts' || state.status === 'processing_backs';
  const progress = showProgress && 'progress' in state ? state.progress : 0;

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
          {showStatus && (
            <output
              className={`block rounded-lg shadow p-4 ${
                state.status === 'error'
                  ? 'bg-red-50 border border-red-200'
                  : state.status === 'complete'
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-white'
              }`}
            >
              {/* Status Message */}
              <p
                className={`text-center font-medium ${
                  state.status === 'error'
                    ? 'text-red-700'
                    : state.status === 'complete'
                      ? 'text-green-700'
                      : 'text-gray-700'
                }`}
              >
                {statusMessage}
              </p>

              {/* Photo Count for ready_for_backs state */}
              {state.status === 'ready_for_backs' && (
                <div className="mt-3 p-3 bg-primary-50 border border-primary-200 rounded-md">
                  <p className="text-center text-primary-800 font-semibold">
                    {state.photosDetected} {state.photosDetected === 1 ? 'photo' : 'photos'} ready
                  </p>
                  <p className="text-center text-sm text-primary-600 mt-1">
                    Flip photos over and scan backs, or skip to save fronts only
                  </p>
                </div>
              )}

              {/* Photo Previews for ready_for_backs or after processing_fronts */}
              {(state.status === 'ready_for_backs' ||
                (state.status === 'processing_fronts' && previews.length > 0)) &&
                previews.length > 0 && (
                  <div className="mt-4">
                    <PhotoPreview
                      photos={previews}
                      onViewFull={(position) => {
                        // eslint-disable-next-line no-console
                        console.log('Viewing full size photo at position:', position);
                      }}
                    />
                  </div>
                )}

              {/* Progress Bar */}
              {showProgress && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary-600 h-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Processing ${progress}% complete`}
                    />
                  </div>
                  <p className="text-center text-sm text-gray-500 mt-1">{progress}% complete</p>
                </div>
              )}

              {/* Complete State Actions */}
              {state.status === 'complete' && (
                <div className="mt-4 space-y-2">
                  <p className="text-center text-gray-600">
                    {state.photosSaved} {state.photosSaved === 1 ? 'photo' : 'photos'} saved
                    successfully
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Start a new batch of photos"
                    className="w-full py-3 px-6 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors min-h-touch"
                  >
                    New Batch
                  </button>
                </div>
              )}

              {/* Error State Actions */}
              {state.status === 'error' && state.recoverable && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Dismiss error and start over"
                    className="w-full py-3 px-6 text-base font-medium text-red-700 bg-white border-2 border-red-300 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors min-h-touch"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </output>
          )}
        </div>
      </main>
    </div>
  );
};

const getStatusMessage = (state: unknown): string => {
  if (!state || typeof state !== 'object' || !('status' in state)) {
    return '';
  }

  const typedState = state as { status: string; message?: string };

  switch (typedState.status) {
    case 'scanning_fronts':
      return 'Scanning front side of photos...';
    case 'processing_fronts':
      return 'Detecting and processing photos...';
    case 'ready_for_backs':
      return 'Photos detected and ready!';
    case 'scanning_backs':
      return 'Scanning back side of photos...';
    case 'processing_backs':
      return 'Processing backs and pairing with fronts...';
    case 'saving':
      return 'Saving photos to disk...';
    case 'complete':
      return 'Batch complete!';
    case 'error':
      return `Error: ${typedState.message || 'Unknown error'}`;
    default:
      return '';
  }
};
