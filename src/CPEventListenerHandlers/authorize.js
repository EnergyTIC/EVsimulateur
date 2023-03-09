module.exports = async function authorize(cpdata, idTag) {
  try {
    // Performing authorization
    const authResponse = await cpdata.ocpp.authorize(idTag);
    if (!authResponse.ok) {
      throw new Error('Unable to Authorize User');
    }

    if (authResponse.payload.idTagInfo.status !== 'Accepted') {
      throw new Error(`User ${authResponse.payload.idTagInfo.status}`);
    }
    return {
      authorizationSuccessfull: true,
    };
  } catch (error) {
    throw new Error(`Unable to send message: ${error}`);
  }
};
