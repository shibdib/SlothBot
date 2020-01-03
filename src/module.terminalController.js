/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 6/21/2017.
 */

let reactionNeeds = REACTION_NEEDS;
let tradeAmount = TRADE_AMOUNT;
let reactionAmount = REACTION_AMOUNT;
let runOnce, globalOrders, lastPriceAdjust;

module.exports.terminalControl = function (room) {
    let myOrders = Game.market.orders;
    //Things that don't need to be run for every terminal
    if (runOnce !== Game.time) {
        //Get global orders
        globalOrders = Game.market.getAllOrders();
        //Cleanup broken or old orders
        orderCleanup(myOrders);
        //Update prices
        if (lastPriceAdjust + 100 < Game.time) {
            pricingUpdateSell(globalOrders, myOrders);
            lastPriceAdjust = Game.time;
        }
        // Tracker
        //trackPriceData(globalOrders);
        runOnce = Game.time;
    }
    //Use extra creds to buy energy
    if (Game.market.credits >= 2500) {
        //Extend/Place buy orders if we have enough buffer cash
        if (placeReactionOrders(room.terminal, globalOrders, myOrders)) return;
        //Use extra creds to buy needed items for boosts
        if (onDemandReactionOrders(room.terminal, globalOrders)) return;
        //Buy Power
        if (buyPower(room.terminal, globalOrders)) return;
    }
    placeEnergyOrders(room.terminal, globalOrders, myOrders);
    //Handle Sell Orders
    manageSellOrders(room.terminal, globalOrders, myOrders);
    placeSellOrders(room.terminal, globalOrders, myOrders);
    //Dump Excess
    if (fillBuyOrders(room.terminal, globalOrders)) return;
    //Send energy to rooms under siege
    if (emergencyEnergy(room.terminal)) return;
    //Disperse Minerals and Boosts
    if (balanceBoosts(room.terminal)) return;
};

function fillBuyOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY]) {
        for (let resourceType in terminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            let onHand = terminal.store[resourceType];
            let sellOffAmount = DUMP_AMOUNT;
            if (!Game.market.credits || Game.market.credits < 10000) sellOffAmount = 1000;
            if (_.includes(END_GAME_BOOSTS, resourceType)) sellOffAmount = DUMP_AMOUNT * 3;
            if (onHand >= sellOffAmount) {
                let sellableAmount = terminal.store[resourceType] - reactionAmount * 1.2;
                if (!sellableAmount || sellableAmount < 1000) continue;
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(500, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
                if (buyOrder.id && buyOrder.remainingAmount >= sellableAmount) {
                    switch (Game.market.deal(buyOrder.id, sellableAmount, terminal.pos.roomName)) {
                        case OK:
                            log.w(" MARKET: " + terminal.pos.roomName + " Sell Off Completed - " + resourceType + " for " + buyOrder.price * sellableAmount + " credits");
                            return true;
                    }
                    return true;
                } else if (buyOrder.id && buyOrder.remainingAmount < sellableAmount) {
                    switch (Game.market.deal(buyOrder.id, buyOrder.remainingAmount, terminal.pos.roomName)) {
                        case OK:
                            log.w(" MARKET: " + terminal.pos.roomName + " Sell Off Completed - " + resourceType + " for " + buyOrder.price * buyOrder.remainingAmount + " credits");
                            return true;
                    }
                    return true;
                } else if (!buyOrder.id) {
                    let alliedRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(FRIENDLIES, r.user) && r.level >= 6));
                    let randomRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && r.level >= 6)) || _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && r.level >= 6));
                    if (alliedRoom && (_.includes(END_GAME_BOOSTS, resourceType) || _.includes(TIER_2_BOOSTS, resourceType))) {
                        alliedRoom = alliedRoom.name;
                        let allyName = Memory.roomCache[alliedRoom].user;
                        switch (terminal.send(resourceType, 2500, alliedRoom)) {
                            case OK:
                                //log.a(' MARKET: Dumping to ally (' + allyName + ') ' + 2500 + ' ' + resourceType + ' To ' + alliedRoom + ' From ' + terminal.room.name + ' Current Amount - ' + terminal.store[resourceType]);
                                return true;
                        }
                    } else if (randomRoom) {
                        randomRoom = randomRoom.name;
                        let randomName = Memory.roomCache[randomRoom].user;
                        let amount = 10000;
                        if (_.includes(FRIENDLIES, Memory.roomCache[randomRoom].user)) amount = 2500;
                        switch (terminal.send(resourceType, amount, randomRoom)) {
                            case OK:
                                //log.a(' MARKET: Dumping to random player (' + randomName + ') ' + amount + ' ' + resourceType + ' To ' + randomRoom + ' From ' + terminal.room.name + ' Current Amount - ' + terminal.store[resourceType]);
                                return true;
                        }
                    }
                }
            }
        }
    }
}

