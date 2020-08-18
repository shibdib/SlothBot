/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (powerCreep) {
  // If not spawned return
  if (!powerCreep.ticksToLive) return;
  // Handle border
  if (powerCreep.borderCheck()) return;
  // Handle upgrades
  upgradePowers(powerCreep);
  // Generate Ops
  if (
    powerCreep.powers[PWR_GENERATE_OPS] &&
    !powerCreep.powers[PWR_GENERATE_OPS].cooldown
  )
    abilitySwitch(powerCreep, PWR_GENERATE_OPS);
  // Get Ops from terminal
  if (
    powerCreep.room.store(RESOURCE_OPS) &&
    _.size(powerCreep.powers) > 1 &&
    powerCreep.store[RESOURCE_OPS] <
      powerCreep.store.getCapacity(RESOURCE_OPS) * 0.5
  ) {
    let store;
    if (powerCreep.room.storage.store[RESOURCE_OPS])
      store = powerCreep.room.storage;
    else if (powerCreep.room.terminal.store[RESOURCE_OPS])
      store = powerCreep.room.terminal;
    if (store) {
      switch (powerCreep.withdraw(store, RESOURCE_OPS)) {
        case OK:
          return;
        case ERR_NOT_IN_RANGE:
          powerCreep.shibMove(store);
          return;
      }
    }
  }
  // Store ops to sell in terminal
  if (
    powerCreep.store[RESOURCE_OPS] &&
    powerCreep.room.terminal &&
    (_.size(powerCreep.powers) === 1 ||
      powerCreep.store[RESOURCE_OPS] >= powerCreep.store.getCapacity() * 0.6)
  ) {
    let amount =
      powerCreep.store[RESOURCE_OPS] - powerCreep.store.getCapacity() * 0.5;
    if (_.size(powerCreep.powers) === 1)
      amount = powerCreep.store[RESOURCE_OPS];
    switch (
      powerCreep.transfer(powerCreep.room.terminal, RESOURCE_OPS, amount)
    ) {
      case OK:
        return;
      case ERR_NOT_IN_RANGE:
        powerCreep.shibMove(powerCreep.room.terminal);
        return;
    }
  }
  // Handle renewal
  if (powerCreep.ticksToLive <= 1000) {
    let spawn =
      _.filter(
        powerCreep.room.structures,
        (s) => s.my && s.structureType === STRUCTURE_POWER_SPAWN
      )[0] ||
      _.filter(
        powerCreep.room.structures,
        (s) => s.structureType === STRUCTURE_POWER_BANK
      )[0];
    if (spawn) {
      switch (powerCreep.renew(spawn)) {
        case OK:
          break;
        case ERR_NOT_IN_RANGE:
          return powerCreep.shibMove(spawn, { range: 1 });
      }
    }
  }
  // level 0 idle
  if (!powerCreep.level) return powerCreep.idleFor(10);
  // Handle room assignment
  if (
    powerCreep.memory.destinationRoom &&
    powerCreep.memory.destinationRoom !== powerCreep.room.name
  ) {
    return powerCreep.shibMove(
      new RoomPosition(25, 25, powerCreep.memory.destinationRoom),
      { range: 17 }
    );
  } else if (!powerCreep.memory.destinationRoom) {
    powerCreep.memory.destinationRoom = _.filter(
      Memory.myRooms,
      (r) =>
        !_.filter(Game.powerCreeps, (c) => c.memory.destinationRoom === r)
          .length && Game.rooms[r].controller.level === 8
    )[0];
  }
  // Handle owned rooms
  if (
    powerCreep.room.controller.owner &&
    powerCreep.room.controller.owner.username === MY_USERNAME
  ) {
    let targetSpawn = _.filter(
      powerCreep.room.structures,
      (s) =>
        s.my &&
        s.structureType === STRUCTURE_SPAWN &&
        s.spawning &&
        s.spawning.remainingTime >= 15 &&
        (!s.effects || !s.effects.length)
    )[0];
    let targetTower = _.filter(
      powerCreep.room.structures,
      (s) =>
        s.my &&
        s.structureType === STRUCTURE_TOWER &&
        (!s.effects || !s.effects.length)
    )[0];
    let targetObserver = _.filter(
      powerCreep.room.structures,
      (s) =>
        s.my &&
        s.structureType === STRUCTURE_OBSERVER &&
        (!s.effects || !s.effects.length)
    )[0];
    let targetFactory = _.filter(
      powerCreep.room.structures,
      (s) =>
        s.my &&
        s.structureType === STRUCTURE_FACTORY &&
        (!s.effects || !s.effects.length)
    )[0];
    let targetSource = _.filter(
      powerCreep.room.sources,
      (s) => !s.effects || !s.effects.length
    )[0];
    let targetLab = _.filter(
      powerCreep.room.structures,
      (s) =>
        s.my &&
        s.structureType === STRUCTURE_LAB &&
        s.memory.creating &&
        !s.memory.itemNeeded &&
        (!s.effects || !s.effects.length)
    )[0];
    // Enable power
    if (!powerCreep.room.controller.isPowerEnabled) {
      switch (powerCreep.enableRoom(powerCreep.room.controller)) {
        case OK:
          break;
        case ERR_NOT_IN_RANGE:
          return powerCreep.shibMove(powerCreep.room.controller, { range: 1 });
      }
    }
    // Boost tower when under attack
    else if (
      targetTower &&
      Memory.roomCache[powerCreep.room.name].responseNeeded &&
      powerCreep.powers[PWR_OPERATE_TOWER] &&
      !powerCreep.powers[PWR_OPERATE_TOWER].cooldown &&
      powerCreep.ops >= POWER_INFO[PWR_OPERATE_TOWER].ops
    ) {
      powerCreep.say("TOWER", true);
      return abilitySwitch(powerCreep, PWR_OPERATE_TOWER, targetTower);
    }
    // Fill extensions
    else if (
      powerCreep.powers[PWR_OPERATE_EXTENSION] &&
      !powerCreep.powers[PWR_OPERATE_EXTENSION].cooldown &&
      powerCreep.ops >= POWER_INFO[PWR_OPERATE_EXTENSION].ops &&
      1 -
        powerCreep.room.energyAvailable /
          powerCreep.room.energyCapacityAvailable >
        0.2 &&
      ((powerCreep.room.storage &&
        powerCreep.room.storage.store[RESOURCE_ENERGY] >= 5000) ||
        (powerCreep.room.terminal &&
          powerCreep.room.terminal.store[RESOURCE_ENERGY] >= 5000))
    ) {
      powerCreep.say("FILL", true);
      if (
        powerCreep.room.storage &&
        powerCreep.room.storage.store[RESOURCE_ENERGY] >= 5000
      ) {
        return abilitySwitch(
          powerCreep,
          PWR_OPERATE_EXTENSION,
          powerCreep.room.storage
        );
      } else {
        return abilitySwitch(
          powerCreep,
          PWR_OPERATE_EXTENSION,
          powerCreep.room.terminal
        );
      }
    }
    // Boost Spawn
    else if (
      targetSpawn &&
      powerCreep.powers[PWR_OPERATE_SPAWN] &&
      !powerCreep.powers[PWR_OPERATE_SPAWN].cooldown &&
      powerCreep.ops >= POWER_INFO[PWR_OPERATE_SPAWN].ops
    ) {
      powerCreep.say("SPAWN", true);
      return abilitySwitch(powerCreep, PWR_OPERATE_SPAWN, targetSpawn);
    }
    // Boost Sources
    else if (
      targetSource &&
      powerCreep.powers[PWR_REGEN_SOURCE] &&
      !powerCreep.powers[PWR_REGEN_SOURCE].cooldown
    ) {
      powerCreep.say("SOURCE", true);
      return abilitySwitch(powerCreep, PWR_REGEN_SOURCE, targetSource);
    }
    // Boost Mineral
    else if (
      powerCreep.room.mineral &&
      powerCreep.powers[PWR_REGEN_MINERAL] &&
      !powerCreep.powers[PWR_REGEN_MINERAL].cooldown &&
      (!powerCreep.room.mineral.effects ||
        !powerCreep.room.mineral.effects.length)
    ) {
      powerCreep.say("MINERAL", true);
      return abilitySwitch(
        powerCreep,
        PWR_REGEN_MINERAL,
        powerCreep.room.mineral
      );
    }
    // Boost Factory
    else if (
      targetFactory &&
      targetFactory.memory.producing &&
      powerCreep.powers[PWR_OPERATE_FACTORY] &&
      !powerCreep.powers[PWR_OPERATE_FACTORY].cooldown &&
      powerCreep.ops >= POWER_INFO[PWR_OPERATE_FACTORY].ops &&
      powerCreep.powers[PWR_OPERATE_FACTORY].level ===
        COMMODITIES[targetFactory.memory.producing].level
    ) {
      powerCreep.say("FACTORY", true);
      return abilitySwitch(powerCreep, PWR_OPERATE_FACTORY, targetFactory);
    }
    /**
             // Boost Observer
             else if (targetObserver && powerCreep.powers[PWR_OPERATE_OBSERVER] && !powerCreep.powers[PWR_OPERATE_OBSERVER].cooldown && powerCreep.ops >= POWER_INFO[PWR_OPERATE_OBSERVER].ops) {
            abilitySwitch(powerCreep, PWR_OPERATE_OBSERVER, targetObserver);
        }**/
    // Boost Lab
    else if (
      targetLab &&
      powerCreep.powers[PWR_OPERATE_LAB] &&
      !powerCreep.powers[PWR_OPERATE_LAB].cooldown &&
      powerCreep.ops >= POWER_INFO[PWR_OPERATE_LAB].ops
    ) {
      powerCreep.say("LAB", true);
      return abilitySwitch(powerCreep, PWR_OPERATE_LAB, targetLab);
    }
    // Store Excess Ops
    else if (powerCreep.store[RESOURCE_OPS] >= powerCreep.store.getCapacity()) {
      switch (
        powerCreep.transfer(
          powerCreep.room.terminal,
          RESOURCE_OPS,
          powerCreep.store[RESOURCE_OPS] * 0.5
        )
      ) {
        case OK:
          return;
        case ERR_NOT_IN_RANGE:
          powerCreep.shibMove(powerCreep.room.terminal);
          return;
      }
    } else {
      powerCreep.idleFor(5);
    }
  }
};

