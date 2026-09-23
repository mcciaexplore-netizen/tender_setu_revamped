const path = require('path');
const app = require(path.join(__dirname, '../apps/backend/dist/index.js'));

module.exports = (req, res) => {
  const handler = app.default || app;
  return handler(req, res);
};
