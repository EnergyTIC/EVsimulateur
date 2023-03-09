/* eslint-disable no-param-reassign */
const _ = require('lodash');
const stopTransaction = require('./stopTransaction');
const unplug = require('./unplug');
const startTransaction = require('./startTransaction');
const { Chargepoint } = require('../chargepoint-json');
const initialState = require('../utils/initialState');
const statusNotification = require('./statusNotification');
const setCPEventListeners = require('../utils/setCPEventListeners');
const sqlite = require('../db');

module.exports = {
  connect2csms({ cpdata, log, setState }) {
    if (cpdata.state.power === 'on') {
      cpdata.ocpp.connect();
      cpdata.ocpp.event.once('connected', () => {
        cpdata.state.connectors.forEach(con => {
          statusNotification(cpdata, _.get(con, 'id'), 'Available', setState);
        });
      });
    } else {
      log("Power disconnected, can't connect to CSMS", 'danger');
    }
  },
  disconnect4Mcsms({ cpdata, setState }) {
    if (cpdata.state.connected === true) {
      cpdata.ocpp.disconnect();
      cpdata.state.connectors.forEach(con => {
        _.set(con, 'status', null);
      });
      setState('connectors', cpdata.state.connectors);
    }
  },
  disconnectPower({ cpdata, setState }) {
    cpdata.ocpp.disconnect();
    setState('power', 'off');
    // Stop the session also
  },
  connectPower({ setState, cpdata, log }) {
    setState('power', 'on');
    log('Connecting to Central System...');
    module.exports.connect2csms({ cpdata, log, setState });
    cpdata.ocpp.event.once('connected', () => {
      log('Sending Boot Notification...');
      module.exports['send.BootNotification']({ cpdata, log });
    });
  },
  undeploy({ cpdata }) {
    if (cpdata.state.connected === true) {
      cpdata.ocpp.disconnect();
    }
    cpdata.ocpp.event.removeAllListeners();
    cpdata.io.removeAllListeners();
  },
  async reboot({ cpdata, log, setState, emit }) {
    log('Rebooting...');
    // First get the connectors
    const connectors = _.get(cpdata, 'state.connectors', []);

    // copy the connectors with status "Preparing"
    const connectorsWithPreparingStatus = JSON.parse(
      JSON.stringify(_.filter(connectors, { status: 'Preparing' })),
    );

    // Filter the connectors with status === Charging
    const connectorsOnCharging = _.filter(
      connectors,
      con => _.get(con, 'status') === 'Charging',
    );

    if (connectorsOnCharging.length !== 0) {
      // first fetch the list of transactions with status === Charging
      const db = await sqlite;
      const result = _.map(connectorsOnCharging, conn =>
        db.get(
          'SELECT * FROM transactions WHERE cpid = ? AND connector_id = ? AND meter_stop IS NULL AND ended_at IS NULL',
          [_.get(conn, 'cpid'), _.get(conn, 'id')],
        ),
      );

      const ongoingTransactions = await Promise.all(result);

      // Stopping the Transactions one by one (waiting to be completed)
      log('Stopping all ongoing transactions...');
      const stoppedTransactions = ongoingTransactions.map(tr =>
        stopTransaction(
          cpdata,
          {
            id_tag: _.get(tr, 'id_tag'),
            transaction_id: _.toNumber(_.get(tr, 'id')),
            started_at: _.get(tr, 'started_at'),
            id: _.get(tr, 'connector_id'),
          },
          log,
          emit,
          setState,
        ),
      );

      await Promise.all(stoppedTransactions);
    }

    cpdata.ocpp.disconnect();
    setState('power', 'off');
    cpdata.ocpp.event.removeAllListeners();
    cpdata.ocpp = Chargepoint({
      endpoint: cpdata.cp.csms_endpoint,
      cpid: cpdata.cp.id,
      version: /* cp.ocpp_v */ 'ocpp1.6',
    });

    setTimeout(async () => {
      const connectorsWithNewStatuses = _.map(cpdata.state.connectors, conn => {
        const foundConnectorWithPreparingStatus = _.find(
          connectorsWithPreparingStatus,
          { id: conn.id },
        );
        if (_.isEmpty(foundConnectorWithPreparingStatus)) {
          return conn;
        }
        return foundConnectorWithPreparingStatus;
      });

      cpdata.state = initialState({
        connectors: connectorsWithNewStatuses,
      });
      emit('state_replace', cpdata.state);
      log('Rebooted');

      // Re-establishing connection to csms
      cpdata.ocpp.connect();
      cpdata.ocpp.event.once('connected', () => {
        // Send Boot Notification
        setTimeout(() => {
          // Waiting for some time to allow connected status to become true
          module.exports['send.BootNotification']({ cpdata, log });
        }, 500);
      });

      setCPEventListeners(cpdata, setState, log);
    }, 3000);
  },
  'send.BootNotification': async ({ cpdata, log }) => {
    try {
      // Sending only version, model and firmware version to the CS for now, keeping others as empty
      const { ok, payload } = await cpdata.ocpp.bootNotification({
        chargeBoxSerialNumber: '',
        chargePointModel: _.get(cpdata, 'cp.model'),
        chargePointSerialNumber: '',
        chargePointVendor: _.get(cpdata, 'cp.vendor'),
        firmwareVersion: _.get(cpdata, 'cp.firmware_version'),
        iccid: '',
        imsi: '',
        meterSerialNumber: '',
        meterType: 'Digital',
      });
      if (ok) {
        const interval = _.get(payload, 'interval', 90);
        cpdata.ocpp.startHeartbeatLoop(interval);
      } else {
        throw new Error(
          `CallError: ${payload.errorCode} ${payload.errorDescripton}`,
        );
      }
    } catch (error) {
      log(`Unable to send: ${error.message}`, 'danger');
    }
  },
  'send.Heartbeat': ({ cpdata, log }) =>
    cpdata.ocpp
      .startHeartbeatLoop(0)
      .catch(error => log(`Unable to send: ${error.message}`, 'danger')),
  'connector.plugin': ({ cpdata, setState, params }) => {
    statusNotification(cpdata, _.get(params, 'id'), 'Preparing', setState);
    // Ask for payment
  },
  'connector.StartTransaction': ({ cpdata, setState, params, log, emit }) =>
    startTransaction(cpdata, params, log, emit, setState, cpdata.cp),
  'connector.StopTransaction': ({ cpdata, setState, params, log, emit }) =>
    stopTransaction(cpdata, params, log, emit, setState),
  'connector.Unplug': ({ cpdata, params, setState, log, emit }) =>
    unplug(cpdata, params, log, emit, setState),
  'connector.ChargingComplete': ({ cpdata, params, setState }) => {
    _.set(
      cpdata,
      `state.connectors[${_.chain(params)
        .get('id')
        .subtract(1)
        .value()}].status`,
      'SuspendedEV',
    );
    setState('connectors', cpdata.state.connectors);
  },
};
