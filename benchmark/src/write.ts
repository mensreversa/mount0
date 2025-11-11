import { mount, provider, mapping, MemoryProvider } from '@mount0/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function benchmarkWrite() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-write-bench');
  
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

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('Running write benchmark...\n');

  const filesystem = fsInstance.getFilesystem();
  const iterations = 1000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const handle = await filesystem.create(`/file${i}`, 0o644);
    const buffer = Buffer.from('x'.repeat(1024)); // 1KB
    await filesystem.write(handle, buffer, 0, buffer.length);
    await filesystem.close(handle);
  }

  const duration = performance.now() - start;
  const opsPerSec = (iterations / (duration / 1000)).toFixed(0);

  console.log('=== Write Benchmark ===');
  console.log(`Operations: ${iterations}`);
  console.log(`Duration: ${duration.toFixed(2)}ms`);
  console.log(`Throughput: ${opsPerSec} ops/sec`);
  console.log(`Avg Latency: ${(duration / iterations).toFixed(3)}ms`);
  console.log(`Data Written: ${(iterations * 1024 / 1024).toFixed(2)} MB`);

  await fsInstance.unmount();
}

benchmarkWrite().catch(console.error);

