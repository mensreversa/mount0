# @mount0/s3

AWS S3 filesystem provider for mount0.

## Installation

```bash
npm install @mount0/s3
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { S3Provider } from '@mount0/s3';

const fs = mount0();
fs.handle(
  '/s3',
  new S3Provider({
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  })
);

const { unmount, loop } = await fs.mount('/mnt/myfs');
await loop();
```

## License

MIT
