let shib = require("shibBench");

module.exports.setRoomState = function (room) {
    // Set Energy Needs
    let cpu = Game.cpu.getUsed();
    log.d('Energy Status');
    let terminalEnergy = 0;
    if (room.terminal) terminalEnergy = room.terminal.store[RESOURCE_ENERGY] || 0;
    let storageEnergy = 0;
    if (room.storage) storageEnergy = room.storage.store[RESOURCE_ENERGY] || 0;
    let containerEnergy = 0;
    _.filter(room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] && s.id !== room.memory.controllerContainer).forEach((c) => c.store[RESOURCE_ENERGY] + containerEnergy);
    let linkEnergy = 0;
    _.filter(room.structures, (s) => s.structureType === STRUCTURE_LINK && s.energy && s.id !== room.memory.controllerLink).forEach((c) => c.energy + linkEnergy);
    let energyInRoom = terminalEnergy + storageEnergy + containerEnergy + linkEnergy;
    room.memory.energySurplus = energyInRoom >= ENERGY_AMOUNT;
    room.memory.extremeEnergySurplus = energyInRoom >= 100000;
    room.memory.energyNeeded = energyInRoom < ENERGY_AMOUNT * 0.8;
    if (Game.time % 5 === 0) {
        let last = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = energyInRoom;
        let energyIncomeArray = room.memory.energyIncomeArray || [];
        if (energyIncomeArray.length < 50) {
            energyIncomeArray.push(energyInRoom - last)
        } else {
            energyIncomeArray.shift();
            energyIncomeArray.push(energyInRoom - last);
        }
        room.memory.energyPositive = average(energyIncomeArray) > 0;
        room.memory.energyIncomeArray = energyIncomeArray;
        let energyAvailableArray = roomEnergyArray[room.name] || [];
        if (energyAvailableArray.length < 50) {
            energyAvailableArray.push(energyInRoom)
        } else {
            energyAvailableArray.shift();
            energyAvailableArray.push(energyInRoom);
        }
        roomEnergyArray[room.name] = energyAvailableArray;
    }
    // Set room state
    if (!room.memory.lastStateChange || (room.memory.lastStateChange + 3000) < Game.time) {
        room.memory.lastStateChange = Game.time;
        let averageIncome = _.round(average(room.memory.energyIncomeArray), 0);
        // Special Case (Turtler)
        if (room.controller.level >= 4 && (!room.memory.remoteRooms || !room.memory.remoteRooms.length || room.memory.shellShock)) {
            room.memory.state = -1;
            //log.a(room.name + ' has been classified as a turtle centric room.')
        } else
        // Needs Energy
        if (averageIncome < 10 && !room.memory.energySurplus) {
            room.memory.state = 0;
            //log.a(room.name + ' has been classified as a energy starved room.')
        } else
        // Middling State
        if (averageIncome < 10 && room.memory.energySurplus && !room.memory.extremeEnergySurplus) {
            room.memory.state = 1;
            //log.a(room.name + ' has been classified as a struggling economically room.')
        } else
        // Budding State
        if (averageIncome > 30 && room.memory.energySurplus && !room.memory.extremeEnergySurplus) {
            room.memory.state = 2;
            //log.a(room.name + ' has been classified as a prospering room.')
        } else
        // Faltering State
        if (averageIncome < 10 && room.memory.extremeEnergySurplus) {
            room.memory.state = 3;
            //log.a(room.name + ' has been classified as a faltering rich room.')
        } else
        // Rich State
        if (averageIncome > 30 && room.memory.extremeEnergySurplus) {
            room.memory.state = 4;
            //log.a(room.name + ' has been classified as a rich room.')
        }
    }
    shib.shibBench('roomEnergyStatus', cpu);
};