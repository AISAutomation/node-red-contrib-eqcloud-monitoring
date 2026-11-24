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

var testData = {
    "items": [{
        "type": 4,
        "id": "ipaddress",
        "timestamp": "2019-07-09T12:56:34.169Z",
        "value_string": "172.16.100.219"
    }, {
        "type": 4,
        "id": "uptime",
        "timestamp": "2019-07-09T12:56:34.169Z",
        "value": 969388
    }, {
        "type": 4,
        "id": "serialnumber",
        "timestamp": "2019-07-09T12:56:34.169Z",
        "value_string": "9PB9P42"
    }, {
        "type": 4,
        "id": "ipaddress",
        "timestamp": "2019-07-09T12:56:35.169Z",
        "value_string": "172.16.100.219"
    }, {
        "type": 4,
        "id": "uptime",
        "timestamp": "2019-07-09T12:56:35.169Z",
        "value": 969387
    }, {
        "type": 4,
        "id": "serialnumber",
        "timestamp": "2019-07-09T12:56:35.169Z",
        "value_string": "9PB9P42"
    }, {
        "type": 4,
        "id": "ipaddress",
        "timestamp": "2019-07-09T12:56:36.169Z",
        "value_string": "172.16.100.219"
    }, {
        "type": 4,
        "id": "uptime",
        "timestamp": "2019-07-09T12:56:36.169Z",
        "value": 969386
    }, {
        "type": 4,
        "id": "serialnumber",
        "timestamp": "2019-07-09T12:56:36.169Z",
        "value_string": "9PB9P42"
    }]
};
describe("Storage Class", function () {

    beforeEach(async function () {
        storage = new Storage("testid");
        await storage.initialize();
    });

    afterEach(async function () {
        //await storage.deleteAllData();
        await storage.close();
        await storage.delete();
    });

    it("initialize, close and delete storage", async function () {

        FileSystem.existsSync("../testid.db").should.true;

        await storage.close();
        await storage.delete();
        FileSystem.existsSync("../testid.db").should.false;

        await storage.initialize();
        FileSystem.existsSync("../testid.db").should.true;
    });

    it("store data", async function () {

        await storage.storeData(testData);

        var count = await storage.getStorageDataCount();

        should(count).equal(9);

        var data = await storage.getStorageData(-1);

        should(data.items).be.deepEqual(testData.items);
    });

    it("get stored data count", async function () {
        await storage.storeData(testData);

        const count = await storage.getStorageDataCount();

        should(count).equal(9);
    });

    it("delete all stored data", async function () {

        await storage.storeData(testData);

        var count = await storage.getStorageDataCount();

        should(count).equal(9);

        await storage.deleteAllData();

        count = await storage.getStorageDataCount();

        should(count).equal(0);
    });

    it("delete stored data from 1 to 4", async function () {

        await storage.storeData(testData);

        var count = await storage.getStorageDataCount();

        should(count).equal(9);

        var data = await storage.getStorageData(-1);

        await storage.deleteData(data.ids.slice(0, 4));
        
        count = await storage.getStorageDataCount();

        should(count).equal(5);
    });

});