'use strict';
const esbuild = require('esbuild');
const path = require('path');
esbuild.build({
  entryPoints: [path.join(__dirname, 'three-entry.js')],
  bundle: true, minify: true, format: 'iife', target: 'chrome110',
  outfile: path.join(__dirname, '..', '..', 'src', 'renderer', 'vendor', 'three.bundle.js'),
  legalComments: 'none', logLevel: 'info',
}).catch(() => process.exit(1));
