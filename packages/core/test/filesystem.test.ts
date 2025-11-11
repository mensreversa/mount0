/**
 * Filesystem Tests
 */

import { MountConfig } from '../src/config';
import { FileSystem } from '../src/filesystem';
import { LocalProvider } from '../src/providers/local';

describe('FileSystem', () => {
  describe('FileSystem', () => {
    test('should create a filesystem instance', () => {
      const config: MountConfig = {
        backends: {
          local: {
            type: 'local',
            options: {
              path: '/tmp',
            },
          },
        },
        mappings: [],
      };

      const providers = new Map();
      providers.set('local', new LocalProvider('/tmp'));

      const fs = new FileSystem(config, providers);
      expect(fs).toBeDefined();
    });
  });
});
