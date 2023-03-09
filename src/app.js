const path = require('path');
const Express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const _ = require('lodash');
const ejsEngine = require('ejs-locals');
const authorizer = require('./authorizer');
const dashboard = require('./dashboard');

const app = Express();

module.exports = app;

// Applying middlewares
app.engine('ejs', ejsEngine);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(
  '/static',
  Express.static(path.join(__dirname, '..', 'public'), {
    cacheControl: true,
    immutable: true,
    maxAge: '7 days',
  }),
);
app.get('/favicon.ico', (req, res) => res.redirect('/static/favicon.ico'));

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const password = _.get(req, 'body.password');
  if (!password) {
    return res.sendStatus(401);
  }

  if (!_.isEqual(password, process.env.PASSWORD)) {
    return res.sendStatus(401);
  }

  authorizer.setToken(res)();
  return res.sendStatus(201);
});

app.get('/logout', (req, res) => authorizer.logout(res).redirect('/login'));

app.use('/dashboard', authorizer.middleware, dashboard);

// 404
app.all('*', (req, res) => res.sendStatus(404));
