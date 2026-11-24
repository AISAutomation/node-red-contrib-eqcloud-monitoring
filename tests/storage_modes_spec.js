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

var storage;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateTestdata() {
    var base = new Date(new Date() - 10000);

    return {
        "items": [
            {
                "type": 1,
                "id": "alarm1",
                "timestamp": new Date(base.getTime() + 1111).toISOString(),
                "action": 1,
                "additional_values": [
                    "low speed",
                    1,
                    "5 m/h"
                ]
            },
            {
                "type": 2,
                "id": "event1",
                "timestamp": new Date(base.getTime() + 2222).toISOString()
            },
            {
                "type": 3,
                "id": null,
                "timestamp": new Date(base.getTime() + 3333).toISOString(),
                "count": 1,
                "quality": 1
            },
            {
                "type": 4,
                "id": "numeric_process_value1",
                "timestamp": new Date(base.getTime() + 4444).toISOString(),
                "value": -1.3555
            },
            {
                "type": 3,
                "id": null,
                "timestamp": new Date(base.getTime() + 5555).toISOString(),
                "count": 1,
                "quality": 1
            },
            {
                "type": 2,
                "id": "event2",
                "timestamp": new Date(base.getTime() + 5555).toISOString()
            },
            {
                "type": 3,
                "id": null,
                "timestamp": new Date(base.getTime() + 5555).toISOString(),
                "count": 1,
                "quality": 1
            },
            {
                "type": 2,
                "id": "event1",
                "timestamp": new Date(base.getTime() + 7777).toISOString()
            },
            {
                "type": 3,
                "id": null,
                "timestamp": new Date(base.getTime() + 7777).toISOString(),
                "count": 1,
                "quality": 1
            },
            {
                "type": 1,
                "id": "alarm1",
                "timestamp": new Date(base.getTime() + 8888).toISOString(),
                "action": 0
            }
        ]
    };
}

describe("Storage Modes", function () {

    beforeEach(async function () {
    });

    afterEach(async function () {
        await storage?.close();
        await storage?.delete();
    });

    it("0s delay, FIFO", async function () {

        storage = new Storage("testid", 100, 0, Storage.PriorityMode.FIFO);
        await storage.initialize();

        var testData = generateTestdata();

        await storage.storeData(testData);

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(10);
        should(data.items).be.deepEqual(testData.items);

    });

    it("0s delay, Events first", async function () {

        storage = new Storage("testid", 100, 0, Storage.PriorityMode.EventsFirst);
        await storage.initialize();

        var testData = generateTestdata();

        await storage.storeData(testData);

        // change order of comparison data with prority "events first"
        var item = testData.items[5];
        testData.items[5] = testData.items[4];
        testData.items[4] = item;

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(10);
        should(data.items).be.deepEqual(testData.items);

    });

    it("0s delay, Events last", async function () {

        storage = new Storage("testid", 100, 0, Storage.PriorityMode.EventsLast);
        await storage.initialize();

        var testData = generateTestdata();

        await storage.storeData(testData);

        // change order of comparison data with prority "events last"
        var item = testData.items[5];
        testData.items[5] = testData.items[6];
        testData.items[6] = item;

        item = testData.items[7];
        testData.items[7] = testData.items[8];
        testData.items[8] = item;

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(10);
        should(data.items).be.deepEqual(testData.items);

    });

    it("5s delay, FIFO, 5s polling", async function () {

        storage = new Storage("testid", 100, 5, Storage.PriorityMode.FIFO);
        await storage.initialize();

        var testData = generateTestdata();

        await storage.storeData(testData);

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(4);
        should(data.items).be.deepEqual(testData.items.slice(0, 4));

        await sleep(5000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(10);
        should(data.items).be.deepEqual(testData.items);
    });

    it("10s delay, FIFO, 3s polling, delete items", async function () {

        storage = new Storage("testid", 100, 10, Storage.PriorityMode.FIFO);
        await storage.initialize();

        var testData = generateTestdata();

        await storage.storeData(testData);

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(0);

        await sleep(3000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(2);
        should(data.items).be.deepEqual(testData.items.slice(0, 2));
        storage.deleteData(data.ids);

        await sleep(3000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(5);
        should(data.items).be.deepEqual(testData.items.slice(2, 7));
        storage.deleteData(data.ids);

        await sleep(3000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(3);
        should(data.items).be.deepEqual(testData.items.slice(7, 10));
    });

    it("5s delay, Events first, 5s polling", async function () {

        storage = new Storage("testid", 100, 5, Storage.PriorityMode.EventsFirst);
        await storage.initialize();

        var testData = generateTestdata();

        await storage.storeData(testData);

        // change order of comparison data with prority "events first"
        var item = testData.items[5];
        testData.items[5] = testData.items[4];
        testData.items[4] = item;

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(4);
        should(data.items).be.deepEqual(testData.items.slice(0, 4));

        await sleep(5000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(10);
        should(data.items).be.deepEqual(testData.items);
    });

    it("10s delay, Events last, 3s polling, inverse Insert Order, delete items", async function () {

        storage = new Storage("testid", 100, 10, Storage.PriorityMode.EventsLast);
        await storage.initialize();

        var testData = generateTestdata();
        testData.items = testData.items.reverse();
        await storage.storeData(testData);

        // change order of comparison data with prority "events last"
        testData.items = testData.items.reverse();

        var item = testData.items[5];
        testData.items[5] = testData.items[6];
        testData.items[6] = item;

        item = testData.items[7];
        testData.items[7] = testData.items[8];
        testData.items[8] = item;

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(0);

        await sleep(3000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(2);
        should(data.items).be.deepEqual(testData.items.slice(0, 2));
        storage.deleteData(data.ids);

        await sleep(3000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(5);
        should(data.items).be.deepEqual(testData.items.slice(2, 7));
        storage.deleteData(data.ids);

        await sleep(3000);

        data = await storage.getStorageData(-1);
        should(data.items.length).equal(3);
        should(data.items).be.deepEqual(testData.items.slice(7, 10));
    });

    it("10s delay, Events last, crazy Insert Order", async function () {

        storage = new Storage("testid", 100, 10, Storage.PriorityMode.EventsLast);
        await storage.initialize();

        var testData = generateTestdata();
        testData.items = testData.items.reverse();

        for (var i = 0; i < Math.ceil(testData.items.length * 0.5); i++) {
            await storage.storeData({ items: [testData.items[i]] });
            await storage.storeData({ items: [testData.items[Math.ceil(testData.items.length * 0.5) + i]] });
            await sleep(1000);
        }
        await sleep(5000);

        // change order of comparison data with prority "events last"
        testData.items = testData.items.reverse();

        var item = testData.items[5];
        testData.items[5] = testData.items[6];
        testData.items[6] = item;

        item = testData.items[7];
        testData.items[7] = testData.items[8];
        testData.items[8] = item;

        var data = await storage.getStorageData(-1);
        should(data.items.length).equal(10);
        should(data.items).be.deepEqual(testData.items);
    });

});