import type { GridPosition, ScannerStatus, ScanState, ServerEvent } from '@shared/types';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

interface PhotoPreview {
  position: GridPosition;
  thumbnail: string; // base64
  bounds: { width: number; height: number };
  confidence: number;
}

/** Slot order of `previews`: one entry per grid position, null when no photo was detected there. */
const GRID_POSITIONS: readonly GridPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

type PreviewSlots = Array<PhotoPreview | null>;

const toPreviewSlots = (photos: readonly PhotoPreview[]): PreviewSlots => {
  const byPosition = new Map(photos.map((photo) => [photo.position, photo]));
  return GRID_POSITIONS.map((position) => byPosition.get(position) ?? null);
};

interface ScanStore {
  state: ScanState;
  socket: Socket | null;
  /** Always 4 slots, ordered as GRID_POSITIONS. */
  previews: PreviewSlots;
  /** Last scanner availability pushed by the server; null until the first scanner:status event. */
  scannerAvailable: boolean | null;
  connect: () => void;
  disconnect: () => void;
  startScan: (type: 'front' | 'back') => Promise<void>;
  skipBacks: () => Promise<void>;
  checkScanner: () => Promise<ScannerStatus>;
  clearPreviews: () => void;
  reset: () => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  state: { status: 'idle' },
  socket: null,
  previews: toPreviewSlots([]),
  scannerAvailable: null,

  connect: () => {
    const existingSocket = get().socket;
    if (existingSocket?.connected) return;

    const socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // socket.io-client reports exhausted reconnection attempts on the Manager,
    // not on the socket. No further reconnect is attempted after this.
    socket.io.on('reconnect_failed', () => {
      set({
        state: {
          status: 'error',
          message: 'Lost connection to server',
          recoverable: false,
        },
      });
    });

    // The server sends its workflow state on connect and on every transition.
    socket.on('state:changed', (state: ScanState) => {
      set({ state });
    });

    socket.on('scanner:status', (data: ServerEvent & { type: 'scanner:status' }) => {
      set({ scannerAvailable: data.available });
    });

    socket.on('scan:progress', (data: ServerEvent & { type: 'scan:progress' }) => {
      set((store) => {
        if (
          store.state.status === 'processing_fronts' ||
          store.state.status === 'processing_backs'
        ) {
          return {
            state: { ...store.state, progress: data.progress },
          };
        }
        return store;
      });
    });

    socket.on('scan:complete', (data: ServerEvent & { type: 'scan:complete' }) => {
      set((store) => {
        if (store.state.status === 'processing_fronts') {
          return {
            state: {
              status: 'ready_for_backs',
              frontScanId: data.scanId,
              photosDetected: data.photos,
            },
          };
        }
        if (store.state.status === 'processing_backs') {
          return {
            state: {
              status: 'complete',
              batchId: data.scanId,
              photosSaved: data.photos,
            },
          };
        }
        return store;
      });
    });

    socket.on('scan:error', (data: ServerEvent & { type: 'scan:error' }) => {
      set({
        state: {
          status: 'error',
          message: data.message,
          recoverable: true,
        },
      });
    });

    socket.on('photos:detected', (data: { scanId: string; previews: PhotoPreview[] }) => {
      set({ previews: toPreviewSlots(data.previews) });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  startScan: async (type) => {
    const { socket, state } = get();

    if (!socket?.connected) {
      set({
        state: {
          status: 'error',
          message: 'Not connected to server',
          recoverable: true,
        },
      });
      return;
    }

    if (type === 'front') {
      socket.emit('scan:start', { scanType: type });
      set({
        state: {
          status: 'scanning_fronts',
          scanId: 'pending',
        },
      });
      return;
    }

    // A back scan needs a completed front scan to pair with.
    if (state.status !== 'ready_for_backs') {
      return;
    }

    socket.emit('scan:start', { scanType: type, frontScanId: state.frontScanId });
    set({
      state: {
        status: 'scanning_backs',
        frontScanId: state.frontScanId,
        backScanId: 'pending',
      },
    });
  },

  skipBacks: async () => {
    const { socket, state } = get();

    if (!socket?.connected) {
      set({
        state: {
          status: 'error',
          message: 'Not connected to server',
          recoverable: true,
        },
      });
      return;
    }

    if (state.status !== 'ready_for_backs') {
      return;
    }

    // Set to saving state while server processes
    set({
      state: {
        status: 'saving',
        batchId: state.frontScanId,
      },
    });

    // Emit skip-backs event
    socket.emit('scan:skip-backs', { frontScanId: state.frontScanId });
  },

  checkScanner: async () => {
    try {
      const response = await fetch('/api/scanner/status');
      if (!response.ok) {
        throw new Error('Failed to fetch scanner status');
      }
      return (await response.json()) as ScannerStatus;
    } catch (error) {
      console.error('Error checking scanner:', error);
      return { available: false };
    }
  },

  clearPreviews: () => {
    set({ previews: toPreviewSlots([]) });
  },

  reset: () => {
    set({ state: { status: 'idle' }, previews: toPreviewSlots([]) });
  },
}));
