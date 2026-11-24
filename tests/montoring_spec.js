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

const should = require("should");
const helper = require("node-red-node-test-helper");
const monitoringNode = require("../src/Monitoring.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Storage = require("../src/Storage.js");
const logger = require("../src/Logger.js");
// test equipment (EquipmentCloud mock or real system, see test-credentials.js)
const credentials = require("./test-credentials.js");

helper.init(require.resolve("node-red"));

var nodeConfig = {
    type: "Monitoring",
    name: "Monitoring Node",
    cycleTime: 5,
    cycleTimeType: "num",
    maxBufferSize: 1,
    maxBufferSizeType: "num",
    delay: 0,
    delayType: "num",
    priorityMode: Storage.PriorityMode.FIFO,
    priorityModeType: "options",
    // getters: the access data is read when a flow is created (the mock is started by the root hooks)
    get customerID() { return credentials.customerID; },
    customerIDType: "str",
    get eqID() { return credentials.eqID; },
    eqIDType: "str",
    get clientID() { return credentials.clientID; },
    clientIDType: "str",
    get clientSecret() { return credentials.clientSecret; },
    clientSecretType: "str",
};

// create a fresh flow for each test, so a test cannot change the config of the following tests
function createFlow(overrides = {}) {
    return [
        {
            id: "f1",
            type: "tab",
            label: "Test flow"
        },
        Object.assign({
            id: "n1",
            z: "f1",
            wires: [
                ["n2"],
                ["n3"]
            ]
        }, nodeConfig, overrides),
        {
            id: "n2",
            z: "f1",
            type: "helper"
        },
        {
            id: "n3",
            z: "f1",
            type: "helper"
        }
    ];
}

// default flow, never modified by a test
// (created in beforeEach: the access data is only available when the mock is running)
var flow;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe("Monitoring Node", function () {
    this.timeout(30000);

    beforeEach(function (done) {
        flow = createFlow();
        helper.startServer(done);
    });

    afterEach(async function () {
        // unload first: closing the node also closes its storage file
        await helper.unload();
        await new Promise(resolve => helper.stopServer(resolve));
        // remove the storage file of node n1
        if (fs.existsSync("n1.db")) {
            fs.unlinkSync("n1.db");
        }

        /*console.log(helper.log().args.filter(evt => {
            return evt[0].type == "Monitoring";
        }));*/
    });

    it("Module loaded", async function () {

        var n1 = Object.assign({
            id: "n1"
        }, nodeConfig);
        var flow = [n1];
        await helper.load(monitoringNode, flow, function () {
            var node1 = helper.getNode("n1");
            node1.should.have.property("name", "Monitoring Node");
        });
    });

    it("Output message when send good items", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: timestamp,
                    action: 2
                },
                {
                    type: 2,
                    id: "prd",
                    timestamp: timestamp
                },
                {
                    type: 3,
                    id: "PRODUCT",
                    timestamp: timestamp,
                    count: 1,
                    quality: 1
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                },
                {
                    type: 4,
                    id: "String 1",
                    timestamp: timestamp,
                    value_string: "my string text"
                }, {
                    type: 4,
                    id: "Bool 1",
                    timestamp: timestamp,
                    value_boolean: true
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msg.should.have.property("payload");
                    msg.payload.should.have.property("statusCode");
                    msg.payload.statusCode.should.equal(200);

                    msg.payload.should.have.property("body");
                    msg.payload.body.result[0].current_item_index.should.equal(5);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });

    it("Output message when send good items by multiple input messages", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: timestamp,
                    action: 2
                },
                {
                    type: 2,
                    id: "prd",
                    timestamp: timestamp
                },
                {
                    type: 3,
                    id: "PRODUCT",
                    timestamp: timestamp,
                    count: 1,
                    quality: 1
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                },
                {
                    type: 4,
                    id: "String 1",
                    timestamp: timestamp,
                    value_string: "my string text"
                }, {
                    type: 4,
                    id: "Bool 1",
                    timestamp: timestamp,
                    value_boolean: true
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msg.should.have.property("payload");
                    msg.payload.should.have.property("statusCode");
                    msg.payload.statusCode.should.equal(200);

                    msg.payload.should.have.property("body");
                    msg.payload.body.result[0].current_item_index.should.equal(5);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            data.items.forEach((item) => {
                n1.receive({
                    payload: {
                        items: [item]
                    }
                });
            });
        });
    });

    it("Output message when send doublicate process values with same timestamp", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: timestamp,
                    action: 2
                }, {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msg.should.have.property("payload");
                    msg.payload.should.have.property("statusCode");
                    msg.payload.statusCode.should.equal(412);

                    msg.payload.should.have.property("body");
                    msg.payload.body.result[0].current_item_index.should.equal(2);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });

    it("Error when send process values with same timestamp: ", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: timestamp,
                    action: 2
                }, {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            n1.on("call:error", call => {
                try {
                    call.args[0].should.match(/Only one value per/);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });


    it("Contiune sending items after send bad item", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value: 123.456
                }, {
                    type: 1,
                    id: "Error1",
                    timestamp: timestamp,
                    action: 2
                }
            ]
        };

        var msgCount = 0;
        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msgCount++;
                    if (msgCount == 1) {
                        msg.payload.statusCode.should.equal(412);
                        msg.payload.body.result[0].current_item_index.should.equal(1);
                    } else if (msgCount == 2) {
                        msg.payload.statusCode.should.equal(200);
                        msg.payload.body.result[0].current_item_index.should.equal(0);
                        done();
                    }
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });

    it("Output message when send invalid items", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    //type: 1, //forget type
                    id: "Error1",
                    timestamp: timestamp,
                    action: 2
                }, {
                    type: 4,
                    // id: "Sensor does not exist", /forget id
                    timestamp: timestamp,
                    value: 123.456
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    timestamp: timestamp,
                    value_string: 123.456 // wrong value type
                },
                {
                    type: 4,
                    id: "Sensor 1",
                    // timestamp: timestamp, // no timestamp
                    value: 123.456
                }
            ]
        };

        var msgCount = 0;
        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                msgCount++;
                try {
                    msg.payload.statusCode.should.equal(412);
                    msg.payload.body.result[0].current_item_index.should.equal(0);
                    var badItem = JSON.parse(msg.payload.body.result[0].current_item);
                    badItem.should.deepEqual(data.items[msgCount - 1]);
                    if (msgCount == data.items.length) {
                        done();
                    }
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });

    it("Create new Storge file when file is damaged", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [{
                type: 1,
                id: "Error1",
                timestamp: timestamp,
                action: 2
            }]
        };

        fs.writeFileSync("n1.db", "Hello content! This is not a valid sqlite3 database file!");

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");

            var msgCount = 0;
            n1.on("call:error", async call => {
                try {
                    msgCount++;
                    call.args[0].message.should.match(/file is not a database/);
                    msgCount.should.equal(1);
                } catch (e) {
                    done(e);
                }
            });
            n2.on("input", function (msg) {
                try {
                    msgCount++;
                    msg.payload.statusCode.should.equal(200);
                    msg.payload.body.result[0].current_item_index.should.equal(0);
                    msgCount.should.equal(2);
                    fs.existsSync("n1.db").should.true;
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });

    it("Send stored data after restart Node", function (done) {
        var timestamp = (new Date()).toISOString();
        var data = {
            items: [{
                type: 1,
                id: "Error1",
                timestamp: timestamp,
                action: 2
            }]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            n1.receive({
                payload: data
            });
            helper.unload().then(() => {
                helper.load(monitoringNode, flow, function () {
                    var n2 = helper.getNode("n2");
                    n2.on("input", function (msg) {
                        try {
                            msg.payload.statusCode.should.equal(200);
                            msg.payload.should.have.property("body");
                            msg.payload.body.result[0].current_item_index.should.equal(0);
                            var item = JSON.parse(msg.payload.body.result[0].current_item);
                            item.should.deepEqual(data.items[0]);
                            done();
                        } catch (e) {
                            done(e);
                        }
                    });
                });
            });
        });
    });

    it("3s delay, FIFO, 1s polling", function (done) {
        // wait for more distance to previous test to prevent timestamp collision
        sleep(3000).then(function () {

            var flow = createFlow({
                delay: 3,
                cycleTime: 1,
                priorityMode: Storage.PriorityMode.FIFO
            });

            var base = new Date(new Date() - 2000);
            var data = {
                items: [
                    {
                        type: 4,
                        id: "Sensor 1",
                        timestamp: new Date(base.getTime() + 0).toISOString(),
                        value: 123.456
                    },
                    {
                        type: 4,
                        id: "String 1",
                        timestamp: new Date(base.getTime() + 0).toISOString(),
                        value_string: "my string text"
                    }, {
                        type: 4,
                        id: "Bool 1",
                        timestamp: new Date(base.getTime() + 0).toISOString(),
                        value_boolean: true
                    },
                    {
                        type: 1,
                        id: "Error1",
                        timestamp: new Date(base.getTime() + 3333).toISOString(),
                        action: 2
                    },
                    {
                        type: 2,
                        id: "prd",
                        timestamp: new Date(base.getTime() + 3333).toISOString()
                    },
                    {
                        type: 3,
                        id: "PRODUCT",
                        timestamp: new Date(base.getTime() + 3333).toISOString(),
                        count: 1,
                        quality: 1
                    }
                ]
            };

            helper.load(monitoringNode, flow, function () {
                var n1 = helper.getNode("n1");
                var n2 = helper.getNode("n2");
                var msgCount = 0;
                n2.on("input", function (msg) {
                    try {
                        msgCount++;
                        msg.should.have.property("payload");
                        msg.payload.should.have.property("statusCode");
                        msg.payload.statusCode.should.equal(200);
                        msg.payload.should.have.property("body");

                        switch (msgCount) {
                            case 1:
                                msg.payload.body.result[0].items_count.should.equal(3);
                                break;
                            case 2:
                                msg.payload.body.result[0].items_count.should.equal(3);
                                var current_item = JSON.parse(msg.payload.body.result[0].current_item);
                                should(data.items[5]).be.deepEqual(current_item); // item PRODUCT
                                done();
                                break;
                            default: break;
                        }

                    } catch (e) {
                        done(e);
                    }
                });
                n1.receive({
                    payload: data
                });
            });
        });
    });

    it("Events first", function (done) {

        var flow = createFlow({
            delay: 0,
            cycleTime: 5,
            priorityMode: Storage.PriorityMode.EventsFirst
        });

        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 3,
                    id: "PRODUCT",
                    timestamp: timestamp,
                    count: 1,
                    quality: 1
                },
                {
                    type: 2,
                    id: "prd",
                    timestamp: timestamp
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msg.should.have.property("payload");
                    msg.payload.should.have.property("statusCode");
                    msg.payload.statusCode.should.equal(200);
                    msg.payload.should.have.property("body");

                    msg.payload.body.result[0].items_count.should.equal(2);
                    var current_item = JSON.parse(msg.payload.body.result[0].current_item);
                    should(data.items[0]).be.deepEqual(current_item); // item PRODUCT
                    done();

                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });
    it("Events last", function (done) {

        var flow = createFlow({
            delay: 0,
            cycleTime: 5,
            priorityMode: Storage.PriorityMode.EventsLast
        });

        var timestamp = (new Date()).toISOString();
        var data = {
            items: [
                {
                    type: 2,
                    id: "prd",
                    timestamp: timestamp
                },
                {
                    type: 3,
                    id: "PRODUCT",
                    timestamp: timestamp,
                    count: 1,
                    quality: 1
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msg.should.have.property("payload");
                    msg.payload.should.have.property("statusCode");
                    msg.payload.statusCode.should.equal(200);
                    msg.payload.should.have.property("body");

                    msg.payload.body.result[0].items_count.should.equal(2);
                    var current_item = JSON.parse(msg.payload.body.result[0].current_item);
                    should(data.items[0]).be.deepEqual(current_item); // item prd
                    done();

                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data
            });
        });
    });

    it("Upload equipment configuration, alarm classes before alarms", function (done) {
        // Hint: creates or updates "UnitTest Class" and "unittest_alarm"
        // on the equipment type of the test equipment
        var config = {
            alarms: [
                {
                    id: "unittest_alarm",
                    text: "UnitTest Alarm",
                    type: "Warning",
                    class: { name: "UnitTest Class" }
                }
            ],
            alarmclasses: [
                {
                    name: "UnitTest Class",
                    color: "#C7BF20"
                }
            ]
        };

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            var n3 = helper.getNode("n3");
            var paths = [];
            var finished = false;
            var finish = function (e) {
                if (finished) return;
                finished = true;
                done(e);
            };

            // error output
            n3.on("input", function (msg) {
                finish(msg.payload instanceof Error ? msg.payload : new Error(JSON.stringify(msg.payload)));
            });
            n2.on("input", function (msg) {
                try {
                    [200, 202].should.containEql(msg.payload.statusCode);
                    paths.push(msg.payload.request.uri.path);
                    if (paths.length == 2) {
                        // alarm classes have to be sent first, alarms reference them
                        paths[0].should.endWith("/configuration/alarmclasses");
                        paths[1].should.endWith("/configuration/alarms");
                        finish();
                    }
                } catch (e) {
                    finish(e);
                }
            });
            n1.receive({
                payload: config
            });
        });
    });

    it("Flush buffer sends data immediately", function (done) {
        // long cycle time: without flush nothing would be sent during this test
        var flow = createFlow({
            cycleTime: 3600
        });
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: (new Date()).toISOString(),
                    action: 2
                }
            ]
        };

        helper.load(monitoringNode, flow, async function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            var flushed = false;

            n2.on("input", function (msg) {
                try {
                    flushed.should.be.true("data was sent before the flush");
                    msg.payload.statusCode.should.equal(200);
                    msg.payload.body.result[0].current_item_index.should.equal(0);
                    done();
                } catch (e) {
                    done(e);
                }
            });

            // wait for the initial transfer after authentication (starts after 1s, buffer is empty)
            await sleep(3000);
            n1.receive({
                payload: data
            });
            // the data must stay in the buffer until the flush
            await sleep(2000);
            flushed = true;
            n1.receive({
                payload: { buffer: "flush" }
            });
        });
    });

    it("Write input data to log file when logging is enabled", function (done) {
        var logDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-log-"));
        var flow = createFlow({
            SelectionLogToFile: true,
            pathLogFile: logDir,
            pathLogFileType: "str",
            maxNumLogFiles: 2,
            maxNumLogFilesType: "num",
            maxLogFileSize: 1,
            maxLogFileSizeType: "num"
        });

        var cleanup = function () {
            // the logger is shared by all nodes: detach the file logger again
            if (logger._filelogger) {
                logger._filelogger.close();
                logger._filelogger = null;
            }
            try {
                fs.rmSync(logDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            } catch {
                // temp directory, does not matter
            }
        };

        helper.load(monitoringNode, flow, async function () {
            try {
                // message without items/config: only logged, nothing is sent
                helper.getNode("n1").receive({
                    payload: { unittest: "log entry" }
                });
                await sleep(1000);

                var files = fs.readdirSync(logDir).filter(f => f.endsWith(".log"));
                files.length.should.equal(1);
                files[0].should.equal("MonitoringNode-" + new Date().getFullYear() + "-LogFile.log");

                var content = fs.readFileSync(path.join(logDir, files[0]), "utf8");
                content.should.match(/\[info\] \[Monitoring:n1\] created Log-Files can be found in/);
                content.should.match(/\[data\] \[Monitoring:n1\] Input data:/);
                content.should.match(/"unittest": "log entry"/);
                cleanup();
                done();
            } catch (e) {
                cleanup();
                done(e);
            }
        });
    });

    it("Keep buffered data when the node is closed during a transfer", function (done) {
        // long cycle time: data is only sent by the flush below
        var flow = createFlow({
            cycleTime: 3600
        });
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: (new Date()).toISOString(),
                    action: 2
                }
            ]
        };

        helper.load(monitoringNode, flow, async function () {
            try {
                var n1 = helper.getNode("n1");
                // wait for the initial transfer after authentication (buffer is empty)
                await sleep(3000);
                n1.receive({
                    payload: data
                });
                await sleep(500);

                // start a transfer and close the node while it is running (e.g. redeploy)
                n1.receive({
                    payload: { buffer: "flush" }
                });
                await helper.unload();
                // give late operations of the closed node time to finish
                await sleep(3000);

                // the buffer file and the not yet confirmed item must still exist
                fs.existsSync("n1.db").should.be.true("buffer file was deleted");
                var storage = new Storage("n1");
                await storage.initialize();
                var count = await storage.getStorageDataCount();
                await storage.close();
                count.should.equal(1, "buffered item was lost");
                done();
            } catch (e) {
                done(e);
            }
        });
    });

    it("Accept messages with circular objects (e.g. from http in)", function (done) {
        var data = {
            items: [
                {
                    type: 1,
                    id: "Error1",
                    timestamp: (new Date()).toISOString(),
                    action: 2
                }
            ]
        };
        // like req/res of an "http in" node: not serializable with JSON.stringify
        var req = { url: "/data" };
        req.self = req;

        helper.load(monitoringNode, flow, function () {
            var n1 = helper.getNode("n1");
            var n2 = helper.getNode("n2");
            n2.on("input", function (msg) {
                try {
                    msg.payload.statusCode.should.equal(200);
                    msg.payload.body.result[0].current_item_index.should.equal(0);
                    done();
                } catch (e) {
                    done(e);
                }
            });
            n1.receive({
                payload: data,
                req: req
            });
        });
    });

});