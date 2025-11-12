import { mount0 } from '@mount0/core';
import { MemoryProvider } from '@mount0/memory';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

async function benchmarkRead() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-read-bench');

  try {
    await fs.mkdir(mountpoint, { recursive: true });
  } catch {}

  const fsInstance = mount0();
  fsInstance.handle('/', new MemoryProvider());

  const { unmount } = await fsInstance.mount(mountpoint);

  // Create test files first
  for (let i = 0; i < 1000; i++) {
    try {
      await fs.writeFile(path.join(mountpoint, `test${i}`), '');
    } catch {}
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('Running read benchmark...\n');

  const iterations = 10000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    try {
      await fs.stat(path.join(mountpoint, `test${i % 1000}`));
    } catch {}
  }

  const duration = performance.now() - start;
  const opsPerSec = (iterations / (duration / 1000)).toFixed(0);

  console.log('=== Read Benchmark ===');
  console.log(`Operations: ${iterations}`);
  console.log(`Duration: ${duration.toFixed(2)}ms`);
  console.log(`Throughput: ${opsPerSec} ops/sec`);
  console.log(`Avg Latency: ${(duration / iterations).toFixed(3)}ms`);

  await unmount();
  process.exit(0);
}

benchmarkRead().catch(console.error);
