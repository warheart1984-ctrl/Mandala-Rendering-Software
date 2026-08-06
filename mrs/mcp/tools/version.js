// mrs/mcp/tools/version.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

export const versionTool = {
  id: 'mrs.version',
  description: 'Reports Mandala Rendering System version and build metadata.',
  async execute(params = {}, context = {}) {
    return {
      name: 'Mandala Rendering System',
      version: pkg.version,
      build: process.env.MRS_BUILD_ID || 'dev',
      runtime: {
        node: process.version,
        platform: process.platform,
      },
    };
  },
};