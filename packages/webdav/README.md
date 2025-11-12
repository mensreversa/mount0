# @mount0/webdav

WebDAV filesystem provider for mount0.

## Installation

```bash
npm install @mount0/webdav
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { WebDavProvider } from '@mount0/webdav';

const fs = mount0();
fs.handle(
  '/webdav',
  new WebDavProvider({
    url: 'https://example.com/webdav',
    username: 'user',
    password: 'password',
  })
);

const { unmount, loop } = await fs.mount('/mnt/myfs');
await loop();
```

## License

MIT
