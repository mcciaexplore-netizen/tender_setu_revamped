/* eslint-disable */

exports.up = (pgm) => {
  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS gem_seller_id VARCHAR(100);');
  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS gem_primary_category VARCHAR(150);');
};
