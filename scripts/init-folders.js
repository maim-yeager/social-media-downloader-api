#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || '/data';

const dirs = [
  DATA_PATH,
  path.join(DATA_PATH, 'cookies'),
  path.join(DATA_PATH, 'temp'),
  path.join(DATA_PATH, 'temp', 'incomplete'),
  path.join(DATA_PATH, 'temp', 'failed'),
  path.join(DATA_PATH, 'temp', 'previews'),
  path.join(DATA_PATH, 'cache'),
  path.join(DATA_PATH, 'cache', 'metadata'),
  path.join(DATA_PATH, 'cache', 'thumbnails'),
  path.join(DATA_PATH, 'cache', 'previews'),
  path.join(DATA_PATH, 'cache', 'formats'),
  path.join(DATA_PATH, 'cache', 'media'),
  path.join(DATA_PATH, 'logs'),
  path.join(DATA_PATH, 'backups'),
];

dirs.forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`✓ ${dir}`);
});

console.log('\n✅ All directories initialized.');
