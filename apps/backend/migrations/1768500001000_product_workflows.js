/* eslint-disable */

exports.up = (pgm) => {
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS emd_amount NUMERIC;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS minimum_turnover NUMERIC;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS minimum_years_in_business INTEGER;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS allowed_entity_types TEXT[];');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS gem_category TEXT;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS udyam_priority BOOLEAN;');
  pgm.sql('ALTER TABLE tenders ADD COLUMN IF NOT EXISTS emd_exempt_msme BOOLEAN;');
  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS udyam_number TEXT;');
  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS gstin TEXT;');
  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS pan TEXT;');
  pgm.sql('ALTER TABLE companies ADD COLUMN IF NOT EXISTS gem_registered BOOLEAN NOT NULL DEFAULT FALSE;');

  pgm.createTable('company_documents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    document_type: { type: 'text', notNull: true },
    file_name: { type: 'text', notNull: true },
    storage_key: { type: 'text', notNull: true },
    mime_type: { type: 'text', notNull: true, default: 'application/pdf' },
    content: { type: 'bytea', notNull: true },
    expires_at: { type: 'timestamptz' },
    verified_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('company_documents', 'company_documents_type_check', {
    check: "document_type IN ('udyam', 'gst', 'pan', 'iso_certificate', 'past_project_proof', 'other')",
  });

  pgm.createTable('tender_applications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    tender_id: { type: 'uuid', notNull: true, references: 'tenders(id)', onDelete: 'CASCADE' },
    stage: { type: 'text', notNull: true, default: 'discovered' },
    notes: { type: 'text' },
    reminder_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.addConstraint('tender_applications', 'tender_applications_stage_check', {
    check: "stage IN ('discovered', 'interested', 'preparing', 'submitted', 'won', 'lost')",
  });
  pgm.addConstraint('tender_applications', 'tender_applications_company_tender_unique', {
    unique: ['company_id', 'tender_id'],
  });
  pgm.createIndex('tender_applications', ['company_id', 'stage'], { ifNotExists: true });
};