function manageSellOrders(terminal, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in myOrders) {
                if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && resourceType !== RESOURCE_ENERGY) {
                    let sellableAmount = terminal.store[resourceType] - SELL_OFF_AMOUNT;
                    if (sellableAmount > myOrders[key].remainingAmount && sellableAmount - myOrders[key].remainingAmount > 1000) {
                        if (Game.market.extendOrder(myOrders[key].id, sellableAmount - myOrders[key].remainingAmount) === OK) {
                            log.w(" MARKET: Extended sell order " + myOrders[key].id + " an additional " + sellableAmount - myOrders[key].remainingAmount + " " + resourceType);
                            return true;
                        }
                        continue resource;
                    }
                } else if (myOrders[key].resourceType === RESOURCE_ENERGY && myOrders[key].type === ORDER_SELL) {
                    let sellableAmount = terminal.store[resourceType] - ENERGY_AMOUNT * 3;
                    if (sellableAmount > myOrders[key].remainingAmount && sellableAmount - myOrders[key].remainingAmount > 1000) {
                        if (Game.market.extendOrder(myOrders[key].id, sellableAmount - myOrders[key].remainingAmount) === OK) {
                            log.w(" MARKET: Extended sell order " + myOrders[key].id + " an additional " + sellableAmount - myOrders[key].remainingAmount + " " + resourceType);
                            return true;
                        }
                        continue resource;
                    }
                }
            }
        }
}

function pricingUpdateSell(globalOrders, myOrders) {
    for (let key in myOrders) {
        if (myOrders[key].type === ORDER_SELL) {
            let sellData = getPriceData(myOrders[key].resourceType);
            let salePrice;
            if (sellData.sellAvg25) salePrice = _.last(sellData.sellAvg25); else salePrice = sellData;
            if (salePrice * 1.1 < myOrders[key].price || salePrice * 0.9 > myOrders[key].price) {
                if (Game.market.changeOrderPrice(myOrders[key].id, salePrice) === OK) {
                    log.w(" MARKET: Sell order price change " + myOrders[key].id + " new/old " + salePrice + "/" + myOrders[key].price + " Resource - " + myOrders[key].resourceType);
                }
            }
        }
    }
}

function placeSellOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let resourceType in terminal.store) {
            if (terminal.store[resourceType] >= SELL_OFF_AMOUNT && resourceType !== RESOURCE_ENERGY) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && myOrders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellableAmount = terminal.store[resourceType] - SELL_OFF_AMOUNT;
                let sellData = getPriceData(resourceType);
                let salePrice;
                if (sellData.sellAvg25) salePrice = _.last(sellData.sellAvg25); else salePrice = sellData;
                if (sellableAmount >= 1000) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, salePrice, sellableAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: New Sell Order: " + resourceType + " at/per " + salePrice);
                        return true;
                    }
                }
            }
        }
}

function placeReactionOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < reactionNeeds.length; i++) {
            let storage = terminal.room.storage;
            if (!storage) return;
            let stored = terminal.store[reactionNeeds[i]] + storage.store[reactionNeeds[i]] || 0;
            let minerals = terminal.room.mineral;
            if ((minerals.resourceType === reactionNeeds[i] && minerals.mineralAmount > 0) || stored >= reactionAmount) continue;
            let activeOrder = _.filter(myOrders, (o) => o.roomName === terminal.pos.roomName && o.resourceType === reactionNeeds[i] && o.type === ORDER_BUY)[0];
            if (terminal.store[reactionNeeds[i]] < reactionAmount || !terminal.store[reactionNeeds[i]] && Game.market.credits > 500 && !activeOrder) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === reactionNeeds[i] &&
                    order.type === ORDER_BUY && order.remainingAmount >= 2000 && order.roomName !== terminal.pos.roomName), 'price');
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === reactionNeeds[i] && myOrders[key].type === ORDER_BUY) {
                        let currentSupply;
                        if (isNaN(terminal.store[reactionNeeds[i]]) === true) {
                            currentSupply = myOrders[key].remainingAmount;
                        } else {
                            currentSupply = terminal.store[reactionNeeds[i]] + myOrders[key].remainingAmount;
                        }
                        if (Game.market.credits * 0.1 > (reactionAmount - currentSupply) * buyOrder.price) {
                            if (Game.market.extendOrder(myOrders[key].id, reactionAmount - currentSupply) === OK) {
                                log.w(" MARKET: Extended Reaction buy order " + myOrders[key].id + " an additional " + reactionAmount - currentSupply);
                                return true;
                            }
                        }
                        continue resource;
                    }
                }
                if (Game.market.credits * 0.1 > reactionAmount * buyOrder.price) {
                    if (Game.market.createOrder(ORDER_BUY, reactionNeeds[i], buyOrder.price + 0.001, reactionAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Reaction Needs Buy Order: " + reactionNeeds[i] + " at/per " + (buyOrder.price) + " credits");
                        return true;
                    }
                }
            }
        }
}

function onDemandReactionOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY] > 500 && Game.market.credits >= CREDIT_BUFFER * 2) {
        for (let i = 0; i < reactionNeeds.length; i++) {
            let storage = terminal.room.storage;
            if (!storage) return;
            let stored = terminal.store[reactionNeeds[i]] + storage.store[reactionNeeds[i]] || 0;
            let minerals = terminal.room.mineral;
            if (minerals.resourceType === reactionNeeds[i] || stored >= reactionAmount) continue;
            if (!terminal.store[reactionNeeds[i]] || terminal.store[reactionNeeds[i]] < reactionAmount * 0.5) {
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === reactionNeeds[i] &&
                    order.type === ORDER_SELL && order.remainingAmount >= reactionAmount * 2 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(reactionAmount * 2, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
                if (sellOrder.id) {
                    if (Game.market.deal(sellOrder.id, reactionAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Bought " + reactionAmount + " " + reactionNeeds[i] + " for " + sellOrder.price * reactionAmount + " credits");
                        return true;
                    }
                }
            }
        }
    }
}

function buyPower(terminal, globalOrders) {
    if (terminal.room.controller.level === 8 && terminal.store[RESOURCE_ENERGY] > 500 && Game.market.credits >= CREDIT_BUFFER * 1.2) {
        let storage = terminal.room.storage;
        if (!storage) return;
        let stored = terminal.store[RESOURCE_POWER] + storage.store[RESOURCE_POWER] || 0;
        if (stored >= 5000) return;
        if (!terminal.store[RESOURCE_POWER] || terminal.store[RESOURCE_POWER] < 2500) {
            let sellOrder = _.min(globalOrders.filter(order => order.resourceType === RESOURCE_POWER &&
                order.type === ORDER_SELL && order.remainingAmount >= 5500 && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(5500, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
            if (sellOrder.id) {
                if (Game.market.deal(sellOrder.id, 5500, terminal.pos.roomName) === OK) {
                    log.w(" MARKET: Bought 5500 + " + RESOURCE_POWER + " for " + sellOrder.price * 5500 + " credits");
                    return true;
                }
            }
        }
    }
}

function orderCleanup(myOrders) {
    let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    for (let key in myOrders) {
        if (myOrders[key].type === ORDER_BUY) {
            if (Game.market.credits < 50) {
                if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                    log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " due to low credits");
                    return true;
                }
            }
            // Remove duplicates for same resource
            let duplicate = _.filter(myOrders, (o) => o.roomName === myOrders[key].roomName &&
                o.resourceType === myOrders[key].resourceType && o.type === ORDER_BUY && o.id !== myOrders[key].id);
            if (duplicate.length) {
                duplicate.forEach((duplicateOrder) => Game.market.cancelOrder(duplicateOrder.id))
            }
            if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                if (myOrders[key].remainingAmount > tradeAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + tradeAmount);
                        return true;
                    }
                }
            } else if (myOrders[key].resourceType === RESOURCE_ENERGY) {
                if (_.filter(myRooms, (r) => r.energy >= ENERGY_AMOUNT * 1.2)[0]) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " we have a room with an energy surplus and do not need to purchase energy");
                        return true;
                    }
                }
            }
            if (myOrders[key].amount === 0) {
                if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                    log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " - Order Fulfilled.");
                    return true;
                }
            }
        } else {
            if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                if (myOrders[key].amount < 250) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " - Not enough resources remaining in terminal.");
                        return true;
                    }
                }
            }
        }
        if (!Game.rooms[myOrders[key].roomName]) {
            if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " we no longer own this room");
                return true;
            }
        }
    }
}

