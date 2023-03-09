const _ = require('lodash');

function setCPEventListeners(cpdata, setState, log) {
  cpdata.ocpp.event.on('log', logItem => {
    if (
      _.get(logItem, 'text', '') ===
      'Unable to send: Not connected yet, please call `connected()`'
    ) {
      return log(
        'Not connected to Central System',
        _.get(logItem, 'type', 'info'),
      );
    }
    return log(_.get(logItem, 'text', ''), _.get(logItem, 'type', 'info'));
  });
  cpdata.ocpp.event.on('connected', () => {
    setState('connected', true);
  });
  cpdata.ocpp.event.on('disconnected', () => {
    setState('connected', false);
    log('Disconnected', 'danger');
  });
}

module.exports = setCPEventListeners;
