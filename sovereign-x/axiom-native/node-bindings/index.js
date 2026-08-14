"use strict";

let addon = null;
try {
  addon = require("./build/Release/axiomx.node");
} catch (e1) {
  try {
    addon = require("./build/Debug/axiomx.node");
  } catch (e2) {
    throw new Error("axiomx.node not built - run: npm install (or node-gyp rebuild) after building uals.dll via sovereign-x/axiom-native/build_vs.bat");
  }
}

module.exports = addon;