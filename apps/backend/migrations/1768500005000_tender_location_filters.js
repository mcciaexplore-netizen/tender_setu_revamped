/* eslint-disable */

exports.up = (pgm) => {
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS district TEXT;');
  pgm.sql("ALTER TABLE tenders ADD COLUMN IF NOT EXISTS authority_type TEXT NOT NULL DEFAULT 'state';");
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenders_authority_type_check'
      ) THEN
        ALTER TABLE tenders ADD CONSTRAINT tenders_authority_type_check
          CHECK (authority_type IN ('state', 'central', 'psu'));
      END IF;
    END $$;
  `);
  pgm.createIndex('tenders', ['authority_type', 'state', 'district'], {
    name: 'idx_tenders_location',
    ifNotExists: true,
  });
};
