const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, 'apps/frontend/dist');
const destination = path.resolve(__dirname, 'apps/backend/public');
const rootDist = path.resolve(__dirname, 'dist');

if (!fs.existsSync(source)) throw new Error('Frontend build output is missing. Run the frontend build first.');

fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true, force: true });
console.log('Copied frontend build to apps/backend/public.');

fs.mkdirSync(rootDist, { recursive: true });
fs.cpSync(source, rootDist, { recursive: true, force: true });
console.log('Copied frontend build to root dist.');
