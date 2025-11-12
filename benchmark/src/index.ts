import { mount0 } from '@mount0/core';
import { MemoryProvider } from '@mount0/memory';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

async function benchmark() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-benchmark');

  // Ensure mountpoint exists
  try {
    await fs.mkdir(mountpoint, { recursive: true });
  } catch {}

  console.log('Setting up benchmark filesystem...');

  const fsInstance = mount0();
  fsInstance.handle('/', new MemoryProvider());

  const { unmount } = await fsInstance.mount(mountpoint);
  console.log(`Mounted at ${mountpoint}\n`);

  // Wait a bit for mount to stabilize
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('Running filesystem benchmarks...\n');

  // Benchmark read operations
  console.log('=== Read Operations ===');
  const readStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    try {
      await fs.stat(path.join(mountpoint, `file${i}`));
    } catch {}
  }
  const readTime = performance.now() - readStart;
  console.log(
    `1000 stat operations: ${readTime.toFixed(2)}ms (${(1000 / (readTime / 1000)).toFixed(0)} ops/sec)\n`
  );

  // Benchmark write operations
  console.log('=== Write Operations ===');
  const writeStart = performance.now();
  for (let i = 0; i < 100; i++) {
    try {
      await fs.writeFile(path.join(mountpoint, `test${i}`), '');
    } catch {}
  }
  const writeTime = performance.now() - writeStart;
  console.log(
    `100 create operations: ${writeTime.toFixed(2)}ms (${(100 / (writeTime / 1000)).toFixed(0)} ops/sec)\n`
  );

  // Cleanup
  await unmount();
  console.log('Benchmark complete');
  process.exit(0);
}

benchmark().catch(console.error);
