/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

require("globals")();
require("globals.Helpers")();
require("prototype.creep");
require("prototype.creepCombat");
require("prototype.powerCreep");
require("prototype.roomPosition");
require("prototype.roomObject");
require("prototype.room");
require('module.pathFinder');

// Operations
require("operation.scout");
require("operation.guard");
require("operation.hold");
require("operation.claimClear");
require("operation.borderPatrol");
require("operation.harass"); // Harass random rooms of a specific players remotes
require("operation.denial"); // Deny individual rooms remotes