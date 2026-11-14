// Vercel drops any folder named node_modules from deployments, which removes
// the icon and Poppins font files that Expo exports under dist/assets/node_modules.
// Rename that folder to "vendor"; vercel.json rewrites the old URLs to it.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'dist', 'assets', 'node_modules');
const to = path.join(__dirname, '..', 'dist', 'assets', 'vendor');

if (fs.existsSync(from)) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
  console.log('Moved dist/assets/node_modules -> dist/assets/vendor');
}
