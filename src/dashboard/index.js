const Express = require('express');
const chargepoints = require('./chargepoints');

const app = Express.Router();
module.exports = app;

app.use('/chargepoints', chargepoints);
app.get('/', (req, res) => res.redirect('/dashboard/chargepoints/deployed'));
app.get('/setup', (req, res) => res.render('dashboard/setup'));
