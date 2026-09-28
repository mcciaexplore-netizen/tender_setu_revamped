/* eslint-disable */

exports.up = (pgm) => {
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS one_pager_data JSONB;');
};
