/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Market sell orders and quick liquidation.
 */

const {getEffectiveSupply} = require('termNetwork');
const {isMarketHub} = require('termMarket');
const {hasRoomOrder, recordCreatedOrder} = require('termCache');
const {recordMarketEnergyCost, canAffordSend} = require('termBudget');
const {recordTransferEnergyCost, markTerminalsUsed} = require('termTransfers');
const {getRoomKeepAmount} = require('termKeep');

const TerminalControl = require('termClass');

const FIRE_SALE_MIN = 100;

Object.assign(TerminalControl.prototype, {

    /**
     * Sell orders do not spend terminal energy (the buyer pays the deal fee).
     * Used when storage is critically full so a mineral-stuffed, energy-poor
     * terminal can still shed stock and make room for the warehouse pile.
     */
    placePressureSellOrders(terminal, myOrders) {
        if (!this.isCapacityPressured(terminal.room)) return false;
        if (Game.market.credits <= 0) return false;

        const sorted = Object.keys(terminal.store).sort((a, b) => {
            const rank = (r) => (r === RESOURCE_ENERGY ? 2 : r === RESOURCE_BATTERY ? 1 : 0);
            const ra = rank(a);
            const rb = rank(b);
            if (ra !== rb) return ra - rb;
            return (terminal.store[b] || 0) - (terminal.store[a] || 0);
        });

        for (const resource of sorted) {
            if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) continue;
            if ((resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY)
                && !this.allowEnergySell(terminal)) continue;
            if (hasRoomOrder(myOrders, terminal.pos.roomName, resource, ORDER_SELL)) continue;

            let sellAmount = this.computePressureDumpAmount(terminal, resource);
            if (sellAmount < FIRE_SALE_MIN) continue;

            const price = this.calculatePrice(ORDER_SELL, resource);
            const orderCost = price * sellAmount * 0.05;
            if (orderCost > Game.market.credits) {
                sellAmount = Math.floor(Game.market.credits / (price * 0.05));
            }
            if (sellAmount < FIRE_SALE_MIN) continue;

            const spec = {
                type: ORDER_SELL,
                resourceType: resource,
                price,
                totalAmount: sellAmount,
                roomName: terminal.pos.roomName
            };
            if (Game.market.createOrder(spec) === OK) {
                recordCreatedOrder(spec);
                log.w(`Pressure Sell Order: ${sellAmount} ${resource} at/per ${price} in ${roomLink(terminal.room.name)}`, "Market: ");
                return true;
            }
        }
        return false;
    },

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (!isMarketHub(terminal.room.name)) return false;
        if (Game.market.credits <= 0) return false;

        for (let resource of Object.keys(terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) {
                if (!this.allowEnergySell(terminal)) continue;
                if (resource === RESOURCE_ENERGY && terminal.room.energyState < 3) continue;
            }

            if (this.empireLabPipelineReserve(resource) > 0) continue;
            if (MY_ROOMS.some(name => {
                const room = Game.rooms[name];
                if (!room) return false;
                if (room.memory.neededCommodity === resource) return true;
                if (room.memory.producingBoost === resource) return true;
                return (room.labs || []).some(lab =>
                    lab.memory?.itemNeeded === resource || lab.memory?.neededBoost === resource
                );
            })) continue;
            if (hasRoomOrder(myOrders, terminal.pos.roomName, resource, ORDER_BUY)) continue;
            if (hasRoomOrder(myOrders, terminal.pos.roomName, resource, ORDER_SELL)) continue;
            if ((!SELL_BOOSTS || terminal.room.level < 8) && ALL_BOOSTS.includes(resource)) continue;

            if (COMPRESSED_COMMODITIES.includes(resource) && !this.canEmpireSell(resource)) continue;
            if (ALL_BOOSTS.includes(resource) && getEffectiveSupply(resource) < this.getEmpireKeepAmount(resource) * 1.5) continue;

            let sellAmount = this.computeSellableAmount(terminal, resource);
            if (BASE_MINERALS.includes(resource) && sellAmount < REACTION_AMOUNT * 0.5) continue;
            if (sellAmount < 100) continue;

            let price = this.calculatePrice(ORDER_SELL, resource);
            if (resource === RESOURCE_ENERGY) {
                const energyFloor = this.getEnergyValue(globalOrders) * 0.95;
                if (price < energyFloor) price = energyFloor;
            }

            let cost = price * sellAmount * 0.05;
            if (cost > Game.market.credits) {
                sellAmount = Math.floor(Game.market.credits / (price * 0.05));
            }
            if (sellAmount < 100) continue;

            if (createSellOrder(terminal, resource, price, sellAmount)) return true;
        }

        function createSellOrder(terminal, resourceType, price, sellAmount) {
            if (hasRoomOrder(myOrders, terminal.pos.roomName, resourceType, ORDER_SELL)) return false;
            const spec = {
                type: ORDER_SELL,
                resourceType: resourceType,
                price: price,
                totalAmount: sellAmount,
                roomName: terminal.pos.roomName
            };
            if (Game.market.createOrder(spec) === OK) {
                recordCreatedOrder(spec);
                log.w(`New Sell Order: ${resourceType} at/per ${price} in ${roomLink(terminal.room.name)}`, "Market: ");
                return true;
            }
            return false;
        }

        return false;
    },

    /**
     * Score how useful a resource dump would be for an owned destination room.
     * Higher = more "can use it" (demand / hunger). Free space alone ranks lower.
     */
    scoreOwnedResourceNeed(room, resourceType) {
        if (!room?.terminal) return -Infinity;
        const free = room.terminal.store.getFreeCapacity(resourceType);
        if (free < FIRE_SALE_MIN) return -Infinity;

        if (resourceType === RESOURCE_ENERGY) {
            // Only dump energy to rooms that need it — never park in energy-rich rooms.
            const hunger = room.energyState < 1 ? 3 : room.energyState < 2 ? 2 : 0;
            if (!hunger) return -Infinity;
            return hunger * 1e9 + free;
        }

        let need = 0;
        const roomKeep = getRoomKeepAmount(room, resourceType) || 0;
        const have = room.store(resourceType) || 0;
        if (roomKeep > have) need = Math.max(need, roomKeep - have);

        for (const lab of room.labs || []) {
            if (lab.memory?.itemNeeded === resourceType) {
                need = Math.max(need, REACTION_AMOUNT - (lab.store[resourceType] || 0));
            }
            if (lab.memory?.neededBoost === resourceType) {
                const amt = lab.memory.amount || 0;
                need = Math.max(need, amt - (lab.store[resourceType] || 0));
            }
        }
        if (room.memory.producingBoost === resourceType) {
            need = Math.max(need, REACTION_AMOUNT);
        }
        if (room.memory.neededCommodity === resourceType) {
            need = Math.max(need, REACTION_AMOUNT);
        }

        const hub = Memory._banker && Memory._banker.marketHub === room.name;
        if (need > 0) return 1e9 + need + free;
        if (hub) return 1e8 + free;
        return -Infinity;
    },

    /**
     * Ally help-request destinations that want this resource (LOAN / alliance).
     * Returns [{roomName, username, amount, priority}] sorted by priority desc.
     */
    getAllyResourceRequests(resourceType) {
        if (!global.LOAN_CHECK || !ALLY_HELP_REQUESTS) return [];
        const out = [];
        for (const username in ALLY_HELP_REQUESTS) {
            if (username === MY_USERNAME || !FRIENDLIES.includes(username)) continue;
            const ally = ALLY_HELP_REQUESTS[username];

            if (resourceType === RESOURCE_ENERGY) {
                for (const entry of ally?.requests?.funnel || []) {
                    if (!entry?.roomName) continue;
                    out.push({
                        roomName: entry.roomName,
                        username,
                        amount: entry.maxAmount || 25000,
                        priority: 1,
                    });
                }
            }

            for (const req of ally?.requests?.resource || []) {
                if (!req?.roomName || req.resourceType !== resourceType) continue;
                out.push({
                    roomName: req.roomName,
                    username,
                    amount: req.amount || 25000,
                    priority: req.priority || 0.5,
                });
            }
        }
        out.sort((a, b) => b.priority - a.priority);
        return out;
    },

    quickSell(terminal, globalOrders) {
        const MIN_QUICKSELL_PROFIT = 100;
        if (!this.isCapacityPressured(terminal.room)) return false;

        // Largest stacks first, but dump minerals before energy/batteries so we
        // free capacity without market-selling energy first.
        const sortedKeys = Object.keys(terminal.store).sort((a, b) => {
            const rank = (r) => (r === RESOURCE_ENERGY ? 2 : r === RESOURCE_BATTERY ? 1 : 0);
            const ra = rank(a);
            const rb = rank(b);
            if (ra !== rb) return ra - rb;
            return (terminal.store[b] || 0) - (terminal.store[a] || 0);
        });

        const transferFactor = roomName => 1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, roomName) / 30);
        const transactionCost = (amount, roomName) => Math.ceil(amount * transferFactor(roomName));
        const maxAffordable = (energy, roomName) => {
            const factor = transferFactor(roomName);
            if (factor <= 0) return energy;
            return Math.floor(energy / factor);
        };
        const isHostile = roomName => INTEL[roomName] && HOSTILES.includes(INTEL[roomName].user);

        const clampSendAmount = (sellAmount, resourceType, destRoomName, destFree) => {
            sellAmount = Math.min(sellAmount, destFree, 25000);
            if (resourceType !== RESOURCE_ENERGY
                && transactionCost(sellAmount, destRoomName) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], destRoomName);
            }
            if (resourceType === RESOURCE_ENERGY) {
                const fee = transactionCost(sellAmount, destRoomName);
                if (fee + sellAmount > terminal.store[RESOURCE_ENERGY]) {
                    sellAmount = Math.max(0, terminal.store[RESOURCE_ENERGY] - fee - 1);
                }
            }
            return sellAmount;
        };

        const sendToRoom = (destRoomName, sellAmount, resourceType, label) => {
            const destRoom = Game.rooms[destRoomName];
            // Owned rooms need a live terminal. Ally dests may be unvisible;
            // Screeps still accepts send() to a known room name.
            if (_.includes(MY_ROOMS, destRoomName) && !destRoom?.terminal) return false;
            if (destRoom && !destRoom.terminal) return false;
            const destFree = destRoom?.terminal
                ? destRoom.terminal.store.getFreeCapacity(resourceType)
                : sellAmount;
            sellAmount = clampSendAmount(sellAmount, resourceType, destRoomName, destFree);
            if (sellAmount < FIRE_SALE_MIN) return false;
            const txCost = Game.market.calcTransactionCost(sellAmount, terminal.pos.roomName, destRoomName);
            const energyCost = (resourceType === RESOURCE_ENERGY ? sellAmount : 0) + txCost;
            if (!canAffordSend(energyCost, {emergency: true})) return false;
            if (terminal.send(resourceType, sellAmount, destRoomName) !== OK) return false;
            recordTransferEnergyCost(terminal, resourceType, sellAmount, destRoomName);
            markTerminalsUsed(terminal.room.name, destRoomName, resourceType);
            log.w(`${label}: ${sellAmount} ${resourceType} to ${roomLink(destRoomName)} from ${roomLink(terminal.room.name)}.`, "Market: ");
            return true;
        };

        // 1) Owned rooms that can use / store the resource.
        const dumpToOwned = (sellAmount, resourceType) => {
            const owned = [];
            for (const name of MY_ROOMS) {
                if (name === terminal.room.name) continue;
                const room = Game.rooms[name];
                if (!room?.terminal || !room.controller || room.controller.level < 6) continue;
                if (this.isCapacityPressured(room)) continue;
                if (room.terminal.store.getFreeCapacity(resourceType) < FIRE_SALE_MIN) continue;
                const score = this.scoreOwnedResourceNeed(room, resourceType);
                if (score === -Infinity) continue;
                owned.push({name, score});
            }
            owned.sort((a, b) => b.score - a.score);
            for (const {name} of owned) {
                if (sendToRoom(name, sellAmount, resourceType, 'Pressure dump (owned)')) return true;
            }
            return false;
        };

        // 2) Allies that explicitly requested this resource.
        const dumpToAllyRequests = (sellAmount, resourceType) => {
            const requests = this.getAllyResourceRequests(resourceType);
            for (const req of requests) {
                // Prefer live vision of the ally room when available.
                const destRoom = Game.rooms[req.roomName];
                if (destRoom?.terminal) {
                    if (destRoom.terminal.store.getFreeCapacity(resourceType) < FIRE_SALE_MIN) continue;
                } else {
                    // No vision: still try send if we have a request room name
                    // (Screeps allows send to known room names).
                    const intel = INTEL[req.roomName];
                    if (intel?.owner && !FRIENDLIES.includes(intel.owner) && intel.owner !== MY_USERNAME) continue;
                }
                const amount = Math.min(sellAmount, req.amount || sellAmount);
                if (sendToRoom(req.roomName, amount, resourceType, `Pressure dump (ally ${req.username})`)) {
                    return true;
                }
            }
            return false;
        };

        const findBestBuyer = (resourceType, sellAmount) => {
            const energy = terminal.store[RESOURCE_ENERGY] || 0;
            const orders = globalOrders.filter(o => {
                if (o.resourceType !== resourceType || o.type !== ORDER_BUY) return false;
                if (o.roomName === terminal.pos.roomName || _.includes(MY_ROOMS, o.roomName)) return false;
                if (isHostile(o.roomName)) return false;
                const affordable = Math.min(sellAmount, o.remainingAmount, maxAffordable(energy, o.roomName));
                return affordable >= FIRE_SALE_MIN;
            });
            if (orders.length === 0) return null;

            const energyPrice = this.getEnergyValue(globalOrders);
            const netProfit = o => {
                const amount = Math.min(sellAmount, o.remainingAmount, maxAffordable(energy, o.roomName));
                return amount * o.price - transactionCost(amount, o.roomName) * energyPrice;
            };
            const best = _.max(orders, netProfit);
            return netProfit(best) > MIN_QUICKSELL_PROFIT ? best : null;
        };

        const findAnyBuyer = (resourceType) => {
            const orders = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                o.roomName !== terminal.pos.roomName &&
                !_.includes(MY_ROOMS, o.roomName) &&
                !isHostile(o.roomName) &&
                o.remainingAmount >= FIRE_SALE_MIN
            );
            if (!orders.length) return null;
            return _.max(orders, 'price');
        };

        const handleSale = (buyer, sellAmount, resourceType, fireSale = false) => {
            sellAmount = Math.min(sellAmount, buyer.remainingAmount);
            if (transactionCost(sellAmount, buyer.roomName) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], buyer.roomName);
            }
            if (sellAmount < FIRE_SALE_MIN) return false;
            if (!fireSale && sellAmount * buyer.price < 5) return false;
            const txCost = Game.market.calcTransactionCost(sellAmount, terminal.pos.roomName, buyer.roomName);
            if (!canAffordSend(txCost, {emergency: true})) return false;
            if (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName) !== OK) return false;
            recordMarketEnergyCost(terminal.room.name, txCost);
            const credits = buyer.price * sellAmount;
            if (fireSale) {
                log.w(`FIRE SALE: Dumped ${sellAmount} ${resourceType} to ${roomLink(buyer.roomName)} for ${credits} credits to clear space in ${roomLink(terminal.room.name)}.`, "Market: ");
            } else {
                log.w(`Pressure sell: ${sellAmount} ${resourceType} for ${credits} credits from ${roomLink(terminal.room.name)}`, "Market: ");
            }
            if (Memory._banker) Memory._banker.spendingAccount += credits * 0.75;
            this.recordBankerDeal('sell', resourceType, sellAmount, credits);
            return true;
        };

        for (const resourceType of sortedKeys) {
            // Under pressure only protect THIS room's active lab/boost work.
            const dumpAmount = this.computePressureDumpAmount(terminal, resourceType);
            if (dumpAmount < FIRE_SALE_MIN) continue;

            // 1) Own rooms that can use / store it.
            if (dumpToOwned(dumpAmount, resourceType)) return true;

            // 2) Allies with explicit requests for this resource.
            if (dumpToAllyRequests(dumpAmount, resourceType)) return true;

            // 3–4) Market: energy/battery still gated; all resources use profitable then firesale.
            if (resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) {
                if (!this.allowEnergySell(terminal)) continue;
            }

            // 3) Profitable market sale.
            const profitable = findBestBuyer(resourceType, dumpAmount);
            if (profitable && handleSale(profitable, dumpAmount, resourceType, false)) return true;

            // 4) Fire sale — last resort.
            const anyBuyer = findAnyBuyer(resourceType);
            if (anyBuyer && handleSale(anyBuyer, dumpAmount, resourceType, true)) return true;
        }
        return false;
    }

});
