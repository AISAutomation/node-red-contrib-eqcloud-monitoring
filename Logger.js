/*

    Copyright 2023, Kontron AIS GmbH

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

const winston = require("winston");
require("winston-daily-rotate-file");

module.exports = {
    _filelogger: null,
    _node: null,
    init: function(node){
        this._node = node;
    },
    addFileLogger: function (id, pathLogFile, maxLogFileSize, maxNumLogFiles, level) {
        // custom LogLevels
        const logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            data: 4,
            trace: 5
        };

        // custom format
        const formatLogger = winston.format.combine(
            winston.format.label({ label: "Monitoring:" + id }),
            winston.format.timestamp({ format: "D MMM HH:mm:ss" }),
            winston.format.printf(({ level, message, label, timestamp }) => {
                return `${timestamp} - [${level}] [${label}] ${message}`;
            })
        );

        this._filelogger = winston.createLogger({
            levels: logLevels,
            format: formatLogger,
            transports: [
                new winston.transports.DailyRotateFile({
                    level: level,  // logs everything from data and below to file 
                    filename: "MonitoringNode-%DATE%-LogFile",
                    extension: ".log",
                    dirname: pathLogFile,
                    datePattern: "YYYY", // "YYYY-DD-MMM-HH-mm"
                    zippedArchive: false,
                    maxSize: maxLogFileSize + "m", // "10k", "20m"
                    maxFiles: maxNumLogFiles
                })
            ]
        });
        this.info("created Log-Files can be found in "
            + (pathLogFile == "" ? "your working directory" : pathLogFile)
            + " , " + maxNumLogFiles + " Log-Files will rotate with a max Size of " + maxLogFileSize + " MB");
    },
    error: function (text) {
        this._node.error(text);
        if (this._filelogger) this._filelogger.error(text);
    },
    warn: function (text) {
        this._node.warn(text);
        if (this._filelogger) this._filelogger.warn(text);
    },
    info: function (text) {
        this._node.log(text);
        if (this._filelogger) this._filelogger.info(text);
    },
    debug: function (text) {
        this._node.debug(text);
        if (this._filelogger) this._filelogger.debug(text);
    },
    data: function (text) {
        if (this._filelogger) this._filelogger.data(text);
    },
    trace: function (text) {
        this._node.trace(text);
        if (this._filelogger) this._filelogger.trace(text);
    },
};
