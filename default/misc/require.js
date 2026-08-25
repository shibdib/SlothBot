/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

require("globals")();
require("safeFind")();
require("globals.Helpers")();
require("prototype.creep");
require("prototype.creepCombat");
require("prototype.powerCreep");
require("prototype.roomPosition");
require("prototype.roomObject");
require("prototype.room");
require('module.pathFinder');

// Operations attach Creep/Observer prototypes used by military roles.
// Loaded from main.js loadLoopModules() so a global-reset parse tick does not
// also compile high-command + siege code. Boot tick does not run creeps.