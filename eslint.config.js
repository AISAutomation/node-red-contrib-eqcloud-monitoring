"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                ...globals.node
            }
        },
        rules: {
            "indent": ["error", 4, { "SwitchCase": 1 }],
            "linebreak-style": ["warn", "unix"],
            "quotes": ["error", "double"],
            "semi": ["error", "always"]
        }
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.mocha
            }
        }
    }
];
