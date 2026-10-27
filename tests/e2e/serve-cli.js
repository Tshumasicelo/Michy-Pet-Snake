/* npm run serve: plays the game at http://127.0.0.1:8080 for testing in a desktop browser. */
'use strict';
const path = require('path');
const { serve } = require('./server');

const port = Number(process.env.PORT) || 8080;
serve(path.join(__dirname, '..', '..', 'web'), port).then(() => {
  console.log(`Michy's Pet Snake is running at http://127.0.0.1:${port}/ (Ctrl+C to stop)`);
});
