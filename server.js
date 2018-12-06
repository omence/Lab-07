'use strict';

const express = require('express');
const superagent = require('superagent');
const app = express();
const cors = require('cors');
const pg = require('pg');
const PORT = process.env.PORT || 3000;
require('dotenv').config();

const client = new pg.Client(process.env.DATABASE_ULR);
client.connect();
client.on('error', error => console.log(error));

app.use(cors());

//location functions
app.get('/location', getLocation);
//construntor
function Location(query, res) {
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.search_query = query;
};
//pull from cache or make request
function getLocation(request, response) {
  const locationHandler = {
    query: request.query.data,
    cacheHit: (results) => {
      console.logs('got from SQL');
      response.send(results.rows[0]);
    },
    cacheMiss: () => {
      Location.fetchToLatLong(request.query.data)
      .then(data => response.send(data));
    },
  };
  Location.lookupLocation(locationHandler);
}
//save to DB
Location.prototype.save = function() {
  let SQL = `
  INSERT INTO locations
  (search_query,formatted_query,latitude,longitude)
  VALUES($1,$2,$3,$4)
  RETURNING id
  `;
  let values = Object.values(this);
  return client.query(SQL, values);
};
//fetch from api save to db
Location.fetchToLatLong = (query) => {
  const _URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(_URL)
    .then( data => {
      console.log('Got data from API');
      if ( ! data.body.results.length ) { throw 'No Data'; }
      else {
        // Create an instance and save it
        let location = new Location(query, data.body.results[0]);
        return location.save()
          .then( result => {
            location.id = result.rows[0].id
            return location;
          })
        return location;
      }
    });
};
//location from db
Location.lookupLocation = (handler) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [handler.query];
  return client.query(SQL, values)
  .then(results => {
    if (results.rowCount > 0) {
      handler.cacheHit(results);
    }
    else {
      handler.cacheMiss();
    }
  })
  .catch(console.error);
};

//weather functions
app.get('/weather', getWeatherData);
//weather constructor
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
};
//weather save
Weather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (forecast, time, location_id) VALUES ($1, $2, $3);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};
//look up weather in DB
Weather.lookup =function(handler) {
  const SQL = `SELECT * FROM weathers WHERE location_id=$1`;
  client.query(SQL, [handler.location.id])
  .then(result => {
    if(result.rowCount > 0) {
      handler.cacheHit(result);
    }
    else {
      console.log('got data from api');
      handler.chacheMiss();
    }
  })
  .catch(error => handleError(error))
};
//weather helper
Weather.getWeatherData(query) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${location.latitude},${location.longitude}`;
  superagent.get(url)
    .then(result => {
      const weatherSum = result.body.daily.data.map(day => {
        const summary = new Weather(day);
        summary.save(location.id);
        return summary;
      });
      return weatherSum;
    });
};

//yelp functions
app.get('/yelp', getYelpData);
//constructor
function Yelp(businesses) {
  this.name = businesses.name;
  this.rating = businesses.rating;
  this.price = businesses.price;
  this.url = businesses.url;
  this.image_url = businesses.image_url;
};
//helper
function getYelpData(request, response) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${request.query.data.latitude},${request.query.data.longitude}`;
  superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpSum = result.body.businesses.map(businesses => {
        return new Yelp(businesses);
      });
      response.send(yelpSum);
    })
    .catch(error => handleError (error));
};

//movies function
app.get('/movies', getMovieData);
//constructor
function Movie(data) {
  this.title = data.title;
  this.popularity = data.popularity;
  this.released_on = data.released_on;
  this.image_url = 'https://image.tmdb.org/t/p/w370_and_h556_bestv2/' + data.poster_path;
};
//helper
function getMovieData(request, response) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${request.query.data.search_query}`;
  superagent.get(url)
    .then(result => {
      const movieSum = result.body.results.map(data => {
        return new Movie(data);
      });
      response.send(movieSum);
    })
    .catch(error => handleError (error));
};


//error function
function handleError(error, response) {
  console.log(error);
  if (response) response.status(500).send('something broke');
}

//database functions







app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
