# @mount0/samba

Samba/CIFS filesystem provider for mount0.

## Installation

```bash
npm install @mount0/samba
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { SambaProvider } from '@mount0/samba';

const fs = mount0();
fs.handle(
  '/samba',
  new SambaProvider({
    host: 'server.example.com',
    share: 'shared',
    username: 'user',
    password: 'password',
    domain: 'WORKGROUP',
  })
);

await fs.mount('/mnt/myfs');
```

## License

MIT
