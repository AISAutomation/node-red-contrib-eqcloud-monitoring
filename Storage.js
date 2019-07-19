/*

    Copyright 2019, AIS Automation Dresden GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files(the "Software"), to deal in
    the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and / or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
    subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

"use strict";

const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

module.exports = class Storage {
    /*  private members not working here
        and chaining calls are not working with instance fields in classes
    */

    constructor(id, maxfileSize) {
        this.id = id;
        this.db = null;
        this.filename = id + ".db";
        // file watcher settings:
        this.housekeeperInterval = 10000;
        this.maxfileSize = (maxfileSize || 100) * 1024 * 1024; // Size in MB
        this.cleanupFactor = 0.05;
    }

    _getDatabase(filename) {
        return new Promise((resolve, reject) => {
            new sqlite3.Database(filename, function (err) {
                // Hint: caused by an internal bug of sqlite3 opening an
                // invalid database file, the callback error is always empty.
                // Immediately afterwards, an internal exception occurs that must be handled
                if (err) {
                    return reject(err);
                }
                return resolve(this);
            });
        });
    }

    async initialize() {
        // init database:
        this.db = await this._getDatabase(this.filename);
        // create table
        await this._createTable();
        // free empty file space to shrink file
        // Hint: row IDs are reset starting with 1        
        await this.wrapRunPromise("VACUUM;");
        // init housekeeper job
        this.dataActionCounter = 0;
        this.lastCheckedAction = 0;
        await this._newTransaction();
        this.timer = setTimeout(this._housekeeperJob.bind(null, this), this.housekeeperInterval);
    }

    async _createTable() {
        // drop messages table without specific id column (deprecated)
        var tableDef = await this._getTableDefinition("messages");
        if (tableDef && !tableDef.sql.includes("id INTEGER")) {
            await this.wrapRunPromise("DROP TABLE messages");
        }
        await this.wrapRunPromise("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY ASC, data Text)");
    }

    _getTableDefinition(tablename) {
        var db = this.db;

        return new Promise((resolve, reject) => {
            db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name = '" + tablename + "'", (err, row) => {
                //Errorhandling
                if (err) {
                    return reject(err);
                }
                return resolve(row);
            });
        });
    }

    getStorageDataCount() {
        var db = this.db;
        return new Promise((resolve, reject) => {
            db.get("SELECT COUNT(id) as c FROM messages", [], (err, row) => {
                //Errorhandling
                if (err) {
                    return reject(err);
                }
                return resolve(row.c);
            });
        });
    }

    getStorageData(limit) {
        var db = this.db;

        return new Promise((resolve, reject) => {
            //"SELECT rowid AS id, data FROM messages, LIMIT 1"
            var dataArray = [];
            var firstIndex = 0;

            db.each("SELECT data, id FROM messages LIMIT ?", [limit], (err, row) => {
                //Errorhandling
                if (err) {
                    return reject(err);
                }
                try {
                    if (firstIndex == 0) {
                        firstIndex = row.id;
                    }
                    var json = JSON.parse(row.data);
                    dataArray.push(json);
                } catch (e) {
                    return reject(e);
                }

            }, (err, count) => {
                if (err) {
                    return reject(err);
                }

                const dataWithInformation = {
                    items: dataArray,
                    firstIndex: firstIndex,
                };

                return resolve(dataWithInformation);
            });
        });
    }

    async deleteAllData() {
        await this.wrapRunPromise("DELETE FROM messages");
        // increment data action counter for swap transaction job
        this.dataActionCounter++;
    }

    async deleteData(start, end) {
        await this.wrapRunPromise("DELETE FROM messages WHERE id BETWEEN $start and $end", {
            $start: start,
            $end: end
        });
        // increment data action counter for swap transaction job
        this.dataActionCounter++;
    }

    _storChunkData(chunk) {
        var db = this.db;
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                try {
                    var jsons = [];
                    var sql = "INSERT INTO messages(data) VALUES (";
                    for (var i = 0; i < chunk.length; i++) {
                        jsons.push(JSON.stringify(chunk[i]));
                        sql += "?),(";
                    }

                    sql = sql.substring(0, sql.length - 2);
                    var statement = db.prepare(sql);
                    statement.run(jsons, (err) => {
                        if (err) {
                            return reject(err);
                        }
                    });
                    statement.finalize((err) => {
                        if (err) {
                            return reject(err);
                        }
                        return resolve(true);
                    });
                } catch (e) {
                    return reject(e);
                }
            });
        });
    }

    async storeData(data) {
        // split array in chunks
        const chunksize = 100;
        var chunks = [];
        for (var i = 0; i < data.items.length; i += chunksize) {
            chunks.push({
                items: data.items.slice(
                    i,
                    Math.min(i + chunksize, data.items.length)
                )
            });
        }
        for (i = 0; i < chunks.length; i++) {
            await this._storChunkData(chunks[i].items);
            // increment data action counter for swap transaction job
            this.dataActionCounter++;
        }
    }

    _closeDatabase() {
        var db = this.db;
        return new Promise((resolve, reject) => {
            // return if database is not initializied
            if (!db) {
                return resolve(true);
            }
            db.close((err) => {
                //Errorhandling
                if (err) {
                    return reject(err);
                }
                return resolve(true);
            });
        });
    }

    async close() {
        clearTimeout(this.timer);
        await this._commitTransaction();
        await this._closeDatabase();
    }

    delete() {
        var filename = this.filename;
        return new Promise((resolve, reject) => {
            try {
                // return if file does not exists
                if (!fs.existsSync(filename)) {
                    return resolve(true);
                }
                fs.unlinkSync(filename);
            } catch (e) {
                return reject(e);
            }
            return resolve(true);
        });
    }

    wrapRunPromise(statement, params) {
        var db = this.db;
        return new Promise((resolve, reject) => {
            db.run(statement, params ? params : [], (err) => {
                //Errorhandling
                if (err) {
                    return reject(err);
                }
                return resolve(true);
            });
        });
    }

    getFileSize() {
        var filename = this.filename;
        return new Promise((resolve, reject) => {
            fs.stat(filename, (err, stats) => {
                //Errorhandling
                if (err) {
                    return reject(err);
                }
                return resolve(stats.size);
            });
        });
    }

    async _housekeeperJob(self) {
        try {
            // generate new transaction if necessary
            if (await self._swapTransaction()) {
                // check if max file size reached 
                if (await self.getFileSize() >= self.maxfileSize) {
                    var itemCount = await self.getStorageDataCount();

                    do {
                        // delete block from storage
                        // calculate block size depending on current item count and cleanup factor
                        var data = await self.getStorageData(1);
                        var startIndex = data.firstIndex;
                        var endIndex = startIndex + Math.ceil(itemCount * self.cleanupFactor);
                        await self.deleteData(startIndex, endIndex);
                        // shrink file size
                        await self._commitTransaction();
                        await self.wrapRunPromise("VACUUM;");
                        await self._newTransaction();
                    }
                    while (await self.getFileSize() >= self.maxfileSize);
                }
            }

        } catch (e) {
            // currently no error handling 
            //console.log(e);
        }
        // reschedule timer
        self.timer = setTimeout(self._housekeeperJob.bind(null, self), self.housekeeperInterval);
    }
    async _swapTransaction() {
        // to avoid unnecessary file actions
        // check if any store/delete actions occured
        if (this.lastCheckedAction == this.dataActionCounter) {
            // nothing happend, so nothing to do
            return false;
        }
        this.lastCheckedAction = this.dataActionCounter;
        await this._commitTransaction();
        await this._newTransaction();

        return true;
    }

    async _newTransaction() {
        try {
            await this.wrapRunPromise("BEGIN TRANSACTION;");
        } catch (e) {
            //ignore if transcation is already activ
            //SQLITE_ERROR: cannot start a transaction within a transaction
            if (!e.message.includes("within a transaction")) {
                //otherweise throw eception
                throw e;
            }
        }
    }
    async _commitTransaction() {
        try {
            await this.wrapRunPromise("COMMIT;");
        } catch (e) {
            //ignore if there is not transcation activ
            //SQLITE_ERROR: cannot commit - no transaction is active
            if (!e.message.includes("no transaction is active")) {
                //otherweise throw eception
                throw e;
            }
        }
    }
};