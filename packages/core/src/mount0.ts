import { FuseBridge } from "./bridge";
import { FilesystemProvider } from "./provider";
import { RouterProvider } from "./router";

export interface MountOptions {
  options?: Record<string, string>;
}

export class Mount0 {
  private bridge: FuseBridge | null = null;
  private router: RouterProvider | null = null;

  handle(path: string, provider: FilesystemProvider): this {
    if (!this.router) {
      this.router = new RouterProvider([]);
    }
    this.router.handle(path, provider);
    return this;
  }

  unhandle(path: string): this {
    if (this.router) {
      this.router.unhandle(path);
    }
    return this;
  }

  async mount(mountpoint: string, options?: MountOptions): Promise<void> {
    if (!this.router || this.router.providers.length === 0) {
      throw new Error("No provider set. Call handle() first.");
    }

    this.bridge = new FuseBridge(this.router);
    await this.bridge.mount(mountpoint, options?.options || {});
  }

  async unmount(): Promise<void> {
    if (this.bridge) {
      await this.bridge.unmount();
      this.bridge = null;
      this.router = null;
    }
  }
}

export function mount0(): Mount0 {
  return new Mount0();
}
