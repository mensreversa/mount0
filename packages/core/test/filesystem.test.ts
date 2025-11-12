/**
 * Filesystem Tests
 */

import { FileSystem } from '../src/filesystem';
import { LocalProvider } from '../src/providers/local';

describe('FileSystem', () => {
  describe('FileSystem', () => {
    test('should create a filesystem instance', () => {
      const handlers = new Map();
      handlers.set('/', new LocalProvider('/tmp'));

      const fs = new FileSystem(handlers);
      expect(fs).toBeDefined();
    });
  });
});
