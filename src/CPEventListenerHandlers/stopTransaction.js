const _ = require('lodash');
const authorize = require('./authorize');
const calculateEnergyValues = require('./calculateEnergyValues');
const statusNotification = require('./statusNotification');
const sqlite = require('../db');

module.exports = async function stopTransaction(
  cpdata,
  params,
  log,
  emit,
  setState,
) {
  try {
    // Performing authorization
    await authorize(cpdata, _.get(params, 'id_tag'));

    log('Authorization successful', 'success');

    // Stopping the transaction
    const endedAt = new Date();
    const startedAt = new Date(_.get(params, 'started_at'));
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

    // Stopping Transaction
    const response = await cpdata.ocpp.stopTransaction(
      _.get(params, 'id_tag'),
      _.get(cpdata, 'state.meterValue'),
      endedAt,
      _.get(params, 'transaction_id'),
    );
    if (!response.ok) {
      throw new Error('Unable to Stop transaction');
    }

    // Setting the state of Charge point to SuspendedEVSE
    await statusNotification(
      cpdata,
      _.get(params, 'id'),
      'SuspendedEVSE',
      setState,
    );

    if (
      _.get(
        cpdata,
        `state.connectors[${_.chain(params)
          .get('id')
          .subtract(1)
          .value()}].auto_lock`,
      ) === 1
    ) {
      _.set(
        cpdata,
        `state.connectors[${_.chain(params)
          .get('id')
          .subtract(1)
          .value()}].auto_lock`,
        0,
      );
    }

    log(
      `Connector ${_.get(params, 'id')} stopped Charging, txId: ${_.get(
        params,
        'transaction_id',
      )}`,
      'success',
    );

    // Updating the transaction end time, last meter value and energy consumed
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
    cpdata.ocpp.event.emit('transaction_stopped', transaction);
    return emit('transaction_removed', transaction);
  } catch (error) {
    return log(error.message, 'danger');
  }
};
