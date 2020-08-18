/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.setRoomState = function (room) {
  if (Game.time % 10 === 0) {
    // Set Energy Needs
    let energyInRoom = room.energy;
    //Delete old memory
    room.memory.energyIncomeArray = undefined;
    room.memory.energySurplus = undefined;
    room.memory.extremeEnergySurplus = undefined;
    room.memory.energyNeeded = undefined;
    // Request builders
    if (Math.random() > 0.7) requestBuilders(room);
    let last = room.memory.lastEnergyAmount || 0;
    room.memory.lastEnergyAmount = energyInRoom;
    let energyIncomeArray = [];
    // Backwards compatibility
    if (ROOM_ENERGY_INCOME_ARRAY[room.name])
      energyIncomeArray = JSON.parse(ROOM_ENERGY_INCOME_ARRAY[room.name]);
    if (energyIncomeArray.length < 50) {
      energyIncomeArray.push(energyInRoom - last);
    } else {
      energyIncomeArray.shift();
      energyIncomeArray.push(energyInRoom - last);
    }
    room.memory.energyPositive = average(energyIncomeArray) > 0;
    ROOM_ENERGY_INCOME_ARRAY[room.name] = JSON.stringify(energyIncomeArray);
  }
};

function requestBuilders(room) {
    room.memory.buildersNeeded = !_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN).length || !_.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER).length;
}