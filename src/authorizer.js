const _ = require('lodash');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'evt_sim_token';

module.exports.middleware = (req, res, next) => {
  const unauthorized = () =>
    res.redirect(`/login?next=${encodeURIComponent(`/dashboard/${req.url}`)}`);

  const token = _.get(req, `cookies.${COOKIE_NAME}`);
  if (!token) {
    return unauthorized();
  }

  // Parse the cookie
  return jwt.verify(token, process.env.TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return unauthorized();
    }
    req.user = decoded;
    return next();
  });
};

module.exports.setToken = res => {
  const token = jwt.sign({}, process.env.TOKEN_SECRET, {
    expiresIn: '2h',
  });

  return () =>
    res.cookie(COOKIE_NAME, token, {
      expires: 0,
      httpOnly: true,
      sameSite: true,
      // secure: process.env.NODE_ENV === 'production',
    });
};

module.exports.logout = res => res.clearCookie(COOKIE_NAME);
