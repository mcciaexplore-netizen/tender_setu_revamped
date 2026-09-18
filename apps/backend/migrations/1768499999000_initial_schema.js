/* eslint-disable */
const fs = require('fs');
const path = require('path');

exports.up = (pgm) => {
  const schemaSql = fs.readFileSync(path.join(__dirname, '../neon/schema.sql'), 'utf8');
  pgm.sql(schemaSql);
};

exports.down = (pgm) => {
  pgm.dropTable('ingestion_logs', { ifExists: true, cascade: true });
  pgm.dropTable('review_queue', { ifExists: true, cascade: true });
  pgm.dropTable('applied_tenders', { ifExists: true, cascade: true });
  pgm.dropTable('saved_tenders', { ifExists: true, cascade: true });
  pgm.dropTable('matches', { ifExists: true, cascade: true });
  pgm.dropTable('tenders', { ifExists: true, cascade: true });
  pgm.dropTable('past_projects', { ifExists: true, cascade: true });
  pgm.dropTable('companies', { ifExists: true, cascade: true });
};
