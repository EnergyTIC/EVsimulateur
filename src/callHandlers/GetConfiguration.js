module.exports = async (payload, { callResult, callError } /* cpid */) => {
  try {
    return callResult({
      configurationKey: [
        { key: 'AuthorizeRemoteTxRequests', value: 'false', readonly: false },
        { key: 'ClockAlignedDataInterval', value: '0', readonly: false },
        { key: 'ConnectionTimeOut', value: '60', readonly: false },
        {
          key: 'ConnectorPhaseRotation',
          value: 'NotApplicable',
          readonly: true,
        },
        { key: 'GetConfigurationMaxKeys', value: '50', readonly: false },
        { key: 'HeartbeatInterval', value: '90', readonly: false },
        { key: 'LocalAuthorizeOffline', value: 'false', readonly: false },
        { key: 'LocalPreAuthorize', value: 'false', readonly: false },
        {
          key: 'MeterValuesAlignedData',
          value: 'Energy.Active.Import.Register',
          readonly: true,
        },
        {
          key: 'MeterValuesSampledData',
          value: 'Energy.Active.Import.Register',
          readonly: true,
        },
        { key: 'MeterValueSampleInterval', value: '20', readonly: false },
        { key: 'NumberOfConnectors', value: '1', readonly: true },
        { key: 'ResetRetries', value: '1', readonly: false },
        {
          key: 'StopTransactionOnEVSideDisconnect',
          value: 'true',
          readonly: false,
        },
        {
          key: 'StopTransactionOnInvalidId',
          value: 'false',
          readonly: false,
        },
        {
          key: 'StopTxnAlignedData',
          value: 'Energy.Active.Import.Register',
          readonly: true,
        },
        {
          key: 'StopTxnSampledData',
          value: 'Energy.Active.Import.Register',
          readonly: true,
        },
        {
          key: 'SupportedFeatureProfiles',
          value: 'Core,FirmwareManagement',
          readonly: true,
        },
        { key: 'TransactionMessageAttempts', value: '3', readonly: false },
        {
          key: 'TransactionMessageRetryInterval',
          value: '30',
          readonly: false,
        },
        {
          key: 'UnlockConnectorOnEVSideDisconnect',
          value: 'true',
          readonly: false,
        },
        { key: 'AuthorizationCacheEnabled', value: 'true', readonly: false },
        {
          key: 'AllowOfflineTxForUnknownId',
          value: 'false',
          readonly: false,
        },
        { key: 'Freemode', value: 'false', readonly: false },
        { key: 'DefaultIdTag', value: '04D30C62AF4884', readonly: false },
        { key: 'ChargingRateUnitType', value: '32', readonly: false },
      ],
    });
  } catch (error) {
    console.log(error);
    return callError('InternalError', error.message);
  }
};
