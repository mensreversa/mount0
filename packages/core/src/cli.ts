#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { FuseBridge } from './bridge';
import { MountConfig } from './config';
import { FileSystem } from './filesystem';
import { FilesystemProvider } from './provider';
import { LocalProvider } from './providers/local';

async function createProviders(config: MountConfig): Promise<Map<string, FilesystemProvider>> {
  const providers = new Map<string, FilesystemProvider>();

  for (const [name, backend] of Object.entries(config.backends)) {
    switch (backend.type) {
      case 'local':
        providers.set(name, new LocalProvider(backend.options.path || '/'));
        break;
      default:
        throw new Error(`Unknown backend type: ${backend.type}`);
    }
  }

  return providers;
}

async function mount(mountpoint: string, configModule: string) {
  // Load config from code (TypeScript/JavaScript module)
  const configPath = path.resolve(process.cwd(), configModule);
  const configModuleExports = await import(configPath);
  const config: MountConfig = configModuleExports.default || configModuleExports.config;

  if (!config || !config.backends || !config.mappings) {
    throw new Error('Invalid config: missing backends or mappings');
  }

  const providers = await createProviders(config);
  const fs = new FileSystem(config, providers);
  const bridge = new FuseBridge(fs);

  await bridge.mount(mountpoint);
  console.log(`Mounted at ${mountpoint}`);

  process.on('SIGINT', async () => {
    console.log('\nUnmounting...');
    await bridge.unmount();
    process.exit(0);
  });

  await bridge.loop();
}

async function unmount(mountpoint: string) {
  const { exec } = require('child_process');
  return new Promise<void>((resolve, reject) => {
    exec(`fusermount -u "${mountpoint}"`, (err: Error | null) => {
      if (err) {
        exec(`umount "${mountpoint}"`, (err2: Error | null) => {
          if (err2) {
            reject(err2);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

async function status(mountpoint: string) {
  try {
    const stats = await fs.stat(mountpoint);
    console.log(`Mount point: ${mountpoint}`);
    console.log(`Status: mounted`);
    console.log(`Mode: ${stats.mode.toString(8)}`);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log(`Mount point: ${mountpoint}`);
      console.log(`Status: not mounted (directory doesn't exist)`);
    } else {
      console.log(`Mount point: ${mountpoint}`);
      console.log(`Status: unknown (${err.message})`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: mount0 <command> [args...]');
    console.error('Commands:');
    console.error(
      '  mount <mountpoint> <config.ts>  Mount filesystem (config must export default MountConfig)'
    );
    console.error('  unmount <mountpoint>            Unmount filesystem');
    console.error('  status <mountpoint>             Show mount status');
    process.exit(1);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'mount':
        if (args.length < 3) {
          console.error('Usage: mount0 mount <mountpoint> <config.ts>');
          process.exit(1);
        }
        await mount(args[1], args[2]);
        break;

      case 'unmount':
        if (args.length < 2) {
          console.error('Usage: mount0 unmount <mountpoint>');
          process.exit(1);
        }
        await unmount(args[1]);
        console.log(`Unmounted ${args[1]}`);
        break;

      case 'status':
        if (args.length < 2) {
          console.error('Usage: mount0 status <mountpoint>');
          process.exit(1);
        }
        await status(args[1]);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
