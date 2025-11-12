# @mount0/ssh

SSH/SFTP filesystem provider for mount0.

## Installation

```bash
npm install @mount0/ssh
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { SshProvider } from '@mount0/ssh';

const fs = mount0();
fs.handle(
  '/ssh',
  new SshProvider({
    host: 'example.com',
    port: 22,
    username: 'user',
    privateKey: process.env.SSH_PRIVATE_KEY,
  })
);

await fs.mount('/mnt/myfs');
```

## License

MIT
