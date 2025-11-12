import { mount0 } from '@mount0/core';
import { MemoryProvider } from '@mount0/memory';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

async function benchmarkWrite() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-write-bench');

  try {
    await fs.mkdir(mountpoint, { recursive: true });
  } catch {}

  const fsInstance = mount0();
  fsInstance.handle('/', new MemoryProvider());

  const { unmount, loop } = await fsInstance.mount(mountpoint);

  // Run loop in background
  loop().catch(console.error);

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('Running write benchmark...\n');

  const iterations = 1000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const buffer = Buffer.from('x'.repeat(1024)); // 1KB
    await fs.writeFile(path.join(mountpoint, `file${i}`), buffer);
  }

  const duration = performance.now() - start;
  const opsPerSec = (iterations / (duration / 1000)).toFixed(0);

  console.log('=== Write Benchmark ===');
  console.log(`Operations: ${iterations}`);
  console.log(`Duration: ${duration.toFixed(2)}ms`);
  console.log(`Throughput: ${opsPerSec} ops/sec`);
  console.log(`Avg Latency: ${(duration / iterations).toFixed(3)}ms`);
  console.log(`Data Written: ${((iterations * 1024) / 1024).toFixed(2)} MB`);

  await unmount();
  process.exit(0);
}

benchmarkWrite().catch(console.error);