function placeEnergyOrders(terminal, globalOrders, myOrders) {
    // Don't buy energy if any room is in a surplus
    let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    if (_.filter(myRooms, (r) => r.memory.energySurplus)[0]) return false;
    // Check if an order exists
    if (_.filter(myOrders, (o) => o.roomName === terminal.pos.roomName &&
        o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY)[0]) return false;
    let energyTarget = ENERGY_AMOUNT;
    // If we have extra credits get more energy
    if (Game.market.credits >= CREDIT_BUFFER) energyTarget *= 2;
    // Check if we don't need energy
    if (terminal.room.energy >= energyTarget * 0.75) return false;
    let myOrderKeys = _.pluck(myOrders, 'id');
    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY &&
        order.type === ORDER_BUY && order.remainingAmount >= 10000 && !_.includes(myOrderKeys, order.id)), 'price');
    let buyableAmount = (energyTarget - terminal.room.energy) + (energyTarget * 0.2);
    let buyPrice = ENERGY_BUY_MAX;
    if (_.round((buyOrder.price + 0.001), 3) < buyPrice) buyPrice = _.round((buyOrder.price + 0.001), 3);
    if (Game.market.createOrder(ORDER_BUY, RESOURCE_ENERGY, buyPrice, buyableAmount, terminal.pos.roomName) === OK) {
        log.w(" MARKET: " + terminal.pos.roomName + " New Energy Buy Order at/per " + buyPrice + " for " + buyableAmount + " Energy.");
        return true;
    }
}

function emergencyEnergy(terminal) {
    // Balance energy
    if (terminal.store[RESOURCE_ENERGY] && !Memory.roomCache[terminal.room.name].requestingSupport) {
        // Find needy terminals
        let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
        let responseNeeded = _.min(_.filter(myRooms, (r) => r.name !== terminal.room.name && (Memory.roomCache[r.name].threatLevel >= 4 || (r.memory.nuke > 1500)) && r.terminal && r.energy < ENERGY_AMOUNT * 2), '.energy');
        if (responseNeeded && responseNeeded.name) {
            let needyTerminal = responseNeeded.terminal;
            // Determine how much you can move
            let availableAmount = terminal.store[RESOURCE_ENERGY] - 5000;
            if (availableAmount <= 0) return false;
            switch (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name)) {
                case OK:
                    log.a(' MARKET: Siege Supplies ' + availableAmount + ' ' + RESOURCE_ENERGY + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name));
                    return true;
            }
        }
    }
}

function balanceBoosts(terminal) {
    // Dont balance if being sieged or broke
    if (Memory.roomCache[terminal.room.name].requestingSupport) return false;
    // Balance energy
    if (terminal.store[RESOURCE_ENERGY] >= TERMINAL_ENERGY_BUFFER) {
        // Loop thru boosts
        let storedResources = Object.keys(terminal.store);
        for (let boost of _.shuffle(_.filter(storedResources, (r) => r !== RESOURCE_ENERGY))) {
            if (terminal.store[boost] >= TRADE_AMOUNT * 0.5) {
                // Find needy terminals
                let needyTerminal = _.sample(_.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && s.room.name !== terminal.room.name && (!s.store[boost] || s.store[boost] < terminal.store[boost] * 0.2)));
                if (needyTerminal) {
                    // Determine how much you can move
                    let availableAmount = terminal.store[boost] * 0.5;
                    switch (terminal.send(boost, availableAmount, needyTerminal.room.name)) {
                        case OK:
                            log.a(' MARKET: Balancing ' + availableAmount + ' ' + boost + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name));
                            return true;
                    }
                }
            }
        }
        // Find needy terminals
        let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
        let needyRoom = shuffle(_.filter(myRooms, (r) => r.name !== terminal.room.name && r.terminal && !r.terminal.cooldown && r.energy < terminal.room.energy * 0.2))[0];
        if (needyRoom) {
            let needyTerminal = needyRoom.terminal;
            // Determine how much you can move
            let availableAmount = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
            switch (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name)) {
                case OK:
                    log.a(' MARKET: Balancing ' + availableAmount + ' ' + RESOURCE_ENERGY + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name));
                    return true;
            }
        }
    }
}

