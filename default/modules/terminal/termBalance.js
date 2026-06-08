/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Terminal resource and energy balancing.

 */


const state = require('termState');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    balanceResources(terminal) {
        // Sort by most to least so we send surplus first
        let sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[b] - terminal.store[a]);
        for (let resource of sortedKeys) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            let keepAmount = this.determineKeepAmount(resource);
            if (terminal.room.store(resource) < keepAmount) continue;

            // How much can we send while keeping at least keepAmount total in this room
            let available = Math.max(0, terminal.room.store(resource) - keepAmount);
            available = Math.min(available, terminal.store[resource]); // can't send more than what's in terminal
            if (available < 100) continue;

            // Search own rooms first (faster and preferred over allies)
            const needyTerminal = MY_ROOMS
                .filter(r => r !== terminal.room.name && Game.rooms[r] && Game.rooms[r].terminal)
                .map(r => Game.rooms[r].terminal)
                .find(t =>
                    (!state.usedTerminals[t.room.name] || state.usedTerminals[t.room.name].tick + 10 < Game.time) &&
                    t.store.getFreeCapacity() > available &&
                    t.room.store(resource) < this.determineKeepAmount(resource) &&
                    Game.market.calcTransactionCost(available, terminal.room.name, t.room.name) < available * 0.25
                );

            let targetRoom;
            if (needyTerminal) {
                targetRoom = needyTerminal.room.name;
            } else {
                for (const key in ALLY_HELP_REQUESTS) {
                    if (key === MY_USERNAME) continue;
                    const ally = ALLY_HELP_REQUESTS[key];
                    if (ally && ally.requests && ally.requests.resource && ally.requests.resource.find((re) => re.resourceType === resource)) {
                        targetRoom = ally.requests.resource.find((re) => re.resourceType === resource).roomName;
                        break;
                    }
                }
            }

            if (targetRoom) {
                if (sendResource(terminal, resource, available, targetRoom)) return true;
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
    }

    balanceEnergy(terminal) {
        if (terminal.room.memory.dangerousAttack || terminal.room.energyState < 2) return false;
        if (state.usedTerminals[terminal.room.name] && state.usedTerminals[terminal.room.name].tick > Game.time) return false;

        const surplus = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
        if (surplus < 5000) return false;

        const target = findBestOwnedTarget();
        if (target) return sendEnergyOrBattery(terminal, target.room, target.amount);

        const needyAlly = findNeedyAlly();
        if (needyAlly) return sendEnergyOrBattery(terminal, needyAlly, undefined);
        return false;

        function findBestOwnedTarget() {
            // Only help rooms in genuine crisis (state 0) â€” state 1 rooms should stockpile on their own.
            // Among crisis rooms, prefer the one where we get the most energy delivered per unit of
            // transaction cost (i.e. nearby critical rooms win over distant ones).
            const candidates = MY_ROOMS
                .filter(r => {
                    if (r === terminal.room.name) return false;
                    const room = Game.rooms[r];
                    if (!room || !room.terminal) return false;
                    if (state.usedTerminals[r] && state.usedTerminals[r].tick > Game.time) return false;
                    return room.energyState < 1;
                })
                .map(r => {
                    const room = Game.rooms[r];
                    const energyGap = terminal.room.energy - room.energy;
                    const amount = Math.min(surplus, Math.max(0, Math.floor(energyGap / 2)));
                    if (amount < 5000) return null;
                    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, r);
                    // Reject sends where fees eat more than 25% of the delivered amount
                    if (txCost > amount * 0.25) return null;
                    // Score: energy delivered per unit of transaction cost (prefer cheap, effective sends)
                    const score = (amount - txCost) / (1 + txCost);
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
            // Prefer batteries if destination has a factory â€” same energy value, lower transaction fee
            if (Game.rooms[destinationRoom] && Game.rooms[destinationRoom].factory && terminal.store[RESOURCE_BATTERY]) {
                const bAmount = Math.min(terminal.store[RESOURCE_BATTERY], 500);
                if (bAmount >= 50 && terminal.send(RESOURCE_BATTERY, bAmount, destinationRoom) === OK) {
                    state.usedTerminals[terminal.room.name] = {tick: Game.time};
                    state.usedTerminals[destinationRoom] = {tick: Game.time + 500};
                    return true;
                }
            }

            const sendAmount = amount || Math.min(surplus, 10000);
            if (sendAmount < 5000) return false;

            if (terminal.send(RESOURCE_ENERGY, sendAmount, destinationRoom) === OK) {
                log.i(`Balancing ${sendAmount} energy to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, 'Market: ');
                state.usedTerminals[terminal.room.name] = {tick: Game.time};
                state.usedTerminals[destinationRoom] = {tick: Game.time + 500};
                return true;
            }
            return false;
        }
    }

    emergencyEnergy(terminal) {
        const roomIntel = INTEL[terminal.room.name];
        if (!terminal.room.energyState || !terminal.store[RESOURCE_ENERGY] || terminal.room.memory.dangerousAttack
            || (roomIntel && roomIntel.threatLevel) || terminal.room.nukes.length) {
            return false;
        }

        let responseNeeded = _.filter(MY_ROOMS, (r) => r !== terminal.room.name && INTEL[r] && Game.rooms[r].memory.dangerousAttack && Game.rooms[r].terminal && !Game.rooms[r].energyState);
        if (!responseNeeded.length) return false;

        let lowestEnergyRoom = _.min(responseNeeded, (r) => Game.rooms[r].energy);
        let needyTerminal = Game.rooms[lowestEnergyRoom].terminal;

        let availableAmount = Math.max(terminal.store[RESOURCE_ENERGY] * 0.2, 1);  // Ensure at least 1 energy is sent if possible
        if (availableAmount <= 0) return false;

        if (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name) === OK) {
            log.a(`Emergency Supplies: Sent ${availableAmount} ${RESOURCE_ENERGY} to ${roomLink(needyTerminal.room.name)} from ${roomLink(terminal.room.name)}`, "Market: ");
            return true;
        }
        return false;
    }

});