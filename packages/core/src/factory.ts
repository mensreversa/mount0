import { FuseBridge } from './bridge';
import { MountConfig, PathMapping } from './config';
import { FileSystem } from './filesystem';
import { FilesystemProvider } from './provider';

export interface MountOptions {
  mountpoint: string;
  providers:
    | Map<string, FilesystemProvider>
    | Record<string, FilesystemProvider>
    | Array<[string, FilesystemProvider]>;
  mappings: PathMapping[] | Array<[string, string]>;
  options?: Record<string, string>;
}

export function provider(name: string, provider: FilesystemProvider): [string, FilesystemProvider] {
  return [name, provider];
}

export function mapping(path: string, backend: string): PathMapping {
  return { path, backend };
}

export async function mount(options: MountOptions) {
  const { mountpoint, providers, mappings, options: mountOptions = {} } = options;

  // Convert providers to Map
  let providersMap: Map<string, FilesystemProvider>;
  if (providers instanceof Map) {
    providersMap = providers;
  } else if (Array.isArray(providers)) {
    providersMap = new Map(providers);
  } else {
    providersMap = new Map(Object.entries(providers));
  }

  // Convert mappings to PathMapping[]
  let mappingsArray: PathMapping[];
  if (Array.isArray(mappings) && mappings.length > 0) {
    if (Array.isArray(mappings[0])) {
      // Array of [path, backend] tuples
      mappingsArray = (mappings as Array<[string, string]>).map(([path, backend]) => ({
        path,
        backend,
      }));
    } else {
      // Already PathMapping[]
      mappingsArray = mappings as PathMapping[];
    }
  } else {
    mappingsArray = [];
  }

  // Create mount config
  const config: MountConfig = {
    backends: {},
    mappings: mappingsArray.sort((a, b) => b.path.length - a.path.length),
  };

  // Create filesystem
  const fs = new FileSystem(config, providersMap);

  // Create bridge
  const bridge = new FuseBridge(fs);

  // Mount
  await bridge.mount(mountpoint, mountOptions);

  return {
    async unmount() {
      await bridge.unmount();
    },

    async loop() {
      await bridge.loop();
    },

    getFilesystem() {
      return fs;
    },

    getBridge() {
      return bridge;
    },
  };
}
