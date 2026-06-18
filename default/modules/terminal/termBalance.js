/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Terminal resource and energy balancing.

 */


const state = require('termState');
const FactoryControl = require('module.factoryController');

const TerminalControl = require('termClass');

const RESOURCE_SEND_MAX = 5000;
const RESOURCE_SEND_MIN = 100;
const ENERGY_SEND_MIN = 5000;



Object.assign(TerminalControl.prototype, {

    balanceResources(terminal) {
        const sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[b] - terminal.store[a]);
        for (const resource of sortedKeys) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            const keepAmount = this.determineKeepAmount(resource);
            if (!keepAmount || terminal.room.store(resource) < keepAmount) continue;

            let available = Math.max(0, terminal.room.store(resource) - keepAmount);
            available = Math.min(available, terminal.store[resource] || 0);
            if (available < RESOURCE_SEND_MIN) continue;

            const candidates = [];
            for (const name of MY_ROOMS) {
                if (name === terminal.room.name) continue;
                const room = Game.rooms[name];
                if (!room?.terminal) continue;
                if (state.usedTerminals[name] && state.usedTerminals[name].tick > Game.time) continue;

                const destKeep = this.determineKeepAmount(resource);
                const need = destKeep - room.store(resource);
                if (need < RESOURCE_SEND_MIN) continue;

                const destFree = room.terminal.store.getFreeCapacity(resource);
                if (destFree < RESOURCE_SEND_MIN) continue;

                const amount = Math.min(available, RESOURCE_SEND_MAX, need, destFree);
                if (amount < RESOURCE_SEND_MIN) continue;

                const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, name);
                if (txCost > amount * 0.25) continue;

                candidates.push({room: name, amount, score: need / (1 + txCost)});
            }

            candidates.sort((a, b) => b.score - a.score);
            if (candidates.length && sendResource(terminal, resource, candidates[0].amount, candidates[0].room)) {
                return true;
            }

            for (const key in ALLY_HELP_REQUESTS) {
                if (key === MY_USERNAME) continue;
                const ally = ALLY_HELP_REQUESTS[key];
                const request = ally?.requests?.resource?.find(re => re.resourceType === resource);
                if (!request?.roomName) continue;
                const amount = Math.min(available, RESOURCE_SEND_MAX);
                if (sendResource(terminal, resource, amount, request.roomName)) return true;
            }
        }
        return false;

        function sendResource(terminal, resource, available, destinationRoom) {
            switch (terminal.send(resource, available, destinationRoom)) {
                case OK:
                    log.a(`Balancing ${available} ${resource} to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, "Market: ");
                    state.usedTerminals[destinationRoom] = {tick: Game.time};
                    state.usedTerminals[terminal.room.name] = {tick: Game.time + 50};
                    return true;
            }
        }
    }, balanceBatteries(terminal) {
        if (terminal.room.memory.dangerousAttack) return false;
        if (state.usedTerminals[terminal.room.name] && state.usedTerminals[terminal.room.name].tick > Game.time) return false;

        const keepAmount = this.determineKeepAmount(RESOURCE_BATTERY);
        const surplus = Math.min(
            terminal.store[RESOURCE_BATTERY] || 0,
            Math.max(0, terminal.room.store(RESOURCE_BATTERY) - keepAmount)
        );
        if (surplus < 50) return false;

        const candidates = MY_ROOMS
            .filter(r => r !== terminal.room.name && Game.rooms[r]?.terminal && Game.rooms[r]?.factory)
            .map(r => Game.rooms[r])
            .filter(room => FactoryControl.roomNeedsBatteryInbound(room))
            .map(room => {
                const need = FactoryControl.factoryBatteryInboundNeed(room);
                const amount = FactoryControl.terminalBatterySendAmount(
                    Math.min(surplus, need), room.terminal.store.getFreeCapacity(RESOURCE_BATTERY));
                if (amount < 50) return null;
                const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, room.name);
                if (txCost > amount * 0.25) return null;
                const factoryBats = room.factory?.store[RESOURCE_BATTERY] || 0;
                const terminalBats = room.terminal.store[RESOURCE_BATTERY] || 0;
                const score = (room.rawEnergy / FactoryControl.energyTarget(room))
                    + (need / FactoryControl.FACTORY_BATTERY_MAX)
                    - (factoryBats / FactoryControl.FACTORY_BATTERY_MAX)
                    - (terminalBats / keepAmount);
                return {room: room.name, amount, score};
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

        const target = candidates[0];
        if (!target) return false;

        if (terminal.send(RESOURCE_BATTERY, target.amount, target.room) === OK) {
            const txCost = Game.market.calcTransactionCost(target.amount, terminal.room.name, target.room);
            Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
            const rn = terminal.room.name;
            Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + txCost;
            log.a(`Balancing ${target.amount} ${RESOURCE_BATTERY} to ${roomLink(target.room)} from ${roomLink(terminal.room.name)}`, 'Market: ');
            state.usedTerminals[terminal.room.name] = {tick: Game.time};
            state.usedTerminals[target.room] = {tick: Game.time + 500};
            return true;
        }
        return false;
    }, balanceEnergy(terminal) {
        if (terminal.room.memory.dangerousAttack || terminal.room.energyState < 2) return false;
        if (state.usedTerminals[terminal.room.name] && state.usedTerminals[terminal.room.name].tick > Game.time) return false;

        const stored = terminal.store[RESOURCE_ENERGY] || 0;
        if (stored - TERMINAL_ENERGY_BUFFER < ENERGY_SEND_MIN) return false;

        const target = findBestOwnedTarget();
        if (target) return sendEnergyOrBattery(terminal, target.room, target.amount);

        const needyAlly = findNeedyAlly();
        if (needyAlly) return sendEnergyOrBattery(terminal, needyAlly, undefined);
        return false;

        function findBestOwnedTarget() {
            const candidates = MY_ROOMS
                .filter(r => {
                    if (r === terminal.room.name) return false;
                    const room = Game.rooms[r];
                    if (!room || !room.terminal) return false;
                    if (state.usedTerminals[r] && state.usedTerminals[r].tick > Game.time) return false;
                    return FactoryControl.needsBatteryUnpack(room) || room.energyState < 2;
                })
                .map(r => {
                    const room = Game.rooms[r];
                    const destFree = room.terminal.store.getFreeCapacity(RESOURCE_ENERGY);
                    if (destFree < ENERGY_SEND_MIN) return null;
                    const energyGap = Math.max(0, FactoryControl.energyTarget(room) * 0.25 - room.rawEnergy);
                    const desired = Math.min(RESOURCE_SEND_MAX * 2, destFree, Math.max(ENERGY_SEND_MIN, Math.floor(energyGap)));
                    const amount = terminalExportableEnergy(terminal, r, desired);
                    if (amount < ENERGY_SEND_MIN) return null;
                    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, r);
                    if (txCost > amount * 0.25) return null;
                    const score = (amount - txCost) / (1 + txCost) + (room.energyState < 1 ? 2 : 0);
                    return {room: r, amount, score};
                })
                .filter(Boolean)
                .sort((a, b) => b.score - a.score);

            return candidates[0] || null;
        }

        function findNeedyAlly() {
            let bestFunnel = null;
            for (const key in ALLY_HELP_REQUESTS) {
                if (key === MY_USERNAME) continue;
                const ally = ALLY_HELP_REQUESTS[key];
                if (!ally?.requests?.funnel?.length) continue;
                const entry = _.min(ally.requests.funnel, 'maxAmount');
                if (!bestFunnel || entry.maxAmount < bestFunnel.maxAmount) bestFunnel = entry;
            }
            if (bestFunnel?.roomName) return bestFunnel.roomName;

            for (const key in ALLY_HELP_REQUESTS) {
                if (key === MY_USERNAME) continue;
                const energyReq = ALLY_HELP_REQUESTS[key]?.requests?.resource
                    ?.find(re => re.resourceType === RESOURCE_ENERGY);
                if (energyReq?.roomName) return energyReq.roomName;
            }
        }

        function sendEnergyOrBattery(terminal, destinationRoom, amount) {
            const destRoom = Game.rooms[destinationRoom];
            if (destRoom && destRoom.factory && FactoryControl.roomNeedsBatteryInbound(destRoom) && terminal.store[RESOURCE_BATTERY]) {
                const need = FactoryControl.factoryBatteryInboundNeed(destRoom);
                const bAmount = FactoryControl.terminalBatterySendAmount(
                    Math.min(terminal.store[RESOURCE_BATTERY] || 0, need),
                    destRoom.terminal.store.getFreeCapacity(RESOURCE_BATTERY));
                if (bAmount >= 50 && terminal.send(RESOURCE_BATTERY, bAmount, destinationRoom) === OK) {
                    const txCost = Game.market.calcTransactionCost(bAmount, terminal.room.name, destinationRoom);
                    Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
                    const rn = terminal.room.name;
                    Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + txCost;
                    state.usedTerminals[terminal.room.name] = {tick: Game.time};
                    state.usedTerminals[destinationRoom] = {tick: Game.time + 500};
                    return true;
                }
            }

            const sendAmount = amount || terminalExportableEnergy(terminal, destinationRoom, RESOURCE_SEND_MAX * 2);
            if (sendAmount < ENERGY_SEND_MIN) return false;

            if (terminal.send(RESOURCE_ENERGY, sendAmount, destinationRoom) === OK) {
                const txCost = Game.market.calcTransactionCost(sendAmount, terminal.room.name, destinationRoom);
                const energyCost = sendAmount + txCost;
                Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
                const rn = terminal.room.name;
                Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + energyCost;
                log.i(`Balancing ${sendAmount} energy to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, 'Market: ');
                state.usedTerminals[terminal.room.name] = {tick: Game.time};
                state.usedTerminals[destinationRoom] = {tick: Game.time + 500};
                return true;
            }
            return false;
        }
    }, emergencyEnergy(terminal) {
        const roomIntel = INTEL[terminal.room.name];
        if (!terminal.room.energyState || !terminal.store[RESOURCE_ENERGY] || terminal.room.memory.dangerousAttack
            || (roomIntel && roomIntel.threatLevel) || terminal.room.nukes.length) {
            return false;
        }

        let responseNeeded = _.filter(MY_ROOMS, (r) => r !== terminal.room.name && INTEL[r] && Game.rooms[r].memory.dangerousAttack && Game.rooms[r].terminal && !Game.rooms[r].energyState);
        if (!responseNeeded.length) return false;

        let lowestEnergyRoom = _.min(responseNeeded, (r) => Game.rooms[r].energy);
        let needyTerminal = Game.rooms[lowestEnergyRoom].terminal;

        let availableAmount = Math.floor((terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER) * 0.2);
        availableAmount = terminalExportableEnergy(terminal, needyTerminal.room.name, Math.max(availableAmount, ENERGY_SEND_MIN));
        if (availableAmount < ENERGY_SEND_MIN) return false;

        if (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name) === OK) {
            const txCost = Game.market.calcTransactionCost(availableAmount, terminal.room.name, needyTerminal.room.name);
            const energyCost = availableAmount + txCost;
            Memory.terminalEnergyExpense = Memory.terminalEnergyExpense || {};
            const rn = terminal.room.name;
            Memory.terminalEnergyExpense[rn] = (Memory.terminalEnergyExpense[rn] || 0) + energyCost;
            log.a(`Emergency Supplies: Sent ${availableAmount} ${RESOURCE_ENERGY} to ${roomLink(needyTerminal.room.name)} from ${roomLink(terminal.room.name)}`, "Market: ");
            return true;
        }
        return false;
    }

});