# @mount0/ftp

FTP filesystem provider for mount0.

## Installation

```bash
npm install @mount0/ftp
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { FtpProvider } from '@mount0/ftp';

const fs = mount0();
fs.handle(
  '/ftp',
  new FtpProvider({
    host: 'ftp.example.com',
    port: 21,
    user: 'username',
    password: 'password',
  })
);

const { unmount, loop } = await fs.mount('/mnt/myfs');
await loop();
```

## License

MIT
