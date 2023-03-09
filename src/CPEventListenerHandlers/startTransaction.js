const _ = require('lodash');
const authorize = require('./authorize');
const statusNotification = require('./statusNotification');
const sqlite = require('../db');

module.exports = async function startTransaction(
  cpdata,
  params,
  log,
  emit,
  setState,
  cp,
) {
  try {
    // Performing authorization
    await authorize(cpdata, _.get(params, 'id_tag'));

    log('Authorization successful', 'success');

    // Setting the state of Charge point to charging
    _.set(
      cpdata,
      `state.connectors[${_.chain(params)
        .get('id')
        .subtract(1)
        .value()}].status`,
      'Charging',
    );
    setState('connectors', cpdata.state.connectors);

    // Starting the transaction
    const startedAt = new Date();
    const response = await cpdata.ocpp.startTransaction(
      _.get(params, 'id'),
      _.get(params, 'id_tag'),
      _.get(cpdata, 'state.meterValue', 0),
      startedAt,
    );
    if (!response.ok) {
      throw new Error('Unable to start Transaction');
    }

    // Saving the transaction entry to DB
    const db = await sqlite;
    await db.run(
      'INSERT INTO transactions (id, cpid, connector_id, id_tag, meter_start, started_at) VALUES (?,?,?,?,?,?)',
      [
        _.get(response, 'payload.transactionId'),
        _.get(cp, 'id'),
        _.get(params, 'id'),
        _.get(params, 'id_tag'),
        _.get(cpdata, 'state.meterValue'),
        startedAt.toISOString(),
      ],
    );

    await statusNotification(cpdata, _.get(params, 'id'), 'Charging', setState);

    // Inform frontend
    emit('transaction_added', {
      id: _.get(response, 'payload.transactionId'),
      cpid: _.get(cp, 'id'),
      connector_id: _.get(params, 'id'),
      id_tag: _.get(params, 'id_tag'),
      meter_start: _.get(cpdata, 'state.meterValue'),
      meter_stop: 0,
      started_at: startedAt.toISOString(),
      ended_at: '',
      energy_consumed: 0,
    });
    return log(
      `Connector ${_.get(params, 'id')} on Charging, txId: ${_.get(
        response,
        'payload.transactionId',
      )}`,
      'success',
    );
  } catch (error) {
    return log(error.message, 'danger');
  }
};
