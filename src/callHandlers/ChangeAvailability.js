const _ = require('lodash');
const deployedCps = require('../deployed-cps');
const statusNotification = require('../CPEventListenerHandlers/statusNotification');

const futureAvalability = {};

module.exports = async (payload, { callResult }, cpid) => {
  const { connectorId, type } = payload;

  // Workaround for cicular dependency
  const { get: getCP, modifyState } = deployedCps;
  const cpdata = getCP(cpid);
  const setState = (p, v) => modifyState(cpdata.state, p, v, cpdata.io);

  if (connectorId > 0) {
    // See if the connector is on charging
    const requestedConnectorData = _.find(
      cpdata.state.connectors,
      conn => conn.id === connectorId,
    );
    if (_.get(requestedConnectorData, 'status') === 'Charging') {
      const listener = transaction => {
        const { connector_id: txConnId } = transaction;
        if (futureAvalability[txConnId]) {
          const { listener: listenerToBeRemoved } = futureAvalability[txConnId];
          // change the availability of tx Conn Id
          _.set(
            cpdata,
            `state.connectors[${connectorId - 1}].availability`,
            type,
          );
          setState('connectors', cpdata.state.connectors);
          statusNotification(
            cpdata,
            connectorId,
            type === 'Inoperative' ? 'Unavailable' : 'Available',
            setState,
          );
          cpdata.ocpp.event.off('transaction_stopped', listenerToBeRemoved);
          delete futureAvalability[txConnId];
        }
      };
      if (futureAvalability[connectorId]) {
        const { listener: listenerToBeRemoved } =
          futureAvalability[connectorId];
        cpdata.ocpp.event.off('transaction_stopped', listenerToBeRemoved);
      }
      futureAvalability[connectorId] = { type, listener };
      cpdata.ocpp.event.on('transaction_stopped', listener);

      return callResult({
        status: 'Scheduled',
      });
    }
    // The connector is not in Charging so see the current availability status
    if (_.get(requestedConnectorData, 'availability') === type) {
      // If the current status is same as requested than simply return "Accepted"
      callResult({
        status: 'Accepted',
      });
      return statusNotification(
        cpdata,
        connectorId,
        type === 'Inoperative' ? 'Unavailable' : 'Available',
        setState,
      );
    }
    // set the requested status and return accepted
    _.set(cpdata, `state.connectors[${connectorId - 1}].availability`, type);
    setState('connectors', cpdata.state.connectors);
    callResult({
      status: 'Accepted',
    });

    return statusNotification(
      cpdata,
      connectorId,
      type === 'Inoperative' ? 'Unavailable' : 'Available',
      setState,
    );
  }
  // Check if some connectors are on charging
  if (_.some(cpdata.state.connectors, { status: 'Charging' })) {
    const listener = () => {
      // Check if still some connectors are on charging
      if (_.some(cpdata.state.connectors, { status: 'Charging' })) {
        return undefined;
      }
      _.forEach(cpdata.state.connectors, (connector, c) => {
        _.set(cpdata, `state.connectors[${c}].availability`, type);
      });
      setState('connectors', cpdata.state.connectors);
      _.forEach(cpdata.state.connectors, connector => {
        statusNotification(
          cpdata,
          _.get(connector, 'id'),
          type === 'Inoperative' ? 'Unavailable' : 'Available',
          setState,
        );
      });

      return cpdata.ocpp.event.off('transaction_stopped', listener);
    };
    cpdata.ocpp.event.on('transaction_stopped', listener);
    return callResult({
      status: 'Scheduled',
    });
  }
  callResult({
    status: 'Accepted',
  });
  _.forEach(cpdata.state.connectors, (connector, c) => {
    _.set(cpdata, `state.connectors[${c}].availability`, type);
  });
  setState('connectors', cpdata.state.connectors);
  _.forEach(cpdata.state.connectors, connector => {
    statusNotification(
      cpdata,
      _.get(connector, 'id'),
      type === 'Inoperative' ? 'Unavailable' : 'Available',
      setState,
    );
  });
  return;
}; // NOTE: Need to implement for connectorId = 0
