module.exports = async (payload, { callResult }) => {
  callResult({
    status: 'Unlocked',
  });
};
