/*

    Copyright 2023, Kontron AIS GmbH

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

// SQLite is built into Node.js (node:sqlite, no ExperimentalWarning since Node.js 24).
// The synchronous API is wrapped into the existing Promise based interface of this class.
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");

// message of the former sqlite3 module, evaluated by the Monitoring node (handleException)
const DATABASE_CLOSED = "SQLITE_MISUSE: Database is closed";

module.exports = class Storage {
    /*  private members not working here
        and chaining calls are not working with instance fields in classes
    */

    // Sort priority for items with equal timestamps
    static PriorityMode = {
        FIFO: 0, // first in, first out (inserting sortorder)
        EventsFirst: 1, // events (state changes) before alarms, units, etc.
        EventsLast: 2 // events (state changes) after alarms, units, etc.
    };

    constructor(id, maxfileSize = 100, delay = 0, priorityMode = Storage.PriorityMode.FIFO) {
        this.id = id;
        this.db = null;
        this.filename = id + ".db";
        // file watcher settings:
        this.housekeeperInterval = 10000;
        this.maxfileSize = maxfileSize * 1024 * 1024; // Size in MB
        this.cleanupFactor = 0.05;
        this.delay = delay * 1000 / 86400000;
        switch (priorityMode) {
            case Storage.PriorityMode.EventsFirst:
                this.orderColumn = "is_event DESC, id";
                break;
            case Storage.PriorityMode.EventsLast: this.orderColumn = "is_event ASC, id";
                break;
            default:
                this.orderColumn = "id";
                break;
        }
    }

    _getDatabase(filename) {
        return new Promise((resolve, reject) => {
            try {
                // Hint: an invalid database file is not detected here,
                // but with the first statement ("file is not a database")
                return resolve(new DatabaseSync(filename));
            } catch (e) {
                return reject(e);
            }
        });
    }

    // returns the open database or throws the same error as the former sqlite3 module
    _database() {
        if (!this.db || !this.db.isOpen) {
            throw new Error(DATABASE_CLOSED);
        }
        return this.db;
    }

    // executes a synchronous database action and returns a Promise like the former sqlite3 module
    _execute(action) {
        return new Promise((resolve, reject) => {
            try {
                return resolve(action(this._database()));
            } catch (e) {
                // database closed in the meantime: report it like the former sqlite3 module
                if (e.code === "ERR_INVALID_STATE") {
                    return reject(new Error(DATABASE_CLOSED));
                }
                return reject(e);
            }
        });
    }

    async initialize() {
        // init database:
        this.db = await this._getDatabase(this.filename);
        // create table
        await this._createTables();
        // free empty file space to shrink file, but only if it is worth it:
        // node:sqlite is synchronous, VACUUM of a large file blocks Node-RED for seconds
        await this._vacuumIfWorthwhile();
        // init housekeeper job
        this.dataActionCounter = 0;
        this.lastCheckedAction = 0;
        await this._newTransaction();
        this.timer = setTimeout(this._housekeeperJob.bind(null, this), this.housekeeperInterval);
    }

    // VACUUM only if at least 25% of the file is unused (free pages)
    async _vacuumIfWorthwhile() {
        const pages = await this._execute(db => ({
            total: db.prepare("PRAGMA page_count").get().page_count,
            free: db.prepare("PRAGMA freelist_count").get().freelist_count
        }));
        if (pages.free > 0 && pages.free >= pages.total * 0.25) {
            await this.wrapRunPromise("VACUUM;");
        }
    }

    async _createTables() {
        // upgrade <= v1.1: drop messages table without specific id column (deprecated)
        var tableDef = await this._getTableDefinition("messages");
        if (tableDef && !tableDef.sql.includes("id INTEGER")) {
            await this.wrapRunPromise("DROP TABLE messages");
        }
        // upgrade <= v1.2:
        if (tableDef && !tableDef.sql.includes("timestamp REAL") && !tableDef.sql.includes("is_event INTEGER")) {
            // add missing columns
            await this.wrapRunPromise("ALTER TABLE messages ADD COLUMN timestamp REAL");
            await this.wrapRunPromise("ALTER TABLE messages ADD COLUMN is_event INTEGER");
            // migrate data
            await this.wrapRunPromise("UPDATE messages SET "
                + "timestamp = julianday(json_extract(data, '$.timestamp'), 'utc'), "
                + "is_event = CASE WHEN json_extract(data, '$.type') = 2 THEN 1 ELSE 0 END;");
        }
        // initial: create teables
        await this.wrapRunPromise("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY ASC, timestamp REAL, is_event INTEGER, data Text)");
        await this.wrapRunPromise("CREATE TABLE IF NOT EXISTS configMessages (id INTEGER PRIMARY KEY AUTOINCREMENT, category Text, data Text )");
        // initial: create index
        await this.wrapRunPromise("CREATE INDEX IF NOT EXISTS idx_messages_events_first ON messages (timestamp, is_event DESC, id)");
        await this.wrapRunPromise("CREATE INDEX IF NOT EXISTS idx_messages_events_last ON messages (timestamp, is_event ASC, id)");
        await this.wrapRunPromise("CREATE INDEX IF NOT EXISTS idx_messages_fifo ON messages (timestamp, id)");
    }

    _getTableDefinition(tablename) {
        return this._execute(db =>
            db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(tablename));
    }

    _getRowCount(tablename) {
        return this._execute(db =>
            db.prepare("SELECT COUNT(id) as c FROM " + tablename).get().c);
    }

    getStorageDataCount() {
        return this._getRowCount("messages");
    }

    getStorageConfigDataCount() {
        return this._getRowCount("configMessages");
    }

    getStorageData(limit) {
        return this._execute(db => {
            var dataArray = [];
            var idArray = [];
            var maxId = 0;
            var args = [limit];
            var whereClause = "";
            if (this.delay > 0) {
                whereClause = " WHERE timestamp < ?";
                // add filter timestamp value at begin of arguements array
                args.unshift(new Date().getTime() / 86400000 + 2440587.5 - this.delay);
            }

            var rows = db.prepare("SELECT data, id FROM messages"
                + whereClause
                + " ORDER BY timestamp, "
                + this.orderColumn
                + " LIMIT ?").iterate(...args);
            for (const row of rows) {
                if (maxId < row.id) {
                    maxId = row.id;
                }
                dataArray.push(JSON.parse(row.data));
                idArray.push(row.id);
            }

            return {
                items: dataArray,
                ids: idArray,
                maxId: maxId
            };
        });
    }

    getStorageConfigData() {
        return this._execute(db => {
            var dataArray = [];
            var firstIndex;
            var lastIndex;

            // tight packed config data
            var rows = db.prepare("SELECT category, MIN(id) AS min_id, MAX(id) AS max_id, '[' || group_concat(data, ',') || ']' as dataConcat FROM configMessages GROUP BY category;").iterate();
            for (const row of rows) {
                dataArray.push({
                    items: JSON.parse(row.dataConcat),
                    category: row.category
                });
                // get least / greatest id of all groups
                if (!firstIndex || firstIndex > row.min_id) {
                    firstIndex = row.min_id;
                }
                if (!lastIndex || lastIndex < row.max_id) {
                    lastIndex = row.max_id;
                }
            }

            return {
                categories: dataArray,
                firstIndex: firstIndex,
                lastIndex: lastIndex
            };
        });
    }

    async deleteAllData() {
        await this.wrapRunPromise("DELETE FROM configMessages");
        await this.wrapRunPromise("DELETE FROM messages");
        // increment data action counter for swap transaction job
        this.dataActionCounter++;
    }

    async deleteData(ids) {
        // delete in blocks and give Node-RED time in between:
        // node:sqlite is synchronous, one large DELETE blocks the event loop
        // Hint: an empty id list still runs one (invalid) statement and throws as before,
        // the housekeeper job relies on it to leave its cleanup loop
        const blockSize = 1000;
        for (let start = 0; start === 0 || start < ids.length; start += blockSize) {
            if (start > 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
            var sql = "DELETE FROM messages WHERE id IN (";
            ids.slice(start, start + blockSize).forEach(id => sql += id + ",");
            sql = sql.substring(0, sql.length - 1) + ")";
            await this.wrapRunPromise(sql);
        }

        // increment data action counter for swap transaction job
        this.dataActionCounter++;
    }

    async deleteConfigData(start, end) {
        await this.wrapRunPromise("DELETE FROM configMessages WHERE id BETWEEN $start and $end", {
            $start: start,
            $end: end
        });
        // increment data action counter for swap transaction job
        this.dataActionCounter++;
    }

    _storeChunkData(tablename, chunk, additionalValues = []) {
        return this._execute(db => {
            var jsons = [];
            var sql = "INSERT INTO " + tablename + "(data";
            for (var addVal of additionalValues) {
                sql += ", " + addVal.column;
            }
            sql += ") VALUES (?";
            for (var i = 0; i < chunk.length; i++) {
                jsons.push(JSON.stringify(chunk[i]));
                for (var addVal2 of additionalValues) {
                    sql += ",?";
                    jsons.push(addVal2.value(chunk[i]));
                }
                sql += "),(?";
            }

            sql = sql.substring(0, sql.length - 3);
            db.prepare(sql).run(...jsons);
            return true;
        });
    }

    async _storeDataInChunks(tablename, data, additionalValues = []) {
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
            await this._storeChunkData(tablename, chunks[i].items, additionalValues);
            // increment data action counter for swap transaction job
            this.dataActionCounter++;
        }
    }

    async storeData(data) {
        await this._storeDataInChunks("messages", data,
            [
                {
                    column: "timestamp",
                    value: function (item) {
                        // calculate julian date
                        return (new Date(item.timestamp ? item.timestamp : new Date())).getTime() / 86400000 + 2440587.5;
                    }
                },
                {
                    column: "is_event",
                    value: function (item) {
                        // only item type = 2 is an event
                        return item.type == 2 ? 1 : 0;
                    }
                }
            ]);
    }

    async storeConfigData(data, category) {
        await this._storeDataInChunks("configMessages", data,
            [
                {
                    column: "category",
                    value: function () {
                        return category;
                    }
                }
            ]);
    }

    _closeDatabase() {
        var db = this.db;
        return new Promise((resolve, reject) => {
            // return if database is not initializied or already closed
            if (!db || !db.isOpen) {
                return resolve(true);
            }
            try {
                db.close();
            } catch (e) {
                return reject(e);
            }
            return resolve(true);
        });
    }

    async close() {
        clearTimeout(this.timer);
        try {
            await this._commitTransaction();
        } finally {
            // always release the file, even if the commit fails (e.g. damaged file),
            // otherwise the file stays locked and cannot be deleted/recreated
            await this._closeDatabase();
        }
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
        return this._execute(db => {
            var stmt = db.prepare(statement);
            if (Array.isArray(params)) {
                stmt.run(...params);
            } else if (params) {
                stmt.run(params);
            } else {
                stmt.run();
            }
            return true;
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
                        var data = await self.getStorageData(Math.ceil(itemCount * self.cleanupFactor));
                        await self.deleteData(data.ids);
                        // shrink file size
                        await self._commitTransaction();
                        await self.wrapRunPromise("VACUUM;");
                        await self._newTransaction();
                    }
                    while (await self.getFileSize() >= self.maxfileSize);
                }
            }

        } catch {
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