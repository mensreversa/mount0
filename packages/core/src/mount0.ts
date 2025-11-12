import { FuseBridge } from './bridge';
import { FileSystem } from './filesystem';
import { FilesystemProvider } from './provider';

export interface MountOptions {
  options?: Record<string, string>;
}

export class Mount0 {
  private handlers: Map<string, FilesystemProvider> = new Map();

  handle(path: string, provider: FilesystemProvider): this {
    this.handlers.set(path, provider);
    return this;
  }

  async mount(
    mountpoint: string,
    options?: MountOptions
  ): Promise<{
    unmount: () => Promise<void>;
    loop: () => Promise<void>;
  }> {
    const fs = new FileSystem(this.handlers);
    const bridge = new FuseBridge(fs);

    await bridge.mount(mountpoint, options?.options || {});

    return {
      async unmount() {
        await bridge.unmount();
      },
      async loop() {
        await bridge.loop();
      },
    };
  }
}

export function mount0(): Mount0 {
  return new Mount0();
}
