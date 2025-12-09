import { useScanStore } from '../stores/scan-store';

export const ScanButton = () => {
  const { state, startScan, skipBacks } = useScanStore();

  const isScanning =
    state.status === 'scanning_fronts' ||
    state.status === 'scanning_backs' ||
    state.status === 'processing_fronts' ||
    state.status === 'processing_backs' ||
    state.status === 'saving';

  const isProcessing = state.status === 'processing_fronts' || state.status === 'processing_backs';

  const handleScanClick = async () => {
    if (isScanning) return;

    const scanType = state.status === 'ready_for_backs' ? 'back' : 'front';
    await startScan(scanType);
  };

  const handleSkipClick = async () => {
    if (state.status === 'ready_for_backs') {
      await skipBacks();
    }
  };

  const buttonText = (): string => {
    switch (state.status) {
      case 'idle':
      case 'complete':
      case 'error':
        return 'Scan Fronts';
      case 'ready_for_backs':
        return 'Scan Backs';
      case 'scanning_fronts':
      case 'scanning_backs':
        return 'Scanning...';
      case 'processing_fronts':
      case 'processing_backs':
        return 'Processing...';
      case 'saving':
        return 'Saving...';
      default:
        return 'Scan';
    }
  };

  const showProgress = isProcessing && 'progress' in state;
  const progress = showProgress ? state.progress : 0;

  return (
    <div className="space-y-3">
      {/* Main Scan Button */}
      <button
        type="button"
        onClick={handleScanClick}
        disabled={isScanning}
        aria-label={isScanning ? 'Scan in progress' : buttonText()}
        aria-busy={isScanning}
        className="relative w-full py-6 px-8 text-2xl btn-primary overflow-hidden"
      >
        {/* Progress Bar */}
        {showProgress && (
          <div
            className="absolute inset-0 bg-primary-700 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
            aria-hidden="true"
          />
        )}

        {/* Button Text */}
        <span className="relative z-10 flex items-center justify-center gap-3">
          {isScanning && (
            <span
              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
          )}
          {buttonText()}
          {showProgress && <span className="text-lg">({progress}%)</span>}
        </span>
      </button>

      {/* Skip Backs Button */}
      {state.status === 'ready_for_backs' && (
        <button
          type="button"
          onClick={handleSkipClick}
          aria-label="Skip scanning backs and save with fronts only"
          className="w-full py-3 px-6 text-base font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors min-h-touch"
        >
          Skip Backs (Save Fronts Only)
        </button>
      )}
    </div>
  );
};
