/* eslint-disable */

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.createTable('company_users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: 'owner', check: "role IN ('owner', 'admin', 'bid_manager', 'viewer')" },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS personnel_credentials TEXT;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS url TEXT;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS state TEXT;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS personnel_requirements TEXT;');
  pgm.sql("ALTER TABLE tenders ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'needs_review';");
  pgm.sql("ALTER TABLE tenders ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN NOT NULL DEFAULT TRUE;");
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS extraction_notes TEXT;');
  pgm.sql('ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_personnel INTEGER NOT NULL DEFAULT 0;');
  pgm.sql('ALTER TABLE matches ADD COLUMN IF NOT EXISTS personnel_match BOOLEAN;');
  pgm.sql('ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS confidence_score INTEGER;');
  pgm.sql('ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS review_reason TEXT;');
  pgm.sql('ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS source TEXT;');
  pgm.sql('ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS parsed_data JSONB;');

  pgm.addConstraint('tenders', 'tenders_source_status_check', {
    check: "source_status IN ('live_scraped', 'template_sample', 'verified', 'needs_review')",
  });
  pgm.createIndex('tenders', ['source_status', 'deadline'], { ifNotExists: true });
  pgm.createIndex('company_users', ['company_id'], { ifNotExists: true });
};
