/*

Copyright 2020, Kontron AIS GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy of 
this software and associated documentation files (the "Software"), to deal in 
the Software without restriction, including without limitation the rights to 
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so, 
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR 
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER 
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN 
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

var should = require("should");

const Storage = require("../src/Storage.js");
const FileSystem = require("fs");

var storage;

describe("Storage Upgrade", function () {

    beforeEach(async function () {
        const testDb = "tests/upgrade_test_data_v1.2.db";
        // remove leftover copy of an aborted run (may be read-only)
        if (FileSystem.existsSync(testDb)) {
            FileSystem.chmodSync(testDb, 0o666);
            FileSystem.unlinkSync(testDb);
        }
        FileSystem.copyFileSync("tests/upgrade_sample_data_v1.2.db", testDb);
        // copyFileSync keeps the read-only flag of the source (e.g. TFS server workspace),
        // but the upgrade has to write into the copy
        FileSystem.chmodSync(testDb, 0o666);
    });

    afterEach(async function () {
        await storage?.close();
        await storage?.delete();
    });

    function readValueFromSelect(db, statement, params = []) {
        return new Promise((resolve, reject) => {
            try {
                return resolve(db.prepare(statement).get(...params).c);
            } catch (e) {
                return reject(e);
            }
        });
    }

    it("Upgrade from <= v1.2", async function () {

        storage = new Storage("tests/upgrade_test_data_v1.2");
        await storage.initialize();

        var val = await readValueFromSelect(storage.db, "SELECT COUNT(*) AS c FROM messages WHERE is_event = 1");
        should(val).equal(3);

        val = await readValueFromSelect(storage.db, "SELECT COUNT(*) AS c FROM messages WHERE timestamp NOT NULL");
        should(val).equal(10);

        val = await readValueFromSelect(storage.db, "SELECT timestamp AS c FROM messages WHERE id = 5");
        val = Math.round((val - 2440587.5) * 86400000); // convert julian to unix date

        var data = await storage.getStorageData(5);
        should((new Date(val)).toISOString()).equal(data.items[4].timestamp);

    });


});