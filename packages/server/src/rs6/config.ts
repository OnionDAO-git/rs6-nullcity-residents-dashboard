import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(here, '..', '..', '..', '..');
const monorepoRoot = path.resolve(dashboardRoot, '..');
const filestorePath = path.resolve(monorepoRoot, 'runejs', 'rs6-filestore');

export const PACKED_DIR = path.resolve(filestorePath, 'packed');
export const FILESTORE_CONFIG_DIR = path.resolve(filestorePath, 'config');
