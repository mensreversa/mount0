import { mount0 } from '@mount0/core';
import { MemoryProvider } from '@mount0/memory';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

async function benchmarkOperations() {
  const mountpoint = path.join(os.tmpdir(), 'mount0-ops-bench');

  try {
    await fs.mkdir(mountpoint, { recursive: true });
  } catch {}

  const fsInstance = mount0();
  fsInstance.handle('/', new MemoryProvider());

  const { unmount, loop } = await fsInstance.mount(mountpoint);

  // Run loop in background
  loop().catch(console.error);

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log('Running filesystem operations benchmark...\n');

  const iterations = 500;

  // Create
  const createStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fs.writeFile(path.join(mountpoint, `file${i}`), '');
  }
  const createTime = performance.now() - createStart;

  // Read
  const readStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fs.stat(path.join(mountpoint, `file${i}`));
  }
  const readTime = performance.now() - readStart;

  // Readdir
  const readdirStart = performance.now();
  for (let i = 0; i < 10; i++) {
    await fs.readdir(mountpoint);
  }
  const readdirTime = performance.now() - readdirStart;

  // Rename
  const renameStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fs.rename(path.join(mountpoint, `file${i}`), path.join(mountpoint, `renamed${i}`));
  }
  const renameTime = performance.now() - renameStart;

  // Unlink
  const unlinkStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fs.unlink(path.join(mountpoint, `renamed${i}`));
  }
  const unlinkTime = performance.now() - unlinkStart;

  console.log('=== Filesystem Operations Benchmark ===');
  console.log(
    `Create: ${(iterations / (createTime / 1000)).toFixed(0)} ops/sec (${createTime.toFixed(2)}ms)`
  );
  console.log(
    `Read (stat): ${(iterations / (readTime / 1000)).toFixed(0)} ops/sec (${readTime.toFixed(2)}ms)`
  );
  console.log(
    `Readdir: ${(10 / (readdirTime / 1000)).toFixed(0)} ops/sec (${readdirTime.toFixed(2)}ms)`
  );
  console.log(
    `Rename: ${(iterations / (renameTime / 1000)).toFixed(0)} ops/sec (${renameTime.toFixed(2)}ms)`
  );
  console.log(
    `Unlink: ${(iterations / (unlinkTime / 1000)).toFixed(0)} ops/sec (${unlinkTime.toFixed(2)}ms)`
  );
  console.log(
    `\nTotal: ${((createTime + readTime + readdirTime + renameTime + unlinkTime) / 1000).toFixed(2)}s`
  );

  await unmount();
  process.exit(0);
}

benchmarkOperations().catch(console.error);
