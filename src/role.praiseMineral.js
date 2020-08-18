/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
  if (creep.isFull) {
    for (const resourceType in creep.store) {
      switch (creep.transfer(creep.room.terminal, resourceType)) {
        case OK:
          break;
        case ERR_NOT_IN_RANGE:
          creep.shibMove(creep.room.terminal);
          break;
      }
    }
  } else {
    // Check if mineral depleted
    if (
      creep.memory.source &&
      Game.getObjectById(creep.memory.source).mineralAmount === 0
    ) {
      log.a(
        creep.room.name +
          " supply of " +
          Game.getObjectById(creep.memory.source).mineralType +
          " has been depleted. Regen in " +
          Game.getObjectById(creep.memory.source).ticksToRegeneration
      );
      return (creep.memory.recycle = true);
    } else if (creep.memory.source) {
      if (creep.memory.extractor) {
        let extractor = Game.getObjectById(creep.memory.extractor);
        if (!extractor) return (creep.memory.recycle = true);
        if (extractor.cooldown && extractor.pos.getRangeTo(creep) < 2) {
          creep.idleFor(extractor.cooldown - 1);
        } else {
          let mineral = Game.getObjectById(creep.memory.source);
          switch (creep.harvest(mineral)) {
            case ERR_NOT_IN_RANGE:
              creep.shibMove(mineral);
              break;
            case ERR_NOT_FOUND:
              mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
              break;
          }
        }
      } else {
        let extractor = creep.room.structures.filter(
          (s) => s.structureType === STRUCTURE_EXTRACTOR
        )[0];
        if (extractor) {
          creep.memory.extractor = extractor.id;
        } else {
          creep.memory.recycle = true;
        }
      }
    } else {
      creep.findMineral();
    }
  }
};
