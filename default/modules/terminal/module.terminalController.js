/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Facade for the terminal controller subsystem. Implementation lives in ./terminal/.
 */

const profiler = require('tools.profiler');

require('termKeep');
require('termBudget');
require('termMarket');
require('termRun');
require('termInventory');
require('termBanker');
require('termPricing');
require('termBuy');
require('termSell');
require('termDeals');
require('termTransfers');
require('termBalance');

const TerminalControl = require('termClass');

profiler.registerClass(TerminalControl, 'TerminalControl');

module.exports = TerminalControl;