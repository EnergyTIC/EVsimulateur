const initialState = (overwrite = {}) => ({
  connected: false,
  power: 'on',
  connectors: [],
  meterValue: 0,
  ...overwrite,
});

module.exports = initialState;
