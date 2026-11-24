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

require("should");
const fs = require("fs");
const os = require("os");
const path = require("path");
const logger = require("../src/Logger.js");

const logFileName = "MonitoringNode-" + new Date().getFullYear() + "-LogFile";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// minimal Node-RED node: records every call
function createNodeMock() {
    const calls = { error: [], warn: [], log: [], debug: [], trace: [] };
    const node = {};
    for (const method of Object.keys(calls)) {
        node[method] = text => calls[method].push(text);
    }
    return { node, calls };
}

function logFiles(dir) {
    return fs.readdirSync(dir).filter(f => f.endsWith(".log")).sort();
}

describe("Logger", function () {
    this.timeout(30000);

    var logDir;

    beforeEach(function () {
        logDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-logger-"));
    });

    afterEach(async function () {
        // the logger is shared by all nodes: detach the file logger again
        if (logger._filelogger) {
            logger._filelogger.close();
            logger._filelogger = null;
        }
        await sleep(200);
        try {
            fs.rmSync(logDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {
            // temp directory, does not matter
        }
    });

    it("forwards messages to the Node-RED node", function () {
        const mock = createNodeMock();
        logger.init(mock.node);

        logger.error("e1");
        logger.warn("w1");
        logger.info("i1");
        logger.debug("d1");
        logger.trace("t1");
        logger.data("data1");

        mock.calls.error.should.eql(["e1"]);
        mock.calls.warn.should.eql(["w1"]);
        mock.calls.log.should.eql(["i1"]);
        mock.calls.debug.should.eql(["d1"]);
        mock.calls.trace.should.eql(["t1"]);
        // data is only written to the log file, never to the Node-RED log
        Object.values(mock.calls).flat().should.not.containEql("data1");
    });

    it("writes to the log file up to level data", async function () {
        const mock = createNodeMock();
        logger.init(mock.node);
        logger.addFileLogger("unittest", logDir, 1, 2, "data");

        logger.error("error text");
        logger.warn("warn text");
        logger.debug("debug text");
        logger.data("data text");
        logger.trace("trace text");
        await sleep(500);

        logFiles(logDir).should.eql([logFileName + ".log"]);
        const content = fs.readFileSync(path.join(logDir, logFileName + ".log"), "utf8");
        content.should.match(/ - \[info\] \[Monitoring:unittest\] created Log-Files can be found in/);
        content.should.match(/ - \[error\] \[Monitoring:unittest\] error text/);
        content.should.match(/ - \[warn\] \[Monitoring:unittest\] warn text/);
        content.should.match(/ - \[debug\] \[Monitoring:unittest\] debug text/);
        content.should.match(/ - \[data\] \[Monitoring:unittest\] data text/);
        // trace is above level data
        content.should.not.match(/trace text/);
    });

    it("rotates log files and keeps the configured number of files", async function () {
        const mock = createNodeMock();
        logger.init(mock.node);
        // max. 1 MB per file, max. 2 files
        logger.addFileLogger("unittest", logDir, 1, 2, "data");

        // write about 3 MB in chunks
        const line = "x".repeat(1000);
        for (let chunk = 0; chunk < 10; chunk++) {
            for (let i = 0; i < 300; i++) {
                logger.data("line " + (chunk * 300 + i) + " " + line);
            }
            await new Promise(resolve => setImmediate(resolve));
        }
        await sleep(1500);

        const files = logFiles(logDir);
        files.length.should.equal(2);
        for (const f of files) {
            f.should.startWith(logFileName);
            // 1 MB + one line tolerance
            fs.statSync(path.join(logDir, f)).size.should.be.belowOrEqual(1024 * 1024 + 2000);
        }
        // the newest entry is still there
        const newest = files.map(f => fs.readFileSync(path.join(logDir, f), "utf8")).join("");
        newest.should.match(/line 2999 /);
    });
});
