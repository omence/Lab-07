'use strict';

const express = require('express');
const cors = require('cors');
//const superagent = require('superagent');

require('dotenv').config();

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());

//location functions
app.get('/location', (request, response) => {
  console.log('my request object:', request.body);
  const locData = searchToLatLong(request.query.data);
  response.send(locData);
});

function searchToLatLong(query) {
  const geoData = require('./data/location.json');
  const location = new Location(geoData.results[0]);
  location.search_query = query;
  return location;
}

function Location(data) {
this.formatted_query = data.formatted_address;
this.latitude = data.geometry.location.lat;
this.longitude = data.geometry.location.lng;
};

//Weather functions
app.get('/weather', (request, response) => {
  console.log('my request object:', request.body);
  const weaData = getWeatherData(request.query.data);
  response.send(weaData);
});

function Weather(data) {
  this.time = data.time;
  this.forcast = data.summary;
};

function getWeatherData(query) {
  const weatherData = require('./data/weather.json');
  const weather = new Weather(weatherData.daily);
  weather.search_query = query;
  return weather;
};


function handleError(err, res) {
  console.log(error);
  if (res) res.status(500).send('something broke');
}

app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
