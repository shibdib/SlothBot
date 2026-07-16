/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Terminal resource and energy balancing.

 */


const {executePlannedTransfers, markTerminalsUsed, recordTransferEnergyCost, canUseTerminal} = require('termTransfers');

const TerminalControl = require('termClass');

const ENERGY_SEND_MIN = 5000;


Object.assign(TerminalControl.prototype, {

    relieveStoragePressure(terminal) {
        const storage = terminal.room.storage;
        const terminalPressure = terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1;
        const storagePressure = storage && storage.store.getFreeCapacity() < STORAGE_CAPACITY * 0.1;
        if (!terminalPressure && !storagePressure) return false;
        return this.executePlannedTransfers(terminal, {kinds: ['pressure', 'urgent', 'battery', 'energy', 'resource', 'ally', 'hub']});
    },

    executePlannedTransfers(terminal, options) {
        return executePlannedTransfers(terminal, options);
    },

    emergencyEnergy(terminal) {
        const roomIntel = INTEL[terminal.room.name];
        if (!terminal.room.energyState || !terminal.store[RESOURCE_ENERGY] || terminal.room.memory.dangerousAttack
            || (roomIntel && roomIntel.threatLevel) || terminal.room.nukes.length) {
            return false;
        }
        if (!canUseTerminal(terminal.room.name)) return false;

        let responseNeeded = _.filter(MY_ROOMS, (r) => {
            if (r === terminal.room.name || !INTEL[r]) return false;
            const room = Game.rooms[r];
            return room && room.memory.dangerousAttack && room.terminal && !room.energyState;
        });
        if (!responseNeeded.length) return false;

        let lowestEnergyRoom = _.min(responseNeeded, (r) => Game.rooms[r].energy);
        let needyTerminal = Game.rooms[lowestEnergyRoom].terminal;
        if (!needyTerminal || !canUseTerminal(needyTerminal.room.name)) return false;

        let availableAmount = Math.floor((terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER) * 0.2);
        availableAmount = terminalExportableEnergy(terminal, needyTerminal.room.name, Math.max(availableAmount, ENERGY_SEND_MIN));
        if (availableAmount < ENERGY_SEND_MIN) return false;

        if (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name) === OK) {
            recordTransferEnergyCost(terminal, RESOURCE_ENERGY, availableAmount, needyTerminal.room.name);
            markTerminalsUsed(terminal.room.name, needyTerminal.room.name, RESOURCE_ENERGY);
            log.a(`Emergency Supplies: Sent ${availableAmount} ${RESOURCE_ENERGY} to ${roomLink(needyTerminal.room.name)} from ${roomLink(terminal.room.name)}`, "Market: ");
            return true;
        }
        return false;
    }

});