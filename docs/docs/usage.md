---
sidebar_position: 2
---

# Usage Guide

## Installation

```bash
npm install @mount0/core
```

## Creating a Virtual Filesystem

```typescript
import { Mount0 } from '@mount0/core';

const fs = new Mount0();

// Mount to a directory
await fs.mount('/tmp/my-virtual-fs');

// Write a file
await fs.writeFile('/hello.txt', 'Hello World');

// Read a file
const content = await fs.readFile('/hello.txt');
console.log(content); // Hello World

// Unmount
await fs.unmount();
```

## Supported Operations

- `writeFile(path, content)`
- `readFile(path)`
- `mkdir(path)`
- `readdir(path)`
- `rm(path)`
