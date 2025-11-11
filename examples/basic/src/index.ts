import { LocalProvider, mapping, mount, provider } from '@mount0/core';

async function main() {
  const mountpoint = process.argv[2] || '/tmp/mount0';
  console.log(`Mounting at ${mountpoint}...`);

  const fs = await mount({
    mountpoint,
    providers: [provider('local', new LocalProvider('/tmp'))],
    mappings: [mapping('/', 'local')],
  });

  console.log(`Mounted at ${mountpoint}`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nUnmounting...');
    await fs.unmount();
    process.exit(0);
  });

  // Keep the process alive
  await fs.loop();
}

main().catch(console.error);
