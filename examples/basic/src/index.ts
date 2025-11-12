import { mount0 } from '@mount0/core';
import { LocalProvider } from '@mount0/local';

async function main() {
  const mountpoint = process.argv[2] || '/tmp/mount0';
  const debug = process.env.MOUNT0_DEBUG === '1';
  if (debug) {
    console.log('Debug mode enabled (set MOUNT0_DEBUG=1 to enable)');
  }
  console.log(`Mounting at ${mountpoint}...`);

  const fs = mount0();
  fs.handle('/', new LocalProvider('/tmp'));

  await fs.mount(mountpoint);
  console.log(`Mounted at ${mountpoint}`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nUnmounting...');
    await fs.unmount();
    process.exit(0);
  });

  // Keep the process alive (mount keeps it running)
  await new Promise(() => {});
}

main().catch(console.error);