function trackPriceData(orders) {
    let data;
    if (Memory._marketData) data = JSON.parse(Memory._marketData); else data = {};
    for (let resource of RESOURCES_ALL) {
        let sellData = _.filter(orders, (o) => o.resourceType === resource && o.type === ORDER_SELL && o.amount > MINIMUM_MARKET);
        let buyData = _.filter(orders, (o) => o.resourceType === resource && o.type === ORDER_BUY && o.amount > MINIMUM_MARKET);
        if (!data.time) {
            data[resource] = {};
            // Initial Sell Data
            if (_.min(sellData, '.price') !== Infinity && _.min(sellData, '.price').price) data[resource].sellMin = [_.min(sellData, '.price').price]; else data[resource].sellMin = [];
            if (_.max(sellData, '.price') !== Infinity && _.max(sellData, '.price').price) data[resource].sellMax = [_.max(sellData, '.price').price]; else data[resource].sellMax = [];
            if (sellData.length) {
                let sellX = 0;
                sellData.forEach((o) => sellX = o.price + sellX);
                let avg = _.round(sellX / sellData.length, 2);
                data[resource].sellAvg25 = [avg];
                data[resource].sellAvg100 = [avg];
            } else data[resource].sellAvg = [];
            // Initial Buy Data
            if (_.min(buyData, '.price') !== Infinity && _.min(buyData, '.price').price) data[resource].buyMin = [_.min(buyData, '.price').price]; else data[resource].buyMin = [];
            if (_.max(buyData, '.price') !== Infinity && _.max(buyData, '.price').price) data[resource].buyMax = [_.max(buyData, '.price').price]; else data[resource].buyMax = [];
            if (buyData.length) {
                let buyX = 0;
                buyData.forEach((o) => buyX = o.price + buyX);
                let avg = _.round(buyX / buyData.length, 2);
                data[resource].buyAvg25 = [avg];
                data[resource].buyAvg100 = [avg];
            } else data[resource].buyAvg = [];
        } else if (data.time + 1000 < Game.time) {
            if (!data[resource]) data[resource] = {};
            // New sale Data
            if (_.min(sellData, '.price') !== Infinity && _.min(sellData, '.price').price) {
                if (data[resource].sellMin.length >= 25) data[resource].sellMin.shift();
                data[resource].sellMin.push(_.min(sellData, '.price').price);
            }
            if (_.max(sellData, '.price') !== Infinity && _.max(sellData, '.price').price) {
                if (data[resource].sellMax.length >= 25) data[resource].sellMax.shift();
                data[resource].sellMax.push(_.max(sellData, '.price').price);
            }
            if (sellData.length) {
                let sellX = 0;
                sellData.forEach((o) => sellX = o.price + sellX);
                let avg = _.round(sellX / sellData.length, 2);
                if (data[resource].sellAvg25.length >= 25) data[resource].sellAvg25.shift();
                if (data[resource].sellAvg100.length >= 100) data[resource].sellAvg100.shift();
                data[resource].sellAvg25.push(avg);
                data[resource].sellAvg100.push(avg);
            }
            // New buy Data
            if (_.min(buyData, '.price') !== Infinity && _.min(buyData, '.price').price) {
                if (data[resource].buyMin.length >= 25) data[resource].buyMin.shift();
                data[resource].buyMin.push(_.min(sellData, '.price').price);
            }
            if (_.max(buyData, '.price') !== Infinity && _.max(buyData, '.price').price) {
                if (data[resource].buyMax.length >= 25) data[resource].buyMax.shift();
                data[resource].buyMax.push(_.max(sellData, '.price').price);
            }
            if (buyData.length) {
                let buyX = 0;
                buyData.forEach((o) => buyX = o.price + buyX);
                let avg = _.round(buyX / buyData.length, 2);
                if (data[resource].buyAvg25 && data[resource].buyAvg25.length >= 25) data[resource].buyAvg25.shift(); else if (!data[resource].buyAvg25) data[resource].buyAvg25 = [];
                if (data[resource].buyAvg100 && data[resource].buyAvg100.length >= 100) data[resource].buyAvg100.shift(); else if (!data[resource].buyAvg100) data[resource].buyAvg100 = [];
                data[resource].buyAvg25.push(avg);
                data[resource].buyAvg100.push(avg);
            }
        } else {
            return;
        }
    }
    data.time = Game.time;
    Memory._marketData = JSON.stringify(data);
}

function getPriceData(resource) {
    let data;
    if (Memory._marketData) data = JSON.parse(Memory._marketData); else data = {};
    if (!data[resource]) {
        if (_.includes(END_GAME_BOOSTS, resource)) return END_GAME_SALE_MAX;
        if (_.includes(TIER_2_BOOSTS, resource)) return TIER_2_SALE_MAX;
        if (_.includes(TIER_1_BOOSTS, resource)) return TIER_1_SALE_MAX;
        if (_.includes(BASE_COMPOUNDS, resource)) return BASE_COMPOUNDS_SALE_MAX;
        if (resource === RESOURCE_GHODIUM) return GHODIUM_SALE_MAX;
        return BASE_RESOURCES_SALE_MAX;
    } else {
        let data = JSON.parse(Memory._marketData);
        return data[resource];
    }
}