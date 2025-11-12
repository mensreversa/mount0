import { FuseBridge } from './bridge';
import { FileSystem } from './filesystem';
import { FilesystemProvider } from './provider';

export interface MountOptions {
  options?: Record<string, string>;
}

export class Mount0 {
  private handlers: Map<string, FilesystemProvider> = new Map();
  private bridge: FuseBridge | null = null;

  handle(path: string, provider: FilesystemProvider): this {
    this.handlers.set(path, provider);
    return this;
  }

  async mount(mountpoint: string, options?: MountOptions): Promise<void> {
    const fs = new FileSystem(this.handlers);
    this.bridge = new FuseBridge(fs);

    await this.bridge.mount(mountpoint, options?.options || {});
  }

  async unmount(): Promise<void> {
    if (this.bridge) {
      await this.bridge.unmount();
      this.bridge = null;
    }
  }
}

export function mount0(): Mount0 {
  return new Mount0();
}
