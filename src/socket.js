const _ = require('lodash');
const socketio = require('socket.io');

let io = null;
const namespaces = {};

module.exports.init = httpServer => {
  if (!_.isNull(io)) {
    throw new Error('Socket can not be initialized more than once');
  }
  io = socketio(httpServer);
};

module.exports.namespace = name => {
  if (_.isNull(io)) {
    throw new Error('Socket has not been initialized yet');
  }

  let nsp = _.get(namespaces, name);

  // ALready exists
  if (!_.isUndefined(nsp)) {
    return nsp;
  }

  // Create new
  nsp = io.of(name);
  _.set(namespaces, name, nsp);

  return nsp;
};
