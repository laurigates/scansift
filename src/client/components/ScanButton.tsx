import { useScanStore } from '../stores/scan-store';

export const ScanButton = () => {
  const { state, startScan } = useScanStore();

  const isScanning =
    state.status === 'scanning_fronts' ||
    state.status === 'scanning_backs' ||
    state.status === 'processing_fronts' ||
    state.status === 'processing_backs' ||
    state.status === 'saving';

  const handleClick = async () => {
    if (isScanning) return;

    const scanType = state.status === 'ready_for_backs' ? 'back' : 'front';
    await startScan(scanType);
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

  return (
    <button
      onClick={handleClick}
      disabled={isScanning}
      aria-label={isScanning ? 'Scan in progress' : buttonText()}
      aria-busy={isScanning}
      className="w-full py-6 px-8 text-2xl btn-primary"
    >
      {buttonText()}
    </button>
  );
};
