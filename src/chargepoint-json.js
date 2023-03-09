const _ = require('lodash');
const OCPPTaskManager = require('ocpp-task-manager');
const WebSocket = require('ws');
const url = require('url');
const { EventEmitter } = require('events');
const RemoteStartTransaction = require('./callHandlers/RemoteStartTransaction');
const RemoteStopTransaction = require('./callHandlers/RemoteStopTransaction');
const ResetCharger = require('./callHandlers/Reset');
const DataTransfer = require('./callHandlers/DataTransfer');
const ChangeAvailability = require('./callHandlers/ChangeAvailability');
const GetConfiguration = require('./callHandlers/GetConfiguration');
const UnlockConnector = require('./callHandlers/UnlockConnector');

module.exports.Chargepoint = function ChargepointJSON({
  endpoint,
  cpid,
  version = 'ocpp1.6',
}) {
  const cpinfo = {
    chargeBoxSerialNumber: '',
    chargePointModel: '',
    chargePointSerialNumber: '',
    chargePointVendor: '',
    firmwareVersion: '',
    iccid: '',
    imsi: '',
    meterSerialNumber: '',
    meterType: 'Digital',
  };
  const event = new EventEmitter();

  const logger = {
    info(...log) {
      event.emit('log', { type: 'info', text: log.join(' ') });
    },
    success(...log) {
      event.emit('log', { type: 'success', text: log.join(' ') });
    },
    danger(...log) {
      event.emit('log', { type: 'danger', text: log.join(' ') });
    },
  };

  let ws = null;
  let sender = _.noop;
  let connected = false;
  event.on('connected', () => {
    connected = true;
  });
  event.on('disconnected', () => {
    connected = false;
  });

  const device = OCPPTaskManager({
    sender: message => {
      logger.info('>>> Sending', message);
      sender(message);
    },
    callHandlers: {
      RemoteStartTransaction: (...args) =>
        RemoteStartTransaction(...args, cpid),
      RemoteStopTransaction: (...args) => RemoteStopTransaction(...args, cpid),
      Reset: (...args) => ResetCharger(...args, cpid),
      DataTransfer: (...args) => DataTransfer(...args, cpid),
      ChangeAvailability: (...args) => ChangeAvailability(...args, cpid),
      UnlockConnector: (...args) => UnlockConnector(...args, cpid),
      GetConfiguration: (...args) => GetConfiguration(...args, cpid),
    },
  });

  // Status Notification
  function statusNotification(connectorId, status) {
    const errorCode = 'NoError'; // Keeping it NoError for Now

    return device.sendCall('StatusNotification', {
      connectorId: _.toSafeInteger(connectorId),
      errorCode,
      status,
    });
  }

  function bootNotification(cpinformation = cpinfo) {
    logger.success('Sending BootNotification');
    return device.sendCall('BootNotification', cpinformation);
  }

  async function startHeartbeatLoop(interval = 0) {
    logger.info('Sending heartbeat...', interval);
    const result = await device.sendCall('Heartbeat');

    if (interval) {
      setTimeout(() => {
        if (connected) {
          startHeartbeatLoop(interval);
        }
      }, interval * 1000);
    }

    return result;
  }

  function connect() {
    if (ws instanceof WebSocket) {
      ws.close(1001, 'Closed due to re-connect attempt');
    }
    ws = new WebSocket(url.resolve(endpoint + '/', cpid), version);

    sender = msg => ws.send(msg);

    ws.on('open', async () => {
      try {
        device.connected(`${version}j`);
        event.emit('connected');
        logger.success('Connection established');
      } catch (error) {
        logger.danger(error.message);
      }
    });

    ws.on('close', () => {
      event.emit('disconnected');
      device.disconnected();
    });

    ws.on('error', error => {
      logger.danger('Connection error', error.message);
    });

    ws.on('message', data => {
      logger.info('<<< Received', data);
      device.received(data);
    });
  }

  function disconnect(code = 1000, reason = '') {
    if (!(ws instanceof WebSocket)) {
      return undefined;
    }

    return ws.close(code, reason);
  }

  function startTransaction(connectorId, idTag, meterStart, timestamp) {
    logger.info('Starting Transaction...');
    return device.sendCall('StartTransaction', {
      connectorId,
      idTag,
      meterStart,
      timestamp,
    });
  }

  function authorize(idTag) {
    logger.info('Initiating Authorization...');
    return device.sendCall('Authorize', {
      idTag,
    });
  }

  function stopTransaction(idTag, meterStop, timestamp, transactionId) {
    logger.info('Stopping Transaction...');
    return device.sendCall('StopTransaction', {
      idTag,
      meterStop,
      timestamp,
      transactionId,
    });
  }

  return {
    connect,
    disconnect,
    bootNotification,
    startHeartbeatLoop,
    startTransaction,
    authorize,
    stopTransaction,
    statusNotification,
    UnlockConnector,
    event,
  };
};
