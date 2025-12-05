import { useEffect, useState } from 'react';
import type { ScannerStatus as ScannerStatusType } from '@shared/types';

export const ScannerStatus = () => {
  const [status, setStatus] = useState<ScannerStatusType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/scanner/status');
        const data = (await response.json()) as ScannerStatusType;
        setStatus(data);
      } catch {
        setStatus({ available: false });
      } finally {
        setLoading(false);
      }
    };

    checkStatus();

    // Poll every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div
        className="bg-white rounded-lg shadow p-4"
        aria-busy="true"
        aria-label="Checking scanner status"
      >
        <p className="text-center text-gray-500">Checking scanner...</p>
      </div>
    );
  }

  return (
    <div
      data-testid="scanner-status"
      className={`rounded-lg shadow p-4 ${
        status?.available
          ? 'bg-green-50 border border-green-200'
          : 'bg-yellow-50 border border-yellow-200'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <span
          className={`w-3 h-3 rounded-full ${
            status?.available ? 'bg-green-500' : 'bg-yellow-500'
          }`}
          aria-hidden="true"
        />
        <span
          className={`font-medium ${
            status?.available ? 'text-green-700' : 'text-yellow-700'
          }`}
        >
          {status?.available ? 'Scanner Connected' : 'Scanner Not Found'}
        </span>
      </div>
      {status?.model && (
        <p className="text-center text-sm text-gray-500 mt-1">{status.model}</p>
      )}
    </div>
  );
};
