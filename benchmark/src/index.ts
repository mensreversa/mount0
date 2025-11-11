import { mount, provider, mapping, LocalProvider, MemoryProvider } from '@mount0/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function benchmark() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-benchmark');
  
  // Ensure mountpoint exists
  try {
    await fs.mkdir(mountpoint, { recursive: true });
  } catch {}

  console.log('Setting up benchmark filesystem...');
  
  const fsInstance = await mount({
    mountpoint,
    providers: [
      provider('memory', new MemoryProvider())
    ],
    mappings: [
      mapping('/', 'memory')
    ]
  });

  console.log(`Mounted at ${mountpoint}\n`);

  // Wait a bit for mount to stabilize
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Running filesystem benchmarks...\n');

  const filesystem = fsInstance.getFilesystem();

  // Benchmark read operations
  console.log('=== Read Operations ===');
  const readStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    try {
      await filesystem.getattr(`/file${i}`);
    } catch {}
  }
  const readTime = performance.now() - readStart;
  console.log(`1000 getattr operations: ${readTime.toFixed(2)}ms (${(1000 / (readTime / 1000)).toFixed(0)} ops/sec)\n`);

  // Benchmark write operations
  console.log('=== Write Operations ===');
  const writeStart = performance.now();
  for (let i = 0; i < 100; i++) {
    try {
      const handle = await filesystem.create(`/test${i}`, 0o644);
      await filesystem.close(handle);
    } catch {}
  }
  const writeTime = performance.now() - writeStart;
  console.log(`100 create operations: ${writeTime.toFixed(2)}ms (${(100 / (writeTime / 1000)).toFixed(0)} ops/sec)\n`);

  // Cleanup
  await fsInstance.unmount();
  console.log('Benchmark complete');
  process.exit(0);
}

benchmark().catch(console.error);

