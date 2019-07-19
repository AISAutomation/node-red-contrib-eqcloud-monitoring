/*

    Copyright 2019, AIS Automation Dresden GmbH

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

const request = require("request");

module.exports = class OAuthClient {

    constructor(clientID, clientCredentials, tokenUrl) {
        this.clientID = clientID;
        this.clientCredentials = clientCredentials;
        this.tokenUrl = tokenUrl;

        //indicates the the token is expired and needs to refresh it
        this.tokenExpireDate = Date.now();
        this.authHeader = {};
    }

    async authenticate() {        
        var result = await this.wrapRequestPromise({
            url: this.tokenUrl,
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "authorization": "Basic " + this.clientCredentials
            },
            form: {
                "grant_type": "client_credentials"
            }
        });
        
        if (result.statusCode != 200) {
            throw { response: result};
        }

        try {
            //The response as JSON
            var parsedResponse = JSON.parse(result.body);
        } catch (e) {
            throw { error: e, response: result};
        }
        // calculate expire date with 99% token livetime to
        // avoid expiring when sending is in progress
        this.tokenExpireDate = Date.now() + parsedResponse.expires_in * 990;

        //Build the header which is necessary to have access to the server
        this.authHeader = {
            "clientid": this.clientID,
            "content-type": "application/json",
            "authorization": "Bearer " + parsedResponse.access_token,
        };
        return result;
    }

    async sendMessage(data, url) {

        // check if token is expired
        if (Date.now() >= this.tokenExpireDate) {
            // Try to get a new token
            await this.authenticate();
            // hint: if we came up to here, Statuscode is 200 
            // and der there is no need for seperate error handling
        }

        // send data
        return await this.wrapRequestPromise({
            url: url,
            method: "POST",
            headers: this.authHeader,
            json: data
        });
    }

    wrapRequestPromise(req){
        return new Promise((resolve, reject) => {
            request(req, function (err, res, body) {

                if (err) {
                    return reject(err);
                    //return reject({ error: err, response :res});
                }

                //return resolve({ statusCode: res.statusCode, response :res});
                return resolve(res);
            });
        });
    }
};