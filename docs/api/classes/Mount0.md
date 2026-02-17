# Class: Mount0

Defined in: [mount0.ts:9](https://github.com/mensreversa/mount0/blob/7152e50b9e64fc6a5b5fb5cc0d549e8ac96860bc/packages/core/src/mount0.ts#L9)

## Constructors

### Constructor

> **new Mount0**(): `Mount0`

#### Returns

`Mount0`

## Methods

### handle()

> **handle**(`path`, `provider`): `this`

Defined in: [mount0.ts:13](https://github.com/mensreversa/mount0/blob/7152e50b9e64fc6a5b5fb5cc0d549e8ac96860bc/packages/core/src/mount0.ts#L13)

#### Parameters

##### path

`string`

##### provider

[`FilesystemProvider`](../interfaces/FilesystemProvider.md)

#### Returns

`this`

***

### mount()

> **mount**(`mountpoint`, `options?`): `Promise`\<`void`\>

Defined in: [mount0.ts:28](https://github.com/mensreversa/mount0/blob/7152e50b9e64fc6a5b5fb5cc0d549e8ac96860bc/packages/core/src/mount0.ts#L28)

#### Parameters

##### mountpoint

`string`

##### options?

[`MountOptions`](../interfaces/MountOptions.md)

#### Returns

`Promise`\<`void`\>

***

### unhandle()

> **unhandle**(`path`): `this`

Defined in: [mount0.ts:21](https://github.com/mensreversa/mount0/blob/7152e50b9e64fc6a5b5fb5cc0d549e8ac96860bc/packages/core/src/mount0.ts#L21)

#### Parameters

##### path

`string`

#### Returns

`this`

***

### unmount()

> **unmount**(): `Promise`\<`void`\>

Defined in: [mount0.ts:37](https://github.com/mensreversa/mount0/blob/7152e50b9e64fc6a5b5fb5cc0d549e8ac96860bc/packages/core/src/mount0.ts#L37)

#### Returns

`Promise`\<`void`\>
