'use strict';

const express = require('express');
const superagent = require('superagent');
const app = express();
const cors = require('cors');
const pg = require('pg');
const PORT = process.env.PORT || 3000;
require('dotenv').config();

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', error => console.log(error));

app.use(cors());

//location functions
app.get('/location', getLocation);
//pull from cache or make request
function getLocation(request, response) {
  const locationHandler = {
    query: request.query.data,
    cacheHit: (results) => {
      console.log('got from SQL');
      response.send(results.rows[0]);
    },
    cacheMiss: () => {
      Location.fetchToLatLong(request.query.data)
      .then(data => response.send(data));
    },
  };
  Location.lookupLocation(locationHandler);
}

function deleteTable(table, city) {
  const SQL = `DELETE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}
//construntor
function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
  
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
    .then(data => {
      console.log('Got data from API');
      if (! data.body.results.length) {throw 'No Data';}
      else {
        let location = new Location(query, data.body.results[0]);
        return location.save()
          .then(result => {
            location.id = result.rows[0].id
            return location;
          })
        return location;
      }
    
    });
};
// location from db
Location.lookupLocation = (handler) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [handler.query];

  return client.query(SQL, values)
    .then(results => {
      if (results.rowCount > 0) {
        handler.cacheHit(results);
      } else {
        handler.cacheMiss();
      }
    })
    .catch(console.error);
};

// // //weather functions
app.get('/weather', getWeather);

function getWeather(request, response) {
  const handler = {
    location: request.query.data,
    cacheHit: function(result) {
      response.send(result.rows);
    },
    cacheMiss: function() {
      Weather.fetch(request.query.data)
        .then( results => response.send(results) )
        .catch( console.error );
    },
  };

  Weather.lookup(handler);
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

Weather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (forecast, time, location_id, created_at) VALUES ($1, $2, $3, $4);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

Weather.lookup = function(handler) {
  const ageData = `SELECT * FROM weathers WHERE created_at=$4;`;
  const SQL = `SELECT * FROM weathers WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      let ageOfData = (Date.now() - ageData) / (1000 * 60);
      if(result.rowCount > 0 && ageOfData < 30) {
        console.log('Got data from SQL');
        handler.cacheHit(result);
      } else {
        deleteTable('weathers', SQL);
        console.log('Got data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

Weather.fetch = function(location) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${location.latitude},${location.longitude}`;

  return superagent.get(url)
    .then(result => {
      const weatherSum = result.body.daily.data.map(day => {
        const sum = new Weather(day);
        sum.save(location.id);
        return sum;
      });
      return weatherSum;
    });
};

//yelp functions
app.get('/yelp', getYelp);
//constructor
function Yelp(businesses) {
  this.name = businesses.name;
  this.rating = businesses.rating;
  this.price = businesses.price;
  this.url = businesses.url;
  this.image_url = businesses.image_url;
  this.created_at = Date.now();
};

function getYelp(request, response) {
  const hanlder = {
    location: request.query.data,
    cacheHit: function(result) {
      response.send(result.rows);
    },
    cacheMiss: function() {
      Yelp.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  Yelp.lookup(hanlder);
}
// //yelp save
Yelp.prototype.save = function(id) {
  const SQL = `INSERT INTO yelps (name,rating,price,url,image_url,created_at) VALUES ($1,$2,$3,$4,$5,$6);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};
// //look up yelp in DB
Yelp.lookup = function(handler) {
  const ageData = `SELECT * FROM yelps WHERE created_at=$6;`;
  const SQL = `SELECT * FROM yelps WHERE name=$1`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      let ageOfData = (Date.now() - ageData) / (1000 * 60);
      if(result.rowCount > 0 && ageOfData < 30) {
        console.log('got data from SQL');
        handler.cacheHit(result);
      } else {
        deleteTable('yelps', SQL);
        console.log('got data from api');
        handler.cacheMiss();
      }
    });
};
//fetch yelp
Yelp.fetch = function(location) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${location.latitude},${location.longitude}`;

  return superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpSum = result.body.businesses.map(businesses => {
        const summary = new Yelp(businesses);
        summary.save(location.id);
        return summary;
      });
      return yelpSum;
    });
};


// //movies function
app.get('/movies', getMovie);
// //constructor
function Movie(data) {
  this.title = data.title;
  this.popularity = data.popularity;
  this.released_on = data.released_on;
  this.image_url = 'https://image.tmdb.org/t/p/w370_and_h556_bestv2/' + data.poster_path;
  this.created_at = Date.now();
};
function getMovie(request, response) {
  const hanlder = {
    location: request.query.data,
    cacheHit: function(result) {
      response.send(result.rows);
    },
    cacheMiss: function() {
      Movie.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  Movie.lookup(hanlder);
}

Movie.prototype.save = function(id) {
  const SQL = `INSERT INTO moviesdbs (title,popularity,release_on,image_url,created_at) VALUES ($1,$2,$3,$4,$5);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

Movie.lookup = function(handler) {
  const ageData = `SELECT * FROM moviesdbs WHERE created_at=$6;`;
  const SQL = `SELECT * FROM moviesdbs WHERE title=$1`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      let ageOfData = (Date.now() - ageData) / (1000 * 60);
      if(result.rowCount > 0 && ageOfData < 30) {
        console.log('got data from SQL');
        handler.cacheHit(result);
      } else {
        deleteTable('moviesdbs', SQL);
        console.log('got data from api');
        handler.cacheMiss();
      }
    });
};

Movie.fetch = function(location) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${location.search_query}`;

  return superagent.get(url)
    .then(result => {
      const movieSum = result.body.results.map(data => {
        const summary = new Movie(data);
        summary.save(location.id);
        return summary;
      });
      return movieSum;
    });
};

app.get('/meetups', getMeetup);
// //constructor
function Meetup(data) {
  this.link = data.link;
  this.name = data.name;
  this.creation_date = new Date(data.created * 1000).toDateString();
  this.host = data.orginizer.name;
  this.created_at = Date.now();
};

function getMeetup(request, response) {
  const hanlder = {
    location: request.query.data,
    cacheHit: function(result) {
      response.send(result.rows);
    },
    cacheMiss: function() {
      Meetup.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    },
  };
  Meetup.lookup(hanlder);
}

Meetup.prototype.save = function(id) {
  const SQL = `INSERT INTO meetups (link,name,creation_date,host,created_at) VALUES ($1,$2,$3,$4,$5);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

Meetup.lookup = function(handler) {
  const ageData = `SELECT * FROM meetups WHERE created_at=$5;`;
  const SQL = `SELECT * FROM meetups WHERE name=$2`;
  client.query(SQL, [handler.location.id])
    .then(result => {
      let ageOfData = (Date.now() - ageData) / (1000 * 60);
      if(result.rowCount > 0 && ageOfData < 30) {
        console.log('got data from SQL');
        handler.cacheHit(result);
      } else {
        deleteTable('meetups', SQL);
        console.log('got data from api');
        handler.cacheMiss();
      }
    });
};

Meetup.fetch = function(location) {
  const url = `https://api.meetup.com/2/open_events?&key=${process.env.MEETUP_API_KEY}&sign=true&photo-host=public&lat=${location.latitude}&topic=softwaredev&lon=${location.longitude}&page=20`;

  return superagent.get(url)
    .then(result => {
      const meetupSum = result.body.results.map(data => {
        const summary = new Meetup(data);
        summary.save(location.id);
        return summary;
      });
      return meetupSum;
    });
};

app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
