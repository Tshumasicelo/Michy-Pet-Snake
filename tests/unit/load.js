/* Loads the browser game scripts into Node so the tests exercise the real files. */
'use strict';
const path = require('path');

const WEB = path.join(__dirname, '..', '..', 'web', 'js');
for (const f of ['levels.js', 'engine.js', 'storage.js', 'achievements.js', 'sprites.js', 'render.js']) require(path.join(WEB, f));

module.exports = globalThis.MPS;
