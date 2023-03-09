module.exports.calculateLatestMeterValue = (
  power,
  timeElapsedByLastTransaction,
  currentMeterValue,
) => currentMeterValue + power * timeElapsedByLastTransaction;

module.exports.calculateEnergyConsumed = (power, timeConsumed) =>
  power * timeConsumed;
