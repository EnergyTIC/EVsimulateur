const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

module.exports = open({
  filename: path.join(__dirname, '..', 'db', 'main.db'),
  driver: sqlite3.cached.Database,
}).then(async db => {
  const cpTable = db.run(`CREATE TABLE IF NOT EXISTS "chargepoints" (
    "id" VARCHAR(100),
    "serial" VARCHAR(100),
    "name" VARCHAR(100),
    "vendor" VARCHAR(100),
    "model" VARCHAR(100),
    "firmware_version" VARCHAR(10),
    "ocpp_v" VARCHAR(10),
    "meter_value_frequency" INTEGER DEFAULT 15,
    "csms_endpoint" VARCHAR(250),
    PRIMARY KEY("id")
  );`);
  const connectorsTable = db.run(`CREATE TABLE IF NOT EXISTS "connectors" (
    "id" INTEGER,
    "dcac" VARCHAR(2),
    "auto_lock" INTEGER,
    "cpid" VARCHAR(250),
    "status" VARCHAR(20),
    "type" VARCHAR(30),
    PRIMARY KEY("id","cpid")
  );`);

  const transactionsTable = db.run(`CREATE TABLE IF NOT EXISTS "transactions" (
    "id" VARCHAR(10),
    "cpid" VARCHAR(250),
    "connector_id" VARCHAR(250),
    "id_tag" VARCHAR(250),
    "meter_start" INTEGER,
    "meter_stop" INTEGER,
    "started_at" DATETIME,
    "ended_at" DATETIME,
    PRIMARY KEY("id")
  )`);

  await Promise.all([cpTable, connectorsTable, transactionsTable]);

  return db;
});
