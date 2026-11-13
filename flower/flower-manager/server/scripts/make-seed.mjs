import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..', '..');
const dataFile = path.join(appRoot, 'data.js');
const output = path.resolve(__dirname, '..', 'seed.json');

const code = fs.readFileSync(dataFile, 'utf8');
const context = vm.createContext({
  window: { crypto: crypto.webcrypto },
  console,
  Date,
  Intl,
  Math,
  JSON,
  Number,
  String,
  Object,
  Array,
  Set,
  Map,
  Boolean,
  RegExp,
  parseFloat,
  parseInt,
  isNaN,
  isFinite
});
vm.runInContext(code, context);
const seed = vm.runInContext('createSeedState()', context);
fs.writeFileSync(output, JSON.stringify(seed, null, 2), 'utf8');
console.log(`seed written: ${output} (${seed.flowers.length} flowers, ${seed.orders.length} orders)`);
