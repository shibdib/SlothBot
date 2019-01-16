module.exports.setRoomState = function (room) {
    // Set Energy Needs
    let energyInRoom = room.energy;
    room.memory.energySurplus = energyInRoom >= ENERGY_AMOUNT;
    room.memory.extremeEnergySurplus = energyInRoom >= 100000;
    room.memory.energyNeeded = energyInRoom < ENERGY_AMOUNT * 0.8;
    if (Game.time % 5 === 0) {
        let last = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = energyInRoom;
        let energyIncomeArray = [];
        // Backwards compatibility
        if (room.memory.energyIncomeArray && room.memory.energyIncomeArray.constructor === Array) room.memory.energyIncomeArray = undefined;
        if (room.memory.energyIncomeArray) energyIncomeArray = JSON.parse(room.memory.energyIncomeArray);
        if (energyIncomeArray.length < 50) {
            energyIncomeArray.push(energyInRoom - last)
        } else {
            energyIncomeArray.shift();
            energyIncomeArray.push(energyInRoom - last);
        }
        room.memory.energyPositive = average(energyIncomeArray) > 0;
        room.memory.energyIncomeArray = JSON.stringify(energyIncomeArray);
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
        let oldState = room.memory.state || 0;
        let news, averageIncome;
        if (room.memory.energyIncomeArray && JSON.parse(room.memory.energyIncomeArray).length) averageIncome = _.round(average(JSON.parse(room.memory.energyIncomeArray)), 0); else averageIncome = 0;
        // Special Case (Turtler)
        if (room.controller.level >= 4 && room.memory.shellShock) {
            room.memory.state = -1;
            news = room.name + ' has been classified as a turtle centric room.';
        } else
        // Special Case (Low)
        if (room.controller.level < 3) {
            room.memory.state = 4;
            news = room.name + ' has been classified as a low level room.';
        } else
        // Needs Energy
        if (averageIncome < 10 && !room.memory.energySurplus) {
            room.memory.state = 0;
            news = room.name + ' has been classified as a energy starved room.';
        } else
        // Middling State
        if (averageIncome < 10 && room.memory.energySurplus && !room.memory.extremeEnergySurplus) {
            room.memory.state = 1;
            news = room.name + ' has been classified as a struggling economically room.';
        } else
        // Budding State
        if (averageIncome > 30 && room.memory.energySurplus && !room.memory.extremeEnergySurplus) {
            room.memory.state = 2;
            news = room.name + ' has been classified as a prospering room.';
        } else
        // Faltering State
        if (averageIncome < 10 && room.memory.extremeEnergySurplus) {
            room.memory.state = 3;
            news = room.name + ' has been classified as a faltering rich room.';
        } else
        // Rich State
        if (averageIncome > 30 && room.memory.extremeEnergySurplus) {
            room.memory.state = 4;
            news = room.name + ' has been classified as a rich room.';
        }
        if (oldState !== room.memory.state) log.a(news);
    }
};