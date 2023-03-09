const _ = require('lodash');
const socketLib = require('./socket');
const { Chargepoint } = require('./chargepoint-json');
const initialState = require('./utils/initialState');
const setCPEventListeners = require('./utils/setCPEventListeners');
const commandHanlders = require('./CPEventListenerHandlers/handlers');
const cpSqlite = require('./cpDb');

const deployed = {};

const getLoggger =
  (cpdata, cpid) =>
  (text, type = 'info') => {
    const time = new Date();
    cpdata.io.emit('log', {
      type,
      text,
      time,
    });
    cpSqlite(`cp_${cpid}`).then(cpDb => {
      cpDb.run('INSERT INTO logs(time, text, type) VALUES (?,?,?)', [
        time.toISOString(),
        text,
        type,
      ]);
    });
  };

module.exports.getLoggger = getLoggger;

function modifyState(state, path, value, socket) {
  _.set(state, path, value);
  socket.emit('state_change', { path, value });
}

module.exports.modifyState = modifyState;

function setUpSocketListners(cpid) {
  const cpdata = module.exports.get(cpid);

  if (!cpdata) {
    return undefined;
  }

  const log = getLoggger(cpdata, cpid);

  const setState = (p, v) => modifyState(cpdata.state, p, v, cpdata.io);

  setCPEventListeners(cpdata, setState, log);

  return cpdata.io.on('connect', socket => {
    socket.on('command', data => {
      const command = _.get(data, 'type');
      const params = _.get(data, 'params', {});

      const handler = _.get(commandHanlders, command, () =>
        log(`Unknown command received: ${command}`, 'danger'),
      );

      handler({
        cpdata,
        log,
        setState,
        emit: (...args) => socket.emit(...args),
        params,
      });
    });
  });
}

module.exports.add = cp => {
  const ocpp = Chargepoint({
    endpoint: cp.csms_endpoint,
    cpid: cp.id,
    version: /* cp.ocpp_v */ 'ocpp1.6',
  });
  const state = initialState({
    connectors: cp.connectors,
  });
  const socketNsp = socketLib.namespace(`/cp/${cp.id}`);
  deployed[cp.id] = {
    cp,
    io: socketNsp,
    state,
    ocpp,
  };

  setUpSocketListners(cp.id);
};

module.exports.remove = cpid => {
  delete deployed[cpid];
};

module.exports.get = cpid => deployed[cpid];

module.exports.getAll = () => deployed;
