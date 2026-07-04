import { contextBridge, ipcRenderer } from "electron";
import type { IpcInvoke, IpcEvents } from "../shared/types";

contextBridge.exposeInMainWorld("api", {
  invoke<K extends keyof IpcInvoke>(channel: K, ...args: [] | [IpcInvoke[K]["args"]]): Promise<IpcInvoke[K]["result"]> {
    return ipcRenderer.invoke(channel as string, ...args) as Promise<IpcInvoke[K]["result"]>;
  },

  on<K extends keyof IpcEvents>(channel: K, listener: (payload: IpcEvents[K]) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcEvents[K]) => listener(payload);
    ipcRenderer.on(channel as string, wrapped);
    return () => ipcRenderer.removeListener(channel as string, wrapped);
  },
});
