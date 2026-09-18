/* eslint-disable */

exports.up = (pgm) => {
  pgm.createTable('tender_questions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    tender_id: { type: 'uuid', notNull: true, references: 'tenders(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'company_users(id)', onDelete: 'CASCADE' },
    question: { type: 'text', notNull: true },
    response: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('tender_questions', ['company_id', 'tender_id', 'created_at'], { ifNotExists: true });

  pgm.createTable('company_invitations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    created_by_user_id: { type: 'uuid', notNull: true, references: 'company_users(id)', onDelete: 'CASCADE' },
    email: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, check: "role IN ('owner', 'bid_manager', 'viewer')" },
    token_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    accepted_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('company_invitations', ['company_id', 'created_at'], { ifNotExists: true });
  pgm.createIndex('company_invitations', ['email', 'expires_at'], { ifNotExists: true });
};
