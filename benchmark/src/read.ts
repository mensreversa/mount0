import { mount, provider, mapping, MemoryProvider } from '@mount0/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function benchmarkRead() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-read-bench');
  
  try {
    await fs.mkdir(mountpoint, { recursive: true });
  } catch {}

  const fsInstance = await mount({
    mountpoint,
    providers: [
      provider('memory', new MemoryProvider())
    ],
    mappings: [
      mapping('/', 'memory')
    ]
  });

  // Create test files first
  const filesystem = fsInstance.getFilesystem();
  for (let i = 0; i < 1000; i++) {
    try {
      const handle = await filesystem.create(`/test${i}`, 0o644);
      await filesystem.close(handle);
    } catch {}
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('Running read benchmark...\n');

  const iterations = 10000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await filesystem.getattr(`/test${i % 1000}`);
  }

  const duration = performance.now() - start;
  const opsPerSec = (iterations / (duration / 1000)).toFixed(0);

  console.log('=== Read Benchmark ===');
  console.log(`Operations: ${iterations}`);
  console.log(`Duration: ${duration.toFixed(2)}ms`);
  console.log(`Throughput: ${opsPerSec} ops/sec`);
  console.log(`Avg Latency: ${(duration / iterations).toFixed(3)}ms`);

  await fsInstance.unmount();
}

benchmarkRead().catch(console.error);

