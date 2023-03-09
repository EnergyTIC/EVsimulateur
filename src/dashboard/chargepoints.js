const Express = require('express');
const _ = require('lodash');
const sqlite = require('../db');
const deployedCPs = require('../deployed-cps');
const cpSqlite = require('../cpDb');
const commandHanlders = require('../CPEventListenerHandlers/handlers');

const app = Express.Router();
module.exports = app;

const isValidConnector = con =>
  _.every(['label', 'dcac', 'lock'], _.partial(_.has, con));

app.get('/deployed', (req, res) => {
  res.render('dashboard/chargepoints/deployed', {
    cps: _.map(deployedCPs.getAll(), 'cp'), // getting rid of io
  });
});
app.get('/undeployed', async (req, res) => {
  const deployedIds = _.keys(deployedCPs.getAll());
  const db = await sqlite;
  const cps = await db.all(
    `SELECT * FROM chargepoints WHERE id NOT IN (${_.times(
      deployedIds.length,
      _.constant('?'),
    ).join(',')})`,
    deployedIds,
  );
  res.render('dashboard/chargepoints/undeployed', { cps });
});

app.get('/create', (req, res) => res.render('dashboard/chargepoints/build'));
app.post('/create', async (req, res) => {
  const body = _.chain(req).get('body');
  const cpid = body.get('cpid').value();
  const serial = body.get('serialnum').value();
  const name = body.get('name').value();
  const vendor = body.get('vendor').value();
  const model = body.get('model').value();
  const firmwareVersion = body.get('firmwareVersion').value();
  const ocppVersion = body.get('ocppVersion').value();
  const meterValueFrequency = body
    .get('meterValueFrequency')
    .toNumber()
    .value();
  const cslocation = body.get('cslocation').value();
  const connectors = body.get('connectors').value();

  if (!(cpid && vendor && model && ocppVersion && cslocation)) {
    return res
      .status(400)
      .json({ message: 'Please provide all required data' });
  }

  if (!(_.isArray(connectors) && _.every(connectors, isValidConnector))) {
    return res.status(400).json({ message: 'Connectors defined invalidly' });
  }

  // Seems ok
  const db = await sqlite;

  const createCP = db.run(
    `INSERT INTO chargepoints 
  (id, serial, name, vendor, model, firmware_version, ocpp_v, meter_value_frequency, csms_endpoint) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cpid,
      serial,
      name,
      vendor,
      model,
      firmwareVersion,
      ocppVersion,
      meterValueFrequency,
      cslocation,
    ],
  );

  const connectorValues = [];
  const connectorPlaceholders = _.map(connectors, (con, i) => {
    connectorValues.push(i + 1);
    connectorValues.push(cpid);
    connectorValues.push(_.get(con, 'dcac'));
    connectorValues.push(_.toSafeInteger(_.get(con, 'lock')));
    connectorValues.push(_.get(con, 'label'));

    return '(?, ?, ?, ?, ?)';
  }).join(',');
  const createConnectors = db.run(
    `INSERT INTO connectors (id, cpid, dcac, auto_lock, type) VALUES ${connectorPlaceholders}`,
    connectorValues,
  );

  try {
    await Promise.all([createCP, createConnectors]);
    return res.sendStatus(201);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

app.get('/details/:cpid', async (req, res) => {
  const cpid = _.get(req, 'params.cpid');

  const db = await sqlite;
  const cp = await db.get('SELECT * FROM chargepoints WHERE id = ?', cpid);

  if (!cp) {
    return res.sendStatus(404);
  }

  const state = _.get(deployedCPs.get(cpid), 'state');

  return res.render('dashboard/chargepoints/details', {
    cp: {
      ...cp,
      cpid,
      isDeployed: !!state,
      state,
    },
  });
});

app.post('/deploy', async (req, res) => {
  const cpid = _.get(req, 'body.cpid');
  if (!cpid) {
    return res.sendStatus(404);
  }

  const db = await sqlite;

  const [cp, connectors] = await Promise.all([
    db.get('SELECT * FROM chargepoints WHERE id = ?', cpid),
    db.all('SELECT * FROM connectors WHERE cpid = ?', cpid),
  ]);

  if (!cp) {
    return res.sendStatus(404);
  }

  const modifiedConnectors = _.map(connectors, conn => ({
    ...conn,
    availability: 'Operative',
  }));

  deployedCPs.add({
    ...cp,
    connectors: modifiedConnectors,
  });
  const cpdata = {
    ...deployedCPs.get(cpid),
    isDeployed: !!_.get(deployedCPs.get(cpid), 'state'),
  };

  const log = deployedCPs.getLoggger(cpdata, cpid);

  const setState = (p, v) =>
    deployedCPs.modifyState(cpdata.state, p, v, cpdata.io);

  log('Connecting to Central System...');
  // Connecting to Central System
  commandHanlders.connect2csms({ cpdata, log, setState });
  // Sending Boot Notification
  cpdata.ocpp.event.once('connected', () => {
    log('Sending Boot Notification...');
    commandHanlders['send.BootNotification']({ cpdata, log });
  });

  return res.redirect(`/dashboard/chargepoints/details/${cpid}`);
});

app.get('/transactions/:cpid', async (req, res) => {
  try {
    const cpid = _.get(req, 'params.cpid');

    const db = await sqlite;

    const transactions = await db.all(
      'SELECT * FROM transactions WHERE cpid = ? ORDER BY started_at DESC',
      cpid,
    );

    return res.json(transactions);
  } catch (error) {
    console.log(error);
    return res.sendStatus(500);
  }
});

app.get('/:cpid/fetchLogs', async (req, res) => {
  try {
    const cpDb = await cpSqlite(`cp_${_.get(req, 'params.cpid')}`);
    const pageNum = _.get(req, 'query.pageNum', 1);
    const limitFrom = (pageNum - 1) * 20;

    const logs = await cpDb.all(
      'SELECT * FROM logs ORDER BY time DESC LIMIT 20 OFFSET ?',
      [limitFrom],
    );
    return res.json(logs);
  } catch (error) {
    console.log(error);
    return res.sendStatus(500);
  }
});

app.get('/edit/:cpid', async (req, res) => {
  try {
    const cpid = _.get(req, 'params.cpid');

    const db = await sqlite;
    const cp = await db.get('SELECT * FROM chargepoints WHERE id = ?', cpid);
    const connectors = await db.all(
      'SELECT * FROM connectors WHERE cpid = ?',
      cpid,
    );

    return res.render('dashboard/chargepoints/edit', {
      chargepoint: cp,
      connectors,
    });
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

app.post('/edit/:cpid', async (req, res) => {
  try {
    const cpid = _.get(req, 'params.cpid');
    const cpName = _.get(req, 'body.name');
    const vendor = _.get(req, 'body.vendor');
    const model = _.get(req, 'body.model');
    const serialNo = _.get(req, 'body.serial');
    const firmwareVersion = _.get(req, 'body.firmware_version');
    const meterValueFrequency = _.toSafeInteger(
      _.get(req, 'body.meter_value_frequency'),
    );
    const ocppVersion = _.get(req, 'body.ocpp_v');
    const csLocation = _.get(req, 'body.cs_location');
    const editedConnectors = _.get(req, 'body.editedConnectors');

    if (
      _.isEmpty(cpName) ||
      _.isEmpty(vendor) ||
      _.isEmpty(model) ||
      _.isEmpty(csLocation)
    ) {
      return res.status(400).send('Required fields cannot be empty');
    }

    const db = await sqlite;
    await db.run(
      'UPDATE chargepoints SET serial = ?, name = ?, vendor = ?, model = ?, firmware_version = ?, ocpp_v = ?, meter_value_frequency = ?, csms_endpoint = ? WHERE id = ?',
      [
        serialNo,
        cpName,
        vendor,
        model,
        firmwareVersion,
        ocppVersion,
        meterValueFrequency,
        csLocation,
        cpid,
      ],
    );

    // First remove all the connectors
    await db.run('DELETE FROM connectors WHERE cpid = ?', [cpid]);

    // Insert all the newly edited connectors
    const editConnectors = _.map(editedConnectors, conn =>
      db.run(
        'INSERt INTO connectors (id, cpid, status, dcac, auto_lock, type) VALUES (?,?,?,?,?,?)',
        [conn.id, cpid, conn.status, conn.dcac, conn.auto_lock, conn.type],
      ),
    );
    await Promise.all(editConnectors);

    return res.sendStatus(200);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

app.post('/delete/:cpid', async (req, res) => {
  try {
    const cpid = _.get(req, 'params.cpid');
    const db = await sqlite;
    await db.run('DELETE FROM chargepoints WHERE id = ?', cpid);
    await db.run('DELETE FROM connectors WHERE cpid = ?', cpid);
    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.post('/undeploy/:cpid', async (req, res) => {
  try {
    const cpid = _.get(req, 'params.cpid');
    deployedCPs.remove(cpid);
    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});
