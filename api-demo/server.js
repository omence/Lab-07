'use strict';

// application dependencies
const express = require('express');
const cors = require('cors');

// get project environment variables
require('dotenv').config();

// application constants
const PORT = process.env.PORT || 3000;
const app = express();

// application middleware (not that important yet)
app.use(cors());

app.get('/testroute', function(request, response) {
  let animal = { type: 'turtle', name: 'tim' };
  response.json(animal);
});

app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
