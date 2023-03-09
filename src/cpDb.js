const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

module.exports = dbName =>
  open({
    filename: path.join(__dirname, '..', 'db', `${dbName}.db`),
    driver: sqlite3.cached.Database,
  }).then(async db => {
    await db.run(`CREATE TABLE IF NOT EXISTS "logs" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "time" DATETIME,
      "text" TEXT,
      "type" VARCHAR(10)
    );`);

    return db;
  });
