import { LocalProvider, mount0 } from '@mount0/core';

async function main() {
  const mountpoint = process.argv[2] || '/tmp/mount0';
  console.log(`Mounting at ${mountpoint}...`);

  const fs = mount0();
  fs.handle('/', new LocalProvider('/tmp'));

  const { unmount, loop } = await fs.mount(mountpoint);
  console.log(`Mounted at ${mountpoint}`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nUnmounting...');
    await unmount();
    process.exit(0);
  });

  // Keep the process alive
  await loop();
}

main().catch(console.error);
