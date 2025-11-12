import { mount0 } from '@mount0/core';
import { EncryptedProvider } from '@mount0/encrypted';
import { LocalProvider } from '@mount0/local';
import { MemoryProvider } from '@mount0/memory';
import { FirstProvider, MajorityProvider } from '@mount0/multi';
import { Raid0Provider, Raid1Provider } from '@mount0/raid';

async function main() {
  const mountpoint = process.argv[2] || '/tmp/mount0-combined';
  const debug = process.env.MOUNT0_DEBUG === '1';
  if (debug) {
    console.log('Debug mode enabled (set MOUNT0_DEBUG=1 to enable)');
  }
  console.log(`Mounting combined filesystem at ${mountpoint}...`);

  const fs = mount0();

  // Example 1: Simple local filesystem
  fs.handle('/', new LocalProvider('/tmp'));

  // Example 2: RAID 1 (mirrored) storage for important data
  const disk1 = new LocalProvider('/tmp/disk1');
  const disk2 = new LocalProvider('/tmp/disk2');
  fs.handle('/backup', new Raid1Provider({ providers: [disk1, disk2] }));

  // Example 3: RAID 0 (striped) for performance
  const fast1 = new LocalProvider('/tmp/fast1');
  const fast2 = new LocalProvider('/tmp/fast2');
  fs.handle('/fast', new Raid0Provider({ providers: [fast1, fast2], stripeSize: 128 * 1024 }));

  // Example 4: Encrypted storage
  const baseProvider = new LocalProvider('/tmp/secure');
  fs.handle(
    '/secure',
    new EncryptedProvider({
      provider: baseProvider,
      password: 'my-secret-password',
      algorithm: 'aes-256-gcm',
    })
  );

  // Example 5: Multi-provider with failover (FirstProvider)
  const primary = new LocalProvider('/tmp/primary');
  const secondary = new LocalProvider('/tmp/secondary');
  fs.handle('/failover', new FirstProvider({ providers: [primary, secondary] }));

  // Example 6: Multi-provider with quorum (MajorityProvider)
  const node1 = new MemoryProvider();
  const node2 = new MemoryProvider();
  const node3 = new MemoryProvider();
  fs.handle('/quorum', new MajorityProvider({ providers: [node1, node2, node3] }));

  // Example 7: Encrypted RAID 1 (encryption + redundancy)
  const encryptedDisk1 = new LocalProvider('/tmp/encrypted1');
  const encryptedDisk2 = new LocalProvider('/tmp/encrypted2');
  const raid1 = new Raid1Provider({ providers: [encryptedDisk1, encryptedDisk2] });
  fs.handle(
    '/encrypted-backup',
    new EncryptedProvider({
      provider: raid1,
      password: 'backup-password',
    })
  );

  // Example 8: Failover with encrypted storage
  const encryptedPrimary = new EncryptedProvider({
    provider: new LocalProvider('/tmp/enc-primary'),
    password: 'primary-password',
  });
  const encryptedSecondary = new EncryptedProvider({
    provider: new LocalProvider('/tmp/enc-secondary'),
    password: 'secondary-password',
  });
  fs.handle(
    '/encrypted-failover',
    new FirstProvider({
      providers: [encryptedPrimary, encryptedSecondary],
    })
  );

  const { unmount } = await fs.mount(mountpoint);
  console.log(`Mounted at ${mountpoint}`);
  console.log('\nAvailable paths:');
  console.log('  /                    - Simple local filesystem');
  console.log('  /backup              - RAID 1 (mirrored) storage');
  console.log('  /fast                - RAID 0 (striped) for performance');
  console.log('  /secure              - Encrypted storage');
  console.log('  /failover            - Multi-provider with failover');
  console.log('  /quorum              - Multi-provider with quorum');
  console.log('  /encrypted-backup    - Encrypted RAID 1 (encryption + redundancy)');
  console.log('  /encrypted-failover  - Encrypted storage with failover');
  console.log('\nPress Ctrl+C to unmount');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nUnmounting...');
    await unmount();
    process.exit(0);
  });

  // Keep the process alive (mount keeps it running)
  await new Promise(() => {});
}

main().catch(console.error);
