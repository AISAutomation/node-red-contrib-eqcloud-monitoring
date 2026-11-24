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
    Minimal local mock of the EquipmentCloud cloudconnect API, used by the
    integration tests instead of a real EquipmentCloud system.

    Implemented endpoints (relative to the host address):
      POST /cloudconnect/oauth/token                                    client credentials grant
      POST /cloudconnect/api/monitoring/v2/things/{eqID}                monitoring items
      POST /cloudconnect/api/monitoring/v2/things/{eqID}/configuration/{category}

    The item validation mimics the behaviour of the real system as far as the tests need it:
    items are processed in order, the first invalid item stops the processing (412)
    and the index of the last processed item is returned.
*/

"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

// process values known on the equipment type of the test equipment and their value field
const PROCESS_VALUES = {
    "Sensor 1": "value",
    "String 1": "value_string",
    "Bool 1": "value_boolean"
};

const VALUE_FIELDS = {
    value: "number",
    value_string: "string",
    value_boolean: "boolean"
};

class MockEqCloud {

    /**
     * @param {object} options
     * @param {string} options.clientID      accepted client id
     * @param {string} options.clientSecret  accepted client secret
     * @param {string} options.eqID          accepted equipment id
     * @param {string} [options.basePath]    path prefix of the host address, e.g. "/main"
     * @param {number} [options.latency]     response delay in ms (simulates network latency)
     */
    constructor(options) {
        this.clientID = options.clientID;
        this.clientSecret = options.clientSecret;
        this.eqID = options.eqID;
        this.basePath = (options.basePath || "").replace(/\/+$/, "");
        this.latency = options.latency || 0;
        this.tokens = new Set();
        // process values already stored: "id|timestamp"
        this.storedValues = new Set();
        this.server = null;
    }

    get hostAddress() {
        return "http://127.0.0.1:" + this.server.address().port + this.basePath;
    }

    start() {
        this.server = http.createServer((req, res) => this.handle(req, res));
        return new Promise((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(0, "127.0.0.1", () => resolve(this));
        });
    }

    stop() {
        if (!this.server) return Promise.resolve();
        return new Promise(resolve => {
            this.server.closeAllConnections();
            this.server.close(() => resolve());
            this.server = null;
        });
    }

    handle(req, res) {
        var chunks = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
            var body = Buffer.concat(chunks).toString("utf8");
            var reply = this.route(req, body);
            setTimeout(() => {
                res.writeHead(reply.status, { "Content-Type": "application/json" });
                res.end(JSON.stringify(reply.body));
            }, this.latency);
        });
    }

    route(req, body) {
        var url = new URL(req.url, "http://localhost");
        var path = url.pathname;

        if (!path.startsWith(this.basePath + "/cloudconnect/")) {
            return { status: 404, body: { error: "not found" } };
        }
        path = path.substring(this.basePath.length);

        if (req.method !== "POST") {
            return { status: 405, body: { error: "method not allowed" } };
        }

        if (path === "/cloudconnect/oauth/token") {
            return this.token(req, body);
        }

        var match = path.match(/^\/cloudconnect\/api\/monitoring\/v2\/things\/([^/]+)(?:\/configuration\/([^/]+))?$/);
        if (!match) {
            return { status: 404, body: { error: "not found" } };
        }

        if (!this.isAuthorized(req)) {
            return { status: 401, body: { error: "unauthorized" } };
        }
        if (decodeURIComponent(match[1]) !== this.eqID) {
            return { status: 404, body: { error: "equipment not found" } };
        }

        var data;
        try {
            data = JSON.parse(body);
        } catch {
            return { status: 400, body: { error: "invalid json" } };
        }
        if (!data || !Array.isArray(data.items)) {
            return { status: 400, body: { error: "items missing" } };
        }

        if (match[2]) {
            return this.configuration(data.items);
        }
        return this.monitoring(data.items);
    }

    token(req, body) {
        var expected = "Basic " + Buffer.from(this.clientID + ":" + this.clientSecret).toString("base64");
        var params = new URLSearchParams(body);
        if (req.headers.authorization !== expected || params.get("grant_type") !== "client_credentials") {
            return { status: 401, body: { error: "invalid_client" } };
        }
        var token = crypto.randomBytes(16).toString("hex");
        this.tokens.add(token);
        return {
            status: 200,
            body: { access_token: token, token_type: "bearer", expires_in: 3600 }
        };
    }

    isAuthorized(req) {
        var auth = req.headers.authorization || "";
        return auth.startsWith("Bearer ") && this.tokens.has(auth.substring(7))
            && req.headers.clientid === this.clientID;
    }

    configuration(items) {
        return {
            status: 200,
            body: { result: [{ message: "OK", items_count: items.length }] }
        };
    }

    monitoring(items) {
        var accepted = [];
        for (var i = 0; i < items.length; i++) {
            var error = this.validate(items[i], accepted);
            if (error) {
                this.store(accepted);
                return {
                    status: 412,
                    body: {
                        result: [{
                            message: error,
                            items_count: items.length,
                            current_item_index: i,
                            current_item: JSON.stringify(items[i])
                        }]
                    }
                };
            }
            accepted.push(items[i]);
        }
        this.store(accepted);
        return {
            status: 200,
            body: {
                result: [{
                    message: "OK",
                    items_count: items.length,
                    current_item_index: items.length - 1,
                    current_item: items.length > 0 ? JSON.stringify(items[items.length - 1]) : null
                }]
            }
        };
    }

    store(items) {
        items.filter(item => item.type === 4)
            .forEach(item => this.storedValues.add(item.id + "|" + item.timestamp));
    }

    validate(item, accepted) {
        if (![1, 2, 3, 4].includes(item.type)) {
            return "Invalid or missing item type";
        }
        if (typeof item.id !== "string" || item.id.length === 0) {
            return "Missing item id";
        }
        if (typeof item.timestamp !== "string" || isNaN(Date.parse(item.timestamp))) {
            return "Invalid or missing timestamp";
        }
        if (item.type === 1 && typeof item.action !== "number") {
            return "Missing alarm action";
        }
        if (item.type === 4) {
            var fields = Object.keys(VALUE_FIELDS).filter(f => Object.hasOwn(item, f));
            if (fields.length !== 1) {
                return "Exactly one value field expected for process value " + item.id;
            }
            var field = fields[0];
            if (typeof item[field] !== VALUE_FIELDS[field]) {
                return "Invalid value type of " + field + " for process value " + item.id;
            }
            if (PROCESS_VALUES[item.id] && PROCESS_VALUES[item.id] !== field) {
                return "Process value " + item.id + " expects " + PROCESS_VALUES[item.id];
            }
            var key = item.id + "|" + item.timestamp;
            var duplicate = this.storedValues.has(key)
                || accepted.some(a => a.type === 4 && a.id + "|" + a.timestamp === key);
            if (duplicate) {
                return "Only one value per process value and timestamp is allowed: " + item.id;
            }
        }
        return null;
    }
}

module.exports = MockEqCloud;
