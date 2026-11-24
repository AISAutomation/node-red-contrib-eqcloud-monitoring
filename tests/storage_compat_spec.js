/*

Copyright 2026, Kontron AIS GmbH

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

/*
    Compatibility of buffer files created by former versions (sqlite3 module)
    with the current implementation (node:sqlite).

    tests/fixtures/compat_<name>.db          buffer file created by a former version
    tests/fixtures/compat_<name>.read.json   what the former version reads from this file
    tests/fixtures/compat_<name>.write.json  what version 1.4.3 reads after the current
                                            implementation has written into this file
                                            (= downgrade to 1.4.3 is possible)

    compat_v143        created by 1.4.3 (sqlite3 5.1.7)
    compat_v200        created by 2.0.0 before the change to node:sqlite (sqlite3 6.0.1)
    compat_v143_crash  1.4.3 killed during an open transaction (file with hot journal),
                       only the committed data must be restored
    compat_v12         created by 1.2 (old table layout, migrated on open)
*/

require("should");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Storage = require("../src/Storage.js");

const fixtureDir = path.join(__dirname, "fixtures");
const fixtures = ["compat_v143", "compat_v200", "compat_v143_crash", "compat_v12"];

// copy a fixture (incl. journal) into a temp directory, returns the storage id (path without .db)
function copyFixture(name, dir) {
    for (const suffix of [".db", ".db-journal"]) {
        const source = path.join(fixtureDir, name + suffix);
        if (fs.existsSync(source)) {
            const target = path.join(dir, name + suffix);
            fs.copyFileSync(source, target);
            // fixtures may be read-only (e.g. TFS server workspace)
            fs.chmodSync(target, 0o666);
        }
    }
    return path.join(dir, name);
}

function readExpected(name, kind) {
    return JSON.parse(fs.readFileSync(path.join(fixtureDir, name + "." + kind + ".json"), "utf8"));
}

// reads everything like the reference snapshots: a fresh copy per priority mode
async function snapshot(name, prepare) {
    const result = {};
    for (const [modeName, prio] of Object.entries(Storage.PriorityMode)) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compat-"));
        try {
            const id = copyFixture(name, dir);
            if (prepare) {
                await prepare(id);
            }
            const storage = new Storage(id, 100, 0, prio);
            await storage.initialize();
            const data = await storage.getStorageData(100000);
            result["data_" + modeName] = { ids: data.ids, items: data.items, maxId: data.maxId };
            if (modeName === "FIFO") {
                result.count = await storage.getStorageDataCount();
                result.configCount = await storage.getStorageConfigDataCount();
                result.config = await storage.getStorageConfigData();
            }
            await storage.close();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
    }
    // same form as the JSON references (e.g. undefined values are dropped)
    return JSON.parse(JSON.stringify(result));
}

// same write actions as used to create the *.write.json references
async function writeMore(id) {
    const base = Date.UTC(2026, 10, 2, 9, 0, 0);
    const iso = ms => new Date(base + ms).toISOString();
    const storage = new Storage(id);
    await storage.initialize();
    await storage.storeData({
        items: [
            { type: 3, id: "N_PRODUCT", timestamp: iso(0), count: 2, quality: 1 },
            { type: 2, id: "N_prd", timestamp: iso(0) },
            { type: 1, id: "N_Error1", timestamp: iso(0), action: 1 },
            { type: 4, id: "N_Sensor", timestamp: iso(1000), value: 42.5 },
            { type: 4, id: "N_String", timestamp: iso(1000), value_string: "neu geschrieben: äöü ß €" },
            { type: 4, id: "N_Bool", timestamp: iso(1000), value_boolean: false },
            { type: 2, id: "N_sdt", timestamp: iso(2000) }
        ]
    });
    await storage.storeConfigData({ items: [{ id: "N_alarm", text: "Neuer Alarm", type: "Warning", class: { name: "High Priority" } }] }, "alarms");
    // delete the two oldest items (as after a successful transfer)
    const oldest = await storage.getStorageData(2);
    await storage.deleteData(oldest.ids);
    await storage.close();
}

describe("Storage Compatibility", function () {
    this.timeout(30000);

    for (const name of fixtures) {
        it(name + ": reads the same data as the former version", async function () {
            const actual = await snapshot(name);
            actual.should.eql(readExpected(name, "read"));
        });

        it(name + ": write, delete and read back like version 1.4.3", async function () {
            const actual = await snapshot(name, writeMore);
            actual.should.eql(readExpected(name, "write"));
        });
    }

    it("compat_v143_crash: uncommitted data of the crashed version is discarded", async function () {
        fs.existsSync(path.join(fixtureDir, "compat_v143_crash.db-journal")).should.be.true("fixture needs a hot journal");
        const crashed = await snapshot("compat_v143_crash");
        const clean = await snapshot("compat_v143");
        crashed.should.eql(clean);
    });
});
