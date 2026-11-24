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

var storage, storage2;

var testData = {
    items: []
};

const generateItems = 100000;
//Hint: 1    Item  = ca. 211 Byte
//      400k Items = ca. 84.4 MByte

describe("Storage Class - Load Tests", async function () {
    this.timeout(0);

    beforeEach(async function () {
        await storage.initialize();
        await storage.deleteAllData();
    });

    afterEach(async function () {
        await storage.close();
    });

    before(async function () {
        storage = new Storage("testid");

        var lastMonth = Date.now() - (3600 * 24 * 30 * 1000);
        for (var i = 0; i < generateItems; i++) {
            testData.items.push({
                "type": 4,
                "id": "this_is_my_process_value_id_" + i % 1000,
                "timestamp": (new Date(lastMonth + (i * 1000))).toISOString(),
                "value": Math.random() * 1000
            });
        }
    });

    after(async function () {
        // cleanup files
        await storage.delete();
        if (storage2) {
            await storage2.close();
            await storage2.delete();
        }
    });

    it("store data " + generateItems + " / chunksize all", async function () {
        await storage.storeData(testData);
        var count = await storage.getStorageDataCount();
        should(count).equal(generateItems);
        var data = await storage.getStorageData(-1);
        should(data.items).be.deepEqual(testData.items);
    });

    async function storeInChunks(chunksize, itemCount) {
        // split array in chunks
        var chunks = [];
        for (var i = 0; i < itemCount; i += chunksize) {
            chunks.push({
                items: testData.items.slice(
                    i,
                    Math.min(i + chunksize, itemCount)
                )
            });
        }
        for (i = 0; i < chunks.length; i++) {
            await storage.storeData(chunks[i]);
        }
    }

    it("store data " + generateItems + " / chunksize 1000", async function () {
        await storeInChunks(1000, generateItems);
        var count = await storage.getStorageDataCount();
        should(count).equal(generateItems);
        var data = await storage.getStorageData(-1);
        should(data.items).be.deepEqual(testData.items);
    });
    it("store data " + generateItems + " / chunksize 100", async function () {
        await storeInChunks(100, generateItems);
        var count = await storage.getStorageDataCount();
        should(count).equal(generateItems);
        var data = await storage.getStorageData(-1);
        should(data.items).be.deepEqual(testData.items);
    });
    it("store data " + generateItems + " / chunksize 10", async function () {
        await storeInChunks(10, generateItems);
        var count = await storage.getStorageDataCount();
        should(count).equal(generateItems);
        var data = await storage.getStorageData(-1);
        should(data.items).be.deepEqual(testData.items);
    });
    it("store data " + Math.floor(generateItems / 10) + " / chunksize 1", async function () {
        await storeInChunks(1, Math.floor(generateItems / 10));
        var count = await storage.getStorageDataCount();
        should(count).equal(Math.floor(generateItems / 10));
        var data = await storage.getStorageData(-1);

        var refData = {
            items: testData.items.slice(0, Math.floor(generateItems / 10))
        };

        should(data.items).be.deepEqual(refData.items);
    });
    async function deleteInChunks(chunksize, itemCount) {
        // split array in chunks
        var chunks = [];
        for (var i = 0; i < itemCount; i += chunksize) {
            chunks.push({
                items: testData.items.slice(
                    i,
                    Math.min(i + chunksize, itemCount)
                )
            });
        }
        for (i = 0; i < chunks.length; i++) {

            var data = await storage.getStorageData(chunks[i].items.length);
            await storage.deleteData(data.ids);
            should(data.items).be.deepEqual(chunks[i].items);
        }
    }
    it("delete data " + generateItems + " / chunksize all", async function () {
        await storage.storeData(testData);
        await storage.deleteAllData();
        var count = await storage.getStorageDataCount();
        should(count).equal(0);
    });
    it("delete data " + generateItems + " / chunksize 1000", async function () {
        await storage.storeData(testData);
        await deleteInChunks(1000, generateItems);
        var count = await storage.getStorageDataCount();
        should(count).equal(0);
    });
    it("delete data " + generateItems + " / chunksize 100", async function () {
        await storage.storeData(testData);
        await deleteInChunks(100, generateItems);
        var count = await storage.getStorageDataCount();
        should(count).equal(0);
    });
    it("delete data " + generateItems + " / chunksize 10", async function () {
        await storage.storeData(testData);
        await deleteInChunks(6, generateItems);
        var count = await storage.getStorageDataCount();
        should(count).equal(0);
    });
    it("delete data " + Math.floor(generateItems / 10) + " / chunksize 1", async function () {
        var refData = {
            items: testData.items.slice(0, Math.floor(generateItems / 10))
        };
        await storage.storeData(refData);
        await deleteInChunks(1, Math.floor(generateItems / 10));
        var count = await storage.getStorageDataCount();
        should(count).equal(0);
    });

    it("parallel store and delete data " + generateItems + " / chunksize 100 / offset 10 chunks", async function () {
        var chunksize = 100;
        var chunkOffset = 10;

        // split array in chunks
        var chunks = [];
        for (var i = 0; i < generateItems; i += chunksize) {
            chunks.push({
                items: testData.items.slice(
                    i,
                    Math.min(i + chunksize, generateItems)
                )
            });
        }

        for (i = 0; i < chunkOffset; i++) {
            await storage.storeData(chunks[i]);
        }
        for (i = chunkOffset; i < chunks.length; i++) {
            var results = await Promise.all([
                storage.storeData(chunks[i]),
                storage.getStorageData(chunksize)
            ]);
            var data = results[1];
            should(data.items).be.deepEqual(chunks[i - chunkOffset].items);
            await storage.deleteData(data.ids);
        }

        for (i = chunks.length - chunkOffset; i < chunks.length; i++) {
            data = await storage.getStorageData(chunksize);
            should(data.items).be.deepEqual(chunks[i].items);
            await storage.deleteData(data.ids);
        }

        var count = await storage.getStorageDataCount();
        should(count).equal(0);
    });

    it("Reduce max file size to half of data " + generateItems, async function () {
        //reduce to half size
        var targetSize = 0.5 * generateItems * 211 / (1024 * 1024);
        storage2 = new Storage("test_max_file_size", targetSize);        
        storage2.housekeeperInterval = 1000;
        await storage2.initialize();
        await storage2.deleteAllData();
        // reduce interval of housekeeper job to minimize the test time
        await storage2.storeData(testData);

        var waitPromise = new Promise((resolve) => {
            setTimeout(() => {
                resolve(true);
            }, 10000);
        });
        await Promise.all([waitPromise]);
        var size = await storage2.getFileSize();

        should(size).belowOrEqual(targetSize * 1024 * 1024);
    });
});