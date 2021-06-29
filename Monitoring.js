/*

    Copyright 2021, Kontron AIS GmbH

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

const OAuthClient = require("./OAuthClient");
const Storage = require("./Storage");

module.exports = function (RED) {

    const nodeStatus = {
        CONNECTED: "Connected",
        SENDING: "Sending Data...",
        NO_DATA: "No Data",
        NOT_CONNECTED: "Not Connected",
        ERROR: "Error"
    };

    const configCategories = [
        "alarmclasses",
        "alarms",
        "states",
        "events",
        "statemodels",
        "processvalues",
        "oeeparameters"];

    function MonitoringNode(config) {
        /* When new parameters are introduced, they are always null when upgrading existing nodes.
           The default setting of the GUI/HTML only applies to new nodes, 
           therefore the uninitialized parameters must be handled.
        */
        var defaultSettings = {
            cycleTime: 3600,
            maxBufferSize: 100,
            maxItemsPerPackage: 10000,
            delay: 0,
            priorityMode: Storage.PriorityMode.FIFO
        };
        // if a property is not set in config, take default value
        Object.keys(defaultSettings).forEach(key => {
            if (!config[key]) config[key] = defaultSettings[key];
        });

        // create node
        RED.nodes.createNode(this, config);

        // check for all requierd parameters
        var node = this;
        var id = config.id;
        var customerID = RED.util.evaluateNodeProperty(config.customerID, config.customerIDType, node);
        var eqID = RED.util.evaluateNodeProperty(config.eqID, config.eqIDType, node);
        var clientID = RED.util.evaluateNodeProperty(config.clientID, config.clientIDType, node);
        var clientSecret = RED.util.evaluateNodeProperty(config.clientSecret, config.clientSecretType, node);
        var clientCredentials = clientID && clientSecret ? Buffer.from(clientID + ":" + clientSecret).toString("base64") : null;
        var maxBufferSize = (RED.util.evaluateNodeProperty(config.maxBufferSize, config.maxBufferSizeType, node) || defaultSettings.maxBufferSize);
        maxBufferSize = maxBufferSize > 0 ? maxBufferSize : defaultSettings.maxBufferSize;
        var delay = (RED.util.evaluateNodeProperty(config.delay, config.delayType, node) || defaultSettings.delay);
        delay = delay >= 0 ? delay : defaultSettings.delay;
        var priorityMode = (RED.util.evaluateNodeProperty(config.priorityMode, config.priorityModeType, node) || defaultSettings.priorityMode);
        var cycleTime = (RED.util.evaluateNodeProperty(config.cycleTime, config.cycleTimeType, node) || defaultSettings.cycleTime);
        cycleTime = cycleTime > 0 ? cycleTime : defaultSettings.cycleTime;

        if (!(id && customerID && eqID && clientID && clientCredentials)) {
            handleException(new Error("Not all parameters set!"));
            return;
        }

        // set initial status
        var currentStatus = undefined;
        setNodeStatus(nodeStatus.NOT_CONNECTED);

        // set up REST client:
        var hostAddress;

        // check for alternativ host address
        if (customerID.startsWith("http")) {
            // right trim /
            hostAddress = customerID.replace(new RegExp("[/]+$"), "");
        }
        // check for 'C' in customer order number
        else if (customerID.toUpperCase().startsWith("C")) {
            hostAddress = "https://eqcloud.kontron-ais.com/" + customerID;
        } else {
            hostAddress = "https://eqcloud.kontron-ais.com/C" + customerID;
        }

        var tokenUrl = hostAddress + "/cloudconnect/oauth/token";
        var cloudUrl = hostAddress + "/cloudconnect/api/monitoring/v2/things/" + eqID;

        node.debug("Host address: " + cloudUrl);

        var client = new OAuthClient(clientID, clientCredentials, tokenUrl);

        // set up buffer
        var storage = new Storage(
            id,
            maxBufferSize,
            delay,
            priorityMode
        );
        var storageInitializationInProgress = false;
        var storageInitialized = false;
        async function initStorage() {
            try {
                node.debug("Open storage file " + id + ".db");
                storageInitializationInProgress = true;
                await storage.initialize();
                storageInitialized = true;
                storageInitializationInProgress = false;
            } catch (e) {
                storageInitializationInProgress = false;
                handleException(e);
            }
        }
        async function waitForStorage() {
            // wait until initialization has finished
            while (storageInitializationInProgress) {
                var waitPromise = new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(true);
                    }, 100);
                });
                await Promise.all([waitPromise]);
            }
        }
        initStorage();

        //Triggers if a new message comes to the node
        node.on("input", async function (msg) {
            //Check for config elements in message and identify (alarms, products, etc.)
            for (const category of configCategories) {
                if (msg.payload.hasOwnProperty(category)) {
                    await handleConfigData(
                        msg.payload[category],
                        category);
                }
            }

            //Monitoring messages
            if (msg.payload.hasOwnProperty("items")) {
                await handleData(msg.payload.items);
            }
        });

        node.on("close", async function (removed, done) {
            // stop job to send data from buffer to cloud
            try {
                clearTimeout(timer);
                timer = null;
                await waitForStorage();
                // save close storage
                await storage.close();

                if (removed) {
                    // This node has been deleted
                    // delete storage file to keep disk clean
                    await storage.delete();
                }
            } catch (e) {
                handleException(e);
            }
            done();
        });

        async function handleConfigData(items, category) {
            //Store data in buffer
            try {
                await waitForStorage();
                await storage.storeConfigData({ items: items }, category);

            } catch (e) {
                handleException(e);
            }
        }

        async function handleData(items) {
            //Store data in buffer
            try {
                await waitForStorage();
                await storage.storeData({
                    items: items
                });
            } catch (e) {
                handleException(e);
            }
        }

        async function setNodeStatus(status) {

            //do nothing when status not changed
            if (currentStatus == status) return;

            currentStatus = status;
            node.debug("Status: " + status);
            // set GUI indication status
            switch (status) {
                case nodeStatus.CONNECTED:
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: status
                    });
                    break;
                case nodeStatus.SENDING:
                case nodeStatus.NO_DATA:
                    node.status({
                        fill: "yellow",
                        shape: "dot",
                        text: status
                    });
                    break;
                default:
                    node.status({
                        fill: "red",
                        shape: "dot",
                        text: status
                    });
                    break;
            }
        }

        async function transferringConfigDataToCloud() {
            var data;
            // Hint: its not allowed to call any other async function between
            // last call of loading config data and first call loading history data (transferringDataToCloud/storage.getStorageData).
            // Otherwise the loss of data is possible.             
            while ((data = await storage.getStorageConfigData()).categories.length > 0) {
                //sort sending categories by priority
                data.categories.sort(function (a, b) { return configCategories.indexOf(a.category) - configCategories.indexOf(b.category); });

                // set node status to sending
                setNodeStatus(nodeStatus.SENDING);

                for (const cat of data.categories) {

                    node.debug("Config: add " + cat.items.length + " " + cat.category);

                    var response = await client.sendMessage(
                        { "items": cat.items },
                        cloudUrl + "/configuration/" + cat.category);

                    switch (response.statusCode) {
                        case 200: // Ok
                        case 202: // Accepted
                        case 412: // Procondition failed
                        case 413: // Payload to large 
                            break; // accept these statuscodes
                        default: // otherwise there is an error
                            throw {
                                response: response
                            };
                    }

                    //send response to output
                    node.send({
                        payload: {
                            statusCode: response.statusCode,
                            body: response.body,
                            headers: response.headers,
                            request: {
                                uri: response.request.uri,
                                method: response.request.method,
                                headers: response.request.headers,
                            }
                        }
                    });

                    // on Precondition fail, do not handle this as an exception
                    // but inform user about the error
                    if (response.statusCode == 412) {
                        var errorOutput = new Error(response.body.result[0].message + "\nEnable \"Force Bulk Upload\" for this Equipment to ignore this error.");
                        node.error(errorOutput);
                        node.send([null, {
                            payload: errorOutput
                        }]);
                    }
                }

                // delete all items processed from storage
                // Hint: this includes all items causing an error. 
                // This prevents queue processing from being blocked by a single error.
                await storage.deleteConfigData(data.firstIndex, data.lastIndex);
            }
        }

        async function transferringDataToCloud() {

            var repeatReadingBuffer = true;
            while (repeatReadingBuffer) {
                var readStartDate = new Date();

                node.debug("Reading...");
                var limit = config.maxItemsPerPackage;
                var data = await storage.getStorageData(limit);

                var itemCount = data.items.length;
                node.debug("Read " + itemCount + " items from buffer");

                var readEndDate = new Date();
                node.debug("Reading time " + ((readEndDate - readStartDate) / 1000).toFixed(3)) + "s";

                // do nothing is there is no data
                if (itemCount == 0) {
                    // set status to no data when current status was connected (=first loop)
                    // so error status will not be overwritten
                    if (currentStatus == nodeStatus.CONNECTED) {
                        setNodeStatus(nodeStatus.NO_DATA);
                    }
                    // set status to connected when current status was sending (>first loop)
                    else if (currentStatus == nodeStatus.SENDING) {
                        setNodeStatus(nodeStatus.CONNECTED);
                    }
                    return;
                }

                // set node status to sending
                setNodeStatus(nodeStatus.SENDING);

                var sendStartDate = new Date();

                var response = await client.sendMessage({
                    "items": data.items
                }, cloudUrl);
                switch (response.statusCode) {
                    case 200: // Ok
                    case 202: // Accepted
                    case 412: // Procondition failed
                    case 413: // Payload to large 
                        break; // accept these statuscodes
                    default: // otherwise there is an error
                        throw {
                            response: response
                        };
                }

                // send response to output
                node.send({
                    payload: {
                        statusCode: response.statusCode,
                        body: response.body,
                        headers: response.headers,
                        request: {
                            uri: response.request.uri,
                            method: response.request.method,
                            headers: response.request.headers,
                        }
                    }
                });

                var sendEndDate = new Date();
                node.debug("Sending time " + ((sendEndDate - sendStartDate) / 1000).toFixed(3)) + "s";

                // update internal item limit for each call with given limit from response
                // but respect a max package size of 100000 items per call
                // to keep a single call at a manageable size.
                var newMaxItemsPerPackage = Math.min(response.body.result[0].max_allowed_items, 100000);
                // if necessary override internal item limit for each call with given limit in response
                if (newMaxItemsPerPackage != config.maxItemsPerPackage) {
                    // Hint: to avoid race condition in this async method we have to await 
                    // for a seperate function to override the value
                    await overrideMaxItemsPerPackage(newMaxItemsPerPackage);
                }
                // delete all processed items from storage 
                // Hint: this includes the last processed item although it caused by an error. 
                // This prevents queue processing from being blocked by a single error.                        
                await storage.deleteData(data.ids.slice(0, response.body.result[0].current_item_index + 1));

                // on Precondition fail, do not handle this as an exception
                // but inform user about the error
                if (response.statusCode == 412) {
                    var errorOutput = new Error(response.body.result[0].message + "\nEnable \"Force Bulk Upload\" for this Equipment to ignore this error.");
                    node.error(errorOutput);
                    node.send([null, {
                        payload: errorOutput
                    }]);
                }

                // if too many items has been send, retry to send data
                // maxItemsPerPackage has been upated above to the new limit
                if (response.statusCode == 413) {
                    node.debug(response.body.result[0].message + "\nChanged limit to " + newMaxItemsPerPackage);
                }
                // otherweise check for repeat reading buffer
                // do not repeat when all sended data has been processed and max package size was not reached
                else if (response.body.result[0].current_item_index + 1 == itemCount && itemCount < limit) {
                    repeatReadingBuffer = false;
                }
            }

            // buffer is empty, all data sended, set node status to connected
            setNodeStatus(nodeStatus.CONNECTED);
        }


        async function overrideMaxItemsPerPackage(value) {
            config.maxItemsPerPackage = value;
        }

        function handleException(e) {
            var errorOutput;
            // handle indirect exception:            
            //console.log(JSON.stringify(e, null, 4));
            // if contains a response with statuscode but no inner execption
            // evaluate the statuscode
            if (e.response && !e.error) {
                switch (e.response.statusCode) {
                    case 401:
                        setNodeStatus(nodeStatus.NOT_CONNECTED);
                        errorOutput = new Error("Unauthorized!");
                        break;
                    case 404:
                        setNodeStatus(nodeStatus.ERROR);
                        errorOutput = new Error("Not found!");
                        break;
                    case 409:
                        setNodeStatus(nodeStatus.ERROR);
                        errorOutput = new Error("Conflict!");
                        break;
                    case 500:
                        setNodeStatus(nodeStatus.ERROR);
                        errorOutput = new Error("Internal Server Error!");
                        break;
                    default:
                        setNodeStatus(nodeStatus.ERROR);
                        // add some info for service logs
                        errorOutput = new Error("Unexpected error!"
                            + "\nStatus Code: " + e.response.statusCode
                            + "\nBody: " + JSON.stringify(e.response.body));
                        break;
                }
            }
            // else handle the inner exception
            else if (e.error) {
                setNodeStatus(nodeStatus.ERROR);
                errorOutput = e.error;
            }
            // send response to output to make it accasable for user (for debug, etc.)
            if (e.response) {
                node.send({
                    payload: {
                        statusCode: e.response.statusCode,
                        body: e.response.body,
                        headers: e.response.headers,
                        request: {
                            uri: e.response.request.uri,
                            method: e.response.request.method,
                            headers: e.response.request.headers,
                        }
                    }
                });
            }

            // handle direct exception:
            if (!(e.error || e.response)) {
                setNodeStatus(nodeStatus.ERROR);
                errorOutput = e;
            }

            if (errorOutput) {
                node.error(errorOutput);
                node.send([null, {
                    payload: errorOutput
                }]);
            }

            //broken storge file?            
            if (e.message && (e.message == "Database file corrupted" ||
                e.message.includes("file is not a database") ||
                e.message.includes("UNIQUE constraint failed") ||
                e.message.includes("Unexpected string in JSON") ||
                e.message.includes("unable to open database file") ||
                e.message.includes("SQLITE_MISUSE: Database is closed"))) {
                node.debug("Delete old storage file and retry to open database");
                const func = async () => {
                    storageInitialized = false;
                    try {
                        await storage.close();
                    } catch (e) {
                        // does not matter
                    }
                    try {
                        await storage.delete();
                        storageInitializationInProgress = true;
                        await storage.initialize();
                        storageInitializationInProgress = false;
                        storageInitialized = true;
                    } catch (e) {
                        storageInitializationInProgress = false;
                        node.error(e);
                        node.send([null, {
                            payload: e
                        }]);
                    }
                };
                func();
            }
        }

        // set job to send data from buffer to cloud 
        // - start with small delay after startup (see initial timer)
        // - repeat with cycle time
        async function transmitData() {
            var jobStartDate = Date.now();
            node.debug("Start Job sending Data to Cloud");
            if (storageInitialized) {
                try {
                    await transferringConfigDataToCloud();
                    await transferringDataToCloud();
                } catch (e) {
                    handleException(e);
                }
            } else {
                node.debug("Storage not initialized");
            }

            var jobEndDate = Date.now();
            node.debug("Job finished after " + ((jobEndDate - jobStartDate) / 1000).toFixed(3)) + "s";

            // set next cycle time
            // - balance drift
            // - minimum of 1 second for next cycle, so there is no endless transmitting
            var nextCycle = Math.max(cycleTime * 1000 - (jobEndDate - jobStartDate), 1000);
            resetTimerForTransmitData(nextCycle);
        }

        // inital timer        
        // - Authenticate always the first call, no matter if data was buffered or not
        var timer = setTimeout(async () => {
            try {
                await client.authenticate();
                // hint: if we came up to here, Statuscode is 200 
                // and der there is no need for seperate error handling
                setNodeStatus(nodeStatus.CONNECTED);

                //send data to cloud
                transmitData();
            } catch (e) {
                handleException(e);
                // retry authentication with next cycle
                resetTimerForTransmitData(cycleTime);
            }
        }, 1000);

        function resetTimerForTransmitData(timeout) {
            // prevent transmitData() resetting the timer again if node was disposed
            if (timer) {
                timer = setTimeout(() => transmitData(), timeout);
            }
        }
    }
    RED.nodes.registerType("Monitoring", MonitoringNode);
};