export const DOMAIN_TABLES = [
  'account_link_challenges',
  'account_merge_audit',
  'chat_contexts',
  'chat_members',
  'chat_messages',
  'chats',
  'cities',
  'client_trust_events',
  'client_trust_scores',
  'districts',
  'marketing_campaign_recipients',
  'marketing_campaigns',
  'marketing_repeat_log',
  'marketing_repeat_settings',
  'master_followers',
  'master_marketing_subscriptions',
  'master_profile_views',
  'master_profiles',
  'master_promotions',
  'master_reviews',
  'master_showcases',
  'master_stories',
  'master_story_views',
  'request_dispatches',
  'request_responses',
  'service_bookings',
  'service_requests',
  'user_addresses',
  'user_identities',
  'user_locations',
  'user_sessions',
  'users',
]

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`

const isSafeTestDatabaseName = (value) => /\btest\b/i.test(String(value ?? ''))

export const resetIntegrationDb = async (pool) => {
  if (!pool) {
    throw new Error('resetIntegrationDb requires pg pool instance.')
  }
  const currentDbResult = await pool.query('SELECT current_database() AS name')
  const currentDbName = String(currentDbResult.rows?.[0]?.name ?? '').trim()
  const allowAnyDatabase = String(process.env.INTEGRATION_DB_ALLOW_ANY ?? '')
    .trim()
    .toLowerCase()
  if (
    !isSafeTestDatabaseName(currentDbName) &&
    allowAnyDatabase !== '1' &&
    allowAnyDatabase !== 'true'
  ) {
    throw new Error(
      `Refusing TRUNCATE on non-test database "${currentDbName}". ` +
        'Set INTEGRATION_DB_ALLOW_ANY=1 only for explicit local debugging.'
    )
  }
  const existingTablesResult = await pool.query(
    `
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
      ORDER BY tablename ASC
    `,
    [DOMAIN_TABLES]
  )
  const existingTables = existingTablesResult.rows
    .map((row) => String(row.tablename ?? '').trim())
    .filter(Boolean)
  if (!existingTables.length) return
  const quotedTables = existingTables.map(quoteIdentifier).join(', ')
  await pool.query(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`)
}
