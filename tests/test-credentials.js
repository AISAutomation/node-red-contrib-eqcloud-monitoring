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
    Access data of the test equipment used by the integration tests
    (montoring_spec.js, OAuthClient_spec.js).

    Default: the tests run against a local mock of the EquipmentCloud API
    (tests/helpers/mock-eqcloud.js) with dummy credentials. The mock is started
    and stopped by the mocha root hooks in tests/helpers/hooks.js.

    To run the tests against a real EquipmentCloud system, set ALL of these
    environment variables (never commit real credentials):
        EQCLOUD_TEST_CUSTOMER_ID     customer order number or host address, e.g. https://<host>/<tenant>
        EQCLOUD_TEST_EQ_ID           equipment id
        EQCLOUD_TEST_CLIENT_ID       client id of the equipment
        EQCLOUD_TEST_CLIENT_SECRET   client secret of the equipment
    The equipment type needs the process values "Sensor 1" (numeric), "String 1" (string)
    and "Bool 1" (boolean). For an internal CA use NODE_OPTIONS=--use-system-ca.
*/

const env = process.env;
const useRealSystem = Boolean(env.EQCLOUD_TEST_CUSTOMER_ID && env.EQCLOUD_TEST_EQ_ID
    && env.EQCLOUD_TEST_CLIENT_ID && env.EQCLOUD_TEST_CLIENT_SECRET);

// dummy access data accepted by the mock
const mock = {
    eqID: "node-red-contrib-eqcloud-monitoring",
    clientID: "mock-client-id",
    clientSecret: "mock-client-secret",
    basePath: "/main",
    // running mock server, set by tests/helpers/hooks.js
    server: null
};

const credentials = {
    useRealSystem,
    mock,

    get customerID() {
        if (useRealSystem) return env.EQCLOUD_TEST_CUSTOMER_ID;
        if (!mock.server) throw new Error("EquipmentCloud mock is not running (missing --require tests/helpers/hooks.js?)");
        return mock.server.hostAddress;
    },
    get eqID() {
        return useRealSystem ? env.EQCLOUD_TEST_EQ_ID : mock.eqID;
    },
    get clientID() {
        return useRealSystem ? env.EQCLOUD_TEST_CLIENT_ID : mock.clientID;
    },
    get clientSecret() {
        return useRealSystem ? env.EQCLOUD_TEST_CLIENT_SECRET : mock.clientSecret;
    },
    // value for the basic authentication of the token request: base64 of "clientID:clientSecret"
    get clientCredentials() {
        return Buffer.from(this.clientID + ":" + this.clientSecret).toString("base64");
    }
};

module.exports = credentials;