function upgradePowers(powerCreep) {
  let sparePowerLevels = Game.gpl.level - _.size(Game.powerCreeps);
  if (_.size(Game.powerCreeps))
    _.filter(Game.powerCreeps, (c) => c.level).forEach(
      (c) => (sparePowerLevels -= c.level)
    );
  if (sparePowerLevels === 0) return;
  // Always have generate ops
  if (!powerCreep.powers[PWR_GENERATE_OPS]) {
    upgradeSwitch(powerCreep, PWR_GENERATE_OPS);
  } else if (
    powerCreep.level >= 7 &&
    powerCreep.powers[PWR_GENERATE_OPS].level < 3
  ) {
    upgradeSwitch(powerCreep, PWR_GENERATE_OPS);
  } else if (
    powerCreep.level >= 14 &&
    powerCreep.powers[PWR_GENERATE_OPS].level < 4
  ) {
    upgradeSwitch(powerCreep, PWR_GENERATE_OPS);
  } else if (
    powerCreep.level >= 22 &&
    powerCreep.powers[PWR_GENERATE_OPS].level < 5
  ) {
    upgradeSwitch(powerCreep, PWR_GENERATE_OPS);
  }
  // Operate Factor
  else if (!powerCreep.powers[PWR_OPERATE_FACTORY]) {
    upgradeSwitch(powerCreep, PWR_OPERATE_FACTORY);
  }
  // Operate Spawn
  else if (!powerCreep.powers[PWR_OPERATE_SPAWN]) {
    upgradeSwitch(powerCreep, PWR_OPERATE_SPAWN);
  }
  // Operate Extension
  else if (!powerCreep.powers[PWR_OPERATE_EXTENSION]) {
    upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION);
  }
  // Operate Tower
  else if (!powerCreep.powers[PWR_OPERATE_TOWER]) {
    upgradeSwitch(powerCreep, PWR_OPERATE_TOWER);
  }
  // Operate Lab
  else if (!powerCreep.powers[PWR_OPERATE_LAB]) {
    upgradeSwitch(powerCreep, PWR_OPERATE_LAB);
  }
  // Second Tier of upgrades (check if new one needs to be spawned
  let worthyRooms = _.filter(
    Game.rooms,
    (r) =>
      r.energyAvailable &&
      r.controller.owner &&
      r.controller.owner.username === MY_USERNAME &&
      r.controller.level >= 8
  );
  if (_.size(Game.powerCreeps) >= 2 || worthyRooms.length < 2) {
    // Regen Source
    if (powerCreep.level >= 10 && !powerCreep.powers[PWR_REGEN_SOURCE]) {
      upgradeSwitch(powerCreep, PWR_REGEN_SOURCE);
    }
    // Regen Mineral
    else if (powerCreep.level >= 10 && !powerCreep.powers[PWR_REGEN_MINERAL]) {
      upgradeSwitch(powerCreep, PWR_REGEN_MINERAL);
    } else if (
      powerCreep.level >= 2 &&
      powerCreep.powers[PWR_GENERATE_OPS].level < 2
    ) {
      upgradeSwitch(powerCreep, PWR_GENERATE_OPS);
    } else if (
      powerCreep.level >= 2 &&
      powerCreep.powers[PWR_OPERATE_SPAWN].level < 2
    ) {
      upgradeSwitch(powerCreep, PWR_OPERATE_SPAWN);
    } else if (
      powerCreep.level >= 2 &&
      powerCreep.powers[PWR_OPERATE_EXTENSION].level < 2
    ) {
      upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION);
    } else if (
      powerCreep.level >= 2 &&
      powerCreep.powers[PWR_OPERATE_TOWER].level < 2
    ) {
      upgradeSwitch(powerCreep, PWR_OPERATE_TOWER);
    } else if (
      powerCreep.level >= 2 &&
      powerCreep.powers[PWR_OPERATE_LAB].level < 2
    ) {
      upgradeSwitch(powerCreep, PWR_OPERATE_LAB);
    }
    if (_.size(Game.powerCreeps) >= 3 || worthyRooms.length < 3) {
      if (
        powerCreep.level >= 7 &&
        powerCreep.powers[PWR_OPERATE_SPAWN].level < 3
      ) {
        upgradeSwitch(powerCreep, PWR_OPERATE_SPAWN);
      } else if (
        powerCreep.level >= 7 &&
        powerCreep.powers[PWR_OPERATE_EXTENSION].level < 3
      ) {
        upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION);
      } else if (
        powerCreep.level >= 7 &&
        powerCreep.powers[PWR_OPERATE_TOWER].level < 3
      ) {
        upgradeSwitch(powerCreep, PWR_OPERATE_TOWER);
      } else if (
        powerCreep.level >= 7 &&
        powerCreep.powers[PWR_OPERATE_LAB].level < 3
      ) {
        upgradeSwitch(powerCreep, PWR_OPERATE_LAB);
      }
      if (_.size(Game.powerCreeps) >= 4 || worthyRooms.length < 4) {
        if (
          powerCreep.level >= 14 &&
          powerCreep.powers[PWR_OPERATE_SPAWN].level < 4
        ) {
          upgradeSwitch(powerCreep, PWR_OPERATE_SPAWN);
        } else if (
          powerCreep.level >= 14 &&
          powerCreep.powers[PWR_OPERATE_EXTENSION].level < 4
        ) {
          upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION);
        } else if (
          powerCreep.level >= 14 &&
          powerCreep.powers[PWR_OPERATE_TOWER].level < 4
        ) {
          upgradeSwitch(powerCreep, PWR_OPERATE_TOWER);
        } else if (
          powerCreep.level >= 14 &&
          powerCreep.powers[PWR_OPERATE_LAB].level < 4
        ) {
          upgradeSwitch(powerCreep, PWR_OPERATE_LAB);
        }
        if (_.size(Game.powerCreeps) >= 5 || worthyRooms.length < 5) {
          if (
            powerCreep.level >= 22 &&
            powerCreep.powers[PWR_OPERATE_SPAWN].level < 5
          ) {
            upgradeSwitch(powerCreep, PWR_OPERATE_SPAWN);
          } else if (
            powerCreep.level >= 22 &&
            powerCreep.powers[PWR_OPERATE_EXTENSION].level < 5
          ) {
            upgradeSwitch(powerCreep, PWR_OPERATE_EXTENSION);
          } else if (
            powerCreep.level >= 22 &&
            powerCreep.powers[PWR_OPERATE_TOWER].level < 5
          ) {
            upgradeSwitch(powerCreep, PWR_OPERATE_TOWER);
          } else if (
            powerCreep.level >= 22 &&
            powerCreep.powers[PWR_OPERATE_LAB].level < 5
          ) {
            upgradeSwitch(powerCreep, PWR_OPERATE_LAB);
          }
        }
      }
    }
  }
}

function abilitySwitch(powerCreep, power, target = undefined) {
                                                                switch (
                                                                  powerCreep.usePower(
                                                                    power,
                                                                    target
                                                                  )
                                                                ) {
                                                                  case OK:
                                                                    break;
                                                                  case ERR_NOT_IN_RANGE:
                                                                    powerCreep.shibMove(
                                                                      target,
                                                                      {
                                                                        range: 3,
                                                                      }
                                                                    );
                                                                    break;
                                                                  case ERR_NOT_ENOUGH_RESOURCES:
                                                                    return false;
                                                                }
                                                              }

function upgradeSwitch(powerCreep, power) {
  switch (powerCreep.upgrade(power)) {
    case OK:
      log.a(powerCreep.name + " just upgraded the " + power + " ability.");
      break;
    case ERR_NOT_ENOUGH_RESOURCES:
      return;
    case ERR_FULL:
      break;
  }
}
