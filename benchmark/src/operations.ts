import { mount, provider, mapping, MemoryProvider } from '@mount0/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function benchmarkOperations() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-ops-bench');
  
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

  console.log('Running filesystem operations benchmark...\n');

  const filesystem = fsInstance.getFilesystem();
  const iterations = 500;

  // Create
  const createStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const handle = await filesystem.create(`/file${i}`, 0o644);
    await filesystem.close(handle);
  }
  const createTime = performance.now() - createStart;

  // Read
  const readStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await filesystem.getattr(`/file${i}`);
  }
  const readTime = performance.now() - readStart;

  // Readdir
  const readdirStart = performance.now();
  for (let i = 0; i < 10; i++) {
    await filesystem.readdir('/');
  }
  const readdirTime = performance.now() - readdirStart;

  // Rename
  const renameStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await filesystem.rename(`/file${i}`, `/renamed${i}`);
  }
  const renameTime = performance.now() - renameStart;

  // Unlink
  const unlinkStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await filesystem.unlink(`/renamed${i}`);
  }
  const unlinkTime = performance.now() - unlinkStart;

  console.log('=== Filesystem Operations Benchmark ===');
  console.log(`Create: ${(iterations / (createTime / 1000)).toFixed(0)} ops/sec (${createTime.toFixed(2)}ms)`);
  console.log(`Read (getattr): ${(iterations / (readTime / 1000)).toFixed(0)} ops/sec (${readTime.toFixed(2)}ms)`);
  console.log(`Readdir: ${(10 / (readdirTime / 1000)).toFixed(0)} ops/sec (${readdirTime.toFixed(2)}ms)`);
  console.log(`Rename: ${(iterations / (renameTime / 1000)).toFixed(0)} ops/sec (${renameTime.toFixed(2)}ms)`);
  console.log(`Unlink: ${(iterations / (unlinkTime / 1000)).toFixed(0)} ops/sec (${unlinkTime.toFixed(2)}ms)`);
  console.log(`\nTotal: ${((createTime + readTime + readdirTime + renameTime + unlinkTime) / 1000).toFixed(2)}s`);

  await fsInstance.unmount();
}

benchmarkOperations().catch(console.error);

