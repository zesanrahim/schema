import type { IpcInvoke, IpcEvents } from "../shared/types";

declare global {
  interface Window {
    api: {
      invoke<K extends keyof IpcInvoke>(
        channel: K,
        args: IpcInvoke[K]["args"]
      ): Promise<IpcInvoke[K]["result"]>;
      on<K extends keyof IpcEvents>(
        channel: K,
        listener: (payload: IpcEvents[K]) => void
      ): () => void;
    };
  }
}
