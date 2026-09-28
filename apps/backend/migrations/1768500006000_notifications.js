/* eslint-disable */

exports.up = (pgm) => {
  pgm.createTable('user_notification_filters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    sectors: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    states: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    districts: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    keywords: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    min_value: { type: 'numeric' },
    max_value: { type: 'numeric' },
    email_enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('user_notification_filters', ['company_id'], { ifNotExists: true });

  pgm.createTable('notifications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies(id)', onDelete: 'CASCADE' },
    tender_id: { type: 'uuid', notNull: true, references: 'tenders(id)', onDelete: 'CASCADE' },
    filter_id: { type: 'uuid', notNull: true, references: 'user_notification_filters(id)', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    message: { type: 'text', notNull: true },
    is_read: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
  pgm.createIndex('notifications', ['company_id', 'created_at'], { ifNotExists: true });
  pgm.createIndex('notifications', ['company_id', 'is_read'], { ifNotExists: true });
  // A given filter rule should only ever notify a company about the same
  // tender once, even if the daily cron re-scans overlapping windows.
  pgm.addConstraint('notifications', 'notifications_company_tender_filter_unique', {
    unique: ['company_id', 'tender_id', 'filter_id'],
  });
};
