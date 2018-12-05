'use strict';

const express = require('express');
const superagent = require('superagent');
const app = express();
const cors = require('cors');
const PORT = process.env.PORT || 3000;

require('dotenv').config();

app.use(cors());



app.get('/location', (request, response) => {
  searchToLatLong(request.query.data)
    .then(location => response.send(location))
    .catch(error => handleError (error, response));
});


app.get('/weather', getWeatherData);


function Location(query, res) {
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.search_query = query;
};


function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
};


function searchToLatLong(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(url)
    .then(res => {
      return new Location(query, res);
    })
    .catch(error => handleError (error));
}


function getWeatherData(request, response) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
  superagent.get(url)
    .then(result => {
      const weatherSum = result.body.daily.data.map(day => {
        return new Weather(day);
      });
      response.send(weatherSum);
    })
    .catch(error => handleError (error));
}
//yelp

app.get('/yelp', getYelpData);

function Yelp(businesses) {
  this.name = businesses.name;
  this.rating = businesses.rating;
  this.price = businesses.price;
  this.url = businesses.url;
  this.image_url = businesses.image_url;
};

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
 //movies

app.get('/movies', getMovieData);

function Movie(data) {
  this.title = data.title;
  //this.avarage_votes = avarage_votes;
  this.popularity = data.popularity;
  this.released_on = data.released_on;
  this.image_url = 'https://image.tmdb.org/t/p/w370_and_h556_bestv2/' + data.poster_path;
};

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
function handleError(error, response) {
  console.log(error);
  if (response) response.status(500).send('something broke');
}

app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
