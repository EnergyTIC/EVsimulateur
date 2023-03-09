const _ = require('lodash');
const authorize = require('./authorize');
const calculateEnergyValues = require('./calculateEnergyValues');
const statusNotification = require('./statusNotification');
const sqlite = require('../db');

// eslint-disable-next-line consistent-return
module.exports = async function unplug(cpdata, params, log, emit, setState) {
  try {
    // First Check if any transaction in going on the Connector
    const transactionStatus = _.get(
      cpdata,
      `state.connectors[${_.chain(params)
        .get('id')
        .subtract(1)
        .value()}].status`,
    );
    const autoLock = _.get(
      cpdata,
      `state.connectors[${_.chain(params)
        .get('id')
        .subtract(1)
        .value()}].auto_lock`,
    );

    if (transactionStatus === 'Charging' && autoLock === 0) {
      // Performing authorization
      await authorize(cpdata, _.get(params, 'id_tag'));

      log('Authorization successful', 'success');

      // Stopping the transaction
      const startedAt = new Date(_.get(params, 'started_at'));
      const endedAt = new Date();
      const timeConsumed = (endedAt.getTime() - startedAt.getTime()) / 3600000;

      // Calculate meter Value
      const latestMeterValue = Math.round(
        calculateEnergyValues.calculateLatestMeterValue(
          20,
          Math.abs(timeConsumed),
          _.get(cpdata, 'state.meterValue'),
        ),
      );
      // Update meter value
      _.set(cpdata, 'state.meterValue', latestMeterValue);
      setState('meterValue', latestMeterValue);
      const response = await cpdata.ocpp.stopTransaction(
        _.get(params, 'id_tag'),
        _.get(cpdata, 'state.meterValue', 0),
        endedAt,
        _.get(params, 'transaction_id'),
      );
      if (!response.ok) {
        throw new Error('Unable to Stop transaction');
      }

      log(
        `Connector ${_.get(params, 'id')} stopped Charging, txId: ${_.get(
          params,
          'transaction_id',
        )}`,
        'success',
      );

      // Updating the transaction end time
      const db = await sqlite;
      await db.run(
        'UPDATE transactions SET ended_at = ?, meter_stop = ? WHERE id = ?',
        [
          endedAt.toISOString(),
          latestMeterValue,
          _.get(params, 'transaction_id'),
        ],
      );

      // Fetch Stopped transaction
      const transaction = await db.get(
        'SELECT * FROM transactions WHERE id = ?',
        _.get(params, 'transaction_id'),
      );

      emit('transaction_modified', transaction);
      emit('transaction_removed', transaction);

      await statusNotification(
        cpdata,
        _.get(params, 'id'),
        'Available',
        setState,
      );

      return log(`Connector ${_.get(params, 'id')} unplugged.`, 'success');
    }
    if (transactionStatus === 'Charging' && autoLock === 1) {
      return log('Connector Locked', 'danger');
    }
    if (
      (transactionStatus === 'SuspendedEVSE' ||
        transactionStatus === 'SuspendedEV') &&
      autoLock === 0
    ) {
      await statusNotification(
        cpdata,
        _.get(params, 'id'),
        'Available',
        setState,
      );
      return log(`Connector ${_.get(params, 'id')} unplugged.`, 'success');
    }
    if (transactionStatus === 'Preparing') {
      await statusNotification(
        cpdata,
        _.get(params, 'id'),
        'Available',
        setState,
      );
      return log(`Connector ${_.get(params, 'id')} unplugged.`, 'success');
    }
  } catch (error) {
    return log(error.message, 'danger');
  }
};
