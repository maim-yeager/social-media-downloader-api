#!/usr/bin/env node
require('dotenv').config();

async function migrate() {
  const { initDatabase } = require('../src/utils/db');
  await initDatabase();
  console.log('✅ Database migrations complete.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
