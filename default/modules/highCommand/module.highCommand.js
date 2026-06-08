/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Facade for the high command subsystem. Implementation lives in ./highCommand/.
 */

module.exports.highCommand = require('hcCommand').highCommand;
module.exports.operationSustainability = require('hcSustainability').operationSustainability;
module.exports.generateThreat = require('hcThreat').generateThreat;