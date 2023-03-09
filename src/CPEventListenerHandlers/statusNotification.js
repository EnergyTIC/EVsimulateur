const _ = require('lodash');

module.exports = async function statusNotification(
  cpdata,
  connectorId,
  status,
  setState,
) {
  try {
    // Sending status notification update to CSMS
    await cpdata.ocpp.statusNotification(connectorId, status);
    // Inform Frontend
    _.set(cpdata, `state.connectors[${connectorId - 1}].status`, status);
    return setState('connectors', cpdata.state.connectors);
  } catch (error) {
    console.log(error);
    throw new Error('Unable to send Status Notification...');
  }
};
