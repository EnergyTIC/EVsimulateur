const startTransaction = require('../CPEventListenerHandlers/startTransaction');
const deployedCps = require('../deployed-cps');

function isConnectorOccupied(/* cpid, connectorId */) {
  return false;
}

function getFreeConnector(/* cpid */) {
  return 1;
}

module.exports = async (payload, { callResult, callError }, cpid) => {
  // Workaround for cicular dependency
  const { get: getCP, getLoggger, modifyState } = deployedCps;

  let { connectorId } = payload;
  const { idTag } = payload;

  try {
    // If connector id is mentioned
    if (connectorId) {
      // Check if connector is already is occupied
      if (await isConnectorOccupied(cpid, connectorId)) {
        return callResult({
          status: 'Rejected',
        });
      }
    } else {
      // Get a free connector
      connectorId = await getFreeConnector(cpid);
    }

    // Respond Acceptance
    callResult({
      status: 'Accepted',
    });

    // Start the transaction
    const cpdata = getCP(cpid);
    const params = {
      id: connectorId,
      id_tag: idTag,
    };

    const log = getLoggger(cpdata, cpid);
    const emit = (...args) => cpdata.io.emit(...args);
    const setState = (p, v) => modifyState(cpdata.state, p, v, cpdata.io);

    return startTransaction(cpdata, params, log, emit, setState, cpdata.cp);
  } catch (error) {
    return callError('InternalError', error.message);
  }
};
