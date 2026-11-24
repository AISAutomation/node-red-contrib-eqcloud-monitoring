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
    Mocha root hooks (loaded with --require): start the EquipmentCloud mock
    once for all tests, unless the tests run against a real system
    (see tests/test-credentials.js).
*/

"use strict";

const credentials = require("../test-credentials.js");
const MockEqCloud = require("./mock-eqcloud.js");

exports.mochaHooks = {
    async beforeAll() {
        if (credentials.useRealSystem) {
            console.log("Integration tests run against " + credentials.customerID);
            return;
        }
        credentials.mock.server = await new MockEqCloud({
            clientID: credentials.mock.clientID,
            clientSecret: credentials.mock.clientSecret,
            eqID: credentials.mock.eqID,
            basePath: credentials.mock.basePath,
            // like a real network: a transfer takes some time
            // (needed e.g. to close the node while a transfer is running)
            latency: 200
        }).start();
    },

    async afterAll() {
        if (credentials.mock.server) {
            await credentials.mock.server.stop();
            credentials.mock.server = null;
        }
    }
};
