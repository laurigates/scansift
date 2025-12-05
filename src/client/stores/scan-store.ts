import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ScanState, ServerEvent } from '@shared/types';

interface ScanStore {
  state: ScanState;
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
  startScan: (type: 'front' | 'back') => Promise<void>;
  reset: () => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  state: { status: 'idle' },
  socket: null,

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
      // eslint-disable-next-line no-console
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('Disconnected from server');
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
    const { socket } = get();

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

    socket.emit('scan:start', { scanType: type });

    set({
      state: {
        status: type === 'front' ? 'scanning_fronts' : 'scanning_backs',
        scanId: 'pending',
      } as ScanState,
    });
  },

  reset: () => {
    set({ state: { status: 'idle' } });
  },
}));
