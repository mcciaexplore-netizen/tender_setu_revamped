const path = require('path');

let app;
let loadError;
try {
  const mod = require(path.join(__dirname, '../apps/backend/dist/index.js'));
  app = mod.default || mod;
} catch (err) {
  loadError = err;
  // eslint-disable-next-line no-console
  console.error('Backend module failed to load:', err);
}

module.exports = (req, res) => {
  if (!app) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Backend module failed to load',
        message: loadError && loadError.message,
        stack: loadError && loadError.stack,
      }),
    );
    return;
  }
  return app(req, res);
};
