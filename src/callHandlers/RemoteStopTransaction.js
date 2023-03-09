const _ = require('lodash');
const stopTransaction = require('../CPEventListenerHandlers/stopTransaction');
const deployedCps = require('../deployed-cps');
const sqlite = require('../db');

function isTransactionEligibleToStop(transaction) {
  if (!transaction) {
    return false;
  }

  if (_.get(transaction, 'ended_at')) {
    return false;
  }

  return true;
}

async function getTransactionById(id) {
  const db = await sqlite;
  return db.get('SELECT * FROM transactions WHERE id = ?', id);
}

module.exports = async (payload, { callResult, callError }, cpid) => {
  try {
    // Workaround for cicular dependency
    const { get: getCP, getLoggger, modifyState } = deployedCps;

    const { transactionId } = payload;
    const transaction = await getTransactionById(transactionId);

    if (isTransactionEligibleToStop(transaction)) {
      callResult({
        status: 'Accepted',
      });
    } else {
      return callResult({
        status: 'Rejected',
      });
    }

    const cpdata = getCP(cpid);
    const params = {
      transaction_id: transactionId,
      id_tag: _.get(transaction, 'id_tag'),
      id: _.get(transaction, 'connector_id'),
      started_at: _.get(transaction, 'started_at'),
    };
    const log = getLoggger(cpdata, cpid);
    const emit = (...args) => cpdata.io.emit(...args);
    const setState = (p, v) => modifyState(cpdata.state, p, v, cpdata.io);

    return stopTransaction(cpdata, params, log, emit, setState);
  } catch (error) {
    return callError('InternalError', error.message);
  }
};
