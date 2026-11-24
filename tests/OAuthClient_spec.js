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
const OAuthClient = require("../src/OAuthClient.js");

// test equipment (EquipmentCloud mock or real system, see test-credentials.js)
var config = require("./test-credentials.js");

var client;
var hostAddress;

describe("OAuthClient", function () {
    this.timeout(30000);

    before(async function () {
        // check for alternativ host address
        if (config.customerID.startsWith("http")) {
            // right trim /
            hostAddress = config.customerID.replace(new RegExp("[/]+$"), "");
        }
        // check for 'C' in customer order number
        else if (config.customerID.toUpperCase().startsWith("C")) {
            hostAddress = "https://eqcloud.kontron-ais.com/" + config.customerID;
        } else {
            hostAddress = "https://eqcloud.kontron-ais.com/C" + config.customerID;
        }

        var tokenUrl = hostAddress + "/cloudconnect/oauth/token";
        client = new OAuthClient(config.clientID, config.clientCredentials, tokenUrl);
    });

    it("Authenticate with correct credentials", async function () {

        var result = await client.authenticate();

        should(result.status).equal(200);
    });


    it("Authenticate with bad credentials", async function () {
        var badCredentials = Buffer.from(config.clientID + ":wrong-secret").toString("base64");
        var client2 = new OAuthClient(config.clientID, badCredentials, hostAddress + "/cloudconnect/oauth/token");
        try {
            await client2.authenticate();
        }
        catch (result) {
            should(result.response.status).equal(401);
            return;
        }
        should.fail("authentication with bad credentials succeeded");
    });

    it("Send good data", async function () {
        var url = hostAddress + "/cloudconnect/api/monitoring/v2/things/" + config.eqID;
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
        
        var result = await client.sendMessage(data, url);

        should(result.status).equal(200);
        should(result.data.result[0].current_item_index).equal(5);
    });
    
    it("Send bad data", async function () {
        var url = hostAddress + "/cloudconnect/api/monitoring/v2/things/" + config.eqID;
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
                    value_string: "force ERROR value for test"
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
        
        var result = await client.sendMessage(data, url);
        
        should(result.status).equal(412);
        should(result.data.result[0].current_item_index).equal(3);
    });
});