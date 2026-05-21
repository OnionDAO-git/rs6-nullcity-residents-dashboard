import { Filestore } from '@runejs/filestore';
import { FILESTORE_CONFIG_DIR, PACKED_DIR } from '../config.js';

let _store: Filestore | null = null;

export function getFilestore(): Filestore {
  if (!_store) {
    _store = new Filestore(PACKED_DIR, { configDir: FILESTORE_CONFIG_DIR });
  }
  return _store;
}
