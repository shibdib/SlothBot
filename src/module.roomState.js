/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.setRoomState = function (room) {
    // Set Energy Needs
    let energyInRoom = room.energy;
    //Delete old memory
    room.memory.energyIncomeArray = undefined;
    room.memory.energySurplus = undefined;
    room.memory.extremeEnergySurplus = undefined;
    room.memory.energyNeeded = undefined;
    if (Game.time % 5 === 0) {
        // Request builders
        if (Math.random() > 0.7) requestBuilders(room);
        let last = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = energyInRoom;
        let energyIncomeArray = [];
        // Backwards compatibility
        if (ROOM_ENERGY_INCOME_ARRAY[room.name]) energyIncomeArray = JSON.parse(ROOM_ENERGY_INCOME_ARRAY[room.name]);
        if (energyIncomeArray.length < 50) {
            energyIncomeArray.push(energyInRoom - last)
        } else {
            energyIncomeArray.shift();
            energyIncomeArray.push(energyInRoom - last);
        }
        room.memory.energyPositive = average(energyIncomeArray) > 0;
        ROOM_ENERGY_INCOME_ARRAY[room.name] = JSON.stringify(energyIncomeArray);
    }
    // Set room state
    if (!room.memory.lastStateChange || (room.memory.lastStateChange + 3000) < Game.time) {
        room.memory.lastStateChange = Game.time;
        let oldState = room.memory.state || 0;
        let news, averageIncome;
        if (ROOM_ENERGY_INCOME_ARRAY[room.name] && JSON.parse(ROOM_ENERGY_INCOME_ARRAY[room.name]).length) averageIncome = _.round(average(JSON.parse(ROOM_ENERGY_INCOME_ARRAY[room.name])), 0); else averageIncome = 0;
        // Special Case (Turtler)
        if (room.controller.level >= 4 && room.memory.turtleMode) {
            room.memory.state = -1;
            news = room.name + ' has been classified as a turtle centric room.';
        } else
        // Special Case (Low)
        if (room.controller.level < 3) {
            room.memory.state = 0;
            news = room.name + ' has been classified as a low level room.';
        } else
        // Needs Energy
        if (averageIncome < 10 && !room.energyState) {
            room.memory.state = 0;
            news = room.name + ' has been classified as a energy starved room.';
        } else
        // Middling State
        if (averageIncome < 10 && room.energyState && room.energyState !== 2) {
            room.memory.state = 1;
            news = room.name + ' has been classified as a struggling economically room.';
        } else
        // Budding State
        if (averageIncome > 10 && room.energyState !== 2) {
            room.memory.state = 2;
            news = room.name + ' has been classified as a prospering room.';
        } else
        // Faltering State
        if (averageIncome < 10 && room.energyState === 2) {
            room.memory.state = 3;
            news = room.name + ' has been classified as a faltering rich room.';
        } else
        // Rich State
        if (averageIncome > 10 && room.energyState === 2) {
            room.memory.state = 4;
            news = room.name + ' has been classified as a rich room.';
        }
        if (oldState !== room.memory.state) log.a(news);
    }
};

function requestBuilders(room) {
    if (!_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN).length || !_.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER).length) {
        room.memory.buildersNeeded = true;
    }
}