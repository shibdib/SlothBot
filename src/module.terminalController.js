/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 6/21/2017.
 */

let tradeAmount = TRADE_AMOUNT;
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
    if (room.terminal.store[RESOURCE_ENERGY] >= TERMINAL_ENERGY_BUFFER) {
        //Buy minerals if needed
        if (baseMineralOnDemandBuys(room.terminal, globalOrders, myOrders)) return;
        //Buy Power
        if (buyPower(room.terminal, globalOrders)) return;
        //Disperse Minerals and Boosts
        if (balanceBoosts(room.terminal)) return;
        //Send energy to rooms under siege
        if (emergencyEnergy(room.terminal)) return;
        //Dump Excess
        if (fillBuyOrders(room.terminal, globalOrders)) return;
    }
    //Handle Sell Orders
    manageSellOrders(room.terminal, globalOrders, myOrders);
    placeSellOrders(room.terminal, globalOrders, myOrders);
};

function orderCleanup(myOrders) {
    let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    for (let key in myOrders) {
        let order = myOrders[key];
        if (order.type === ORDER_BUY) {
            if (Game.market.credits < 50) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " due to low credits", 'MARKET: ');
                    return true;
                }
            }
            // Remove duplicates for same resource
            let duplicate = _.filter(myOrders, (o) => o.roomName === order.roomName &&
                o.resourceType === order.resourceType && o.type === ORDER_BUY && o.id !== order.id);
            if (duplicate.length) {
                duplicate.forEach((duplicateOrder) => Game.market.cancelOrder(duplicateOrder.id))
            }
            if (order.resourceType !== RESOURCE_ENERGY) {
                if (order.remainingAmount > tradeAmount) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " for exceeding the set trade amount (order amount/set limit) " + order.remainingAmount + "/" + tradeAmount, 'MARKET: ');
                        return true;
                    }
                }
            } else if (order.resourceType === RESOURCE_ENERGY) {
                if (_.filter(myRooms, (r) => r.energy >= ENERGY_AMOUNT * 2)[0]) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " we have a room with an energy surplus and do not need to purchase energy", 'MARKET: ');
                        return true;
                    }
                }
            }
            if (order.amount === 0) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " - Order Fulfilled.", 'MARKET: ');
                    return true;
                }
            }
        } else {
            if (order.resourceType !== RESOURCE_ENERGY) {
                if (order.amount < 500) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " - Not enough resources remaining in terminal.", 'MARKET: ');
                        return true;
                    }
                }
            }
        }
        if (!Game.rooms[order.roomName]) {
            if (Game.market.cancelOrder(order.id) === OK) {
                log.e("Order Cancelled: " + order.id + " we no longer own this room", 'MARKET: ');
                return true;
            }
        }
    }
}

function pricingUpdateSell(globalOrders, myOrders) {
    for (let key in myOrders) {
        let order = myOrders[key];
        if (order.type === ORDER_SELL) {
            let currentPrice = order.price;
            let mineral = order.resourceType;
            let competitorOrder = _.min(globalOrders.filter(order => !_.includes(Memory.myRooms, order.roomName) && order.resourceType === mineral && order.type === ORDER_SELL && order.remainingAmount >= 1500), 'price');
            let competitorPrice = competitorOrder.price || resourceWorth(mineral);
            if (currentPrice > competitorPrice) {
                if (Game.market.changeOrderPrice(order.id, competitorPrice - 0.01) === OK) {
                    log.w("Sell order price decrease " + order.id + " new/old " + (competitorPrice - 0.01) + "/" + order.price + " Resource - " + order.resourceType, "Market: ");
                }
            } else if (currentPrice + 0.01 < competitorPrice) {
                if (Game.market.changeOrderPrice(order.id, competitorPrice - 0.01) === OK) {
                    log.w("Sell order price increase " + order.id + " new/old " + (competitorPrice - 0.01) + "/" + order.price + " Resource - " + order.resourceType, "Market: ");
                }
            }
        }
    }
}

function manageSellOrders(terminal, myOrders) {
    for (let key in myOrders) {
        let order = myOrders[key];
        if (order.type !== ORDER_SELL) continue;
        if (order.resourceType !== RESOURCE_ENERGY) {
            if (terminal.store[order.resourceType] > order.remainingAmount) {
                if (Game.market.extendOrder(order.id, terminal.store[order.resourceType]) === OK) {
                    log.w("Extended sell order " + order.id + " an additional " + terminal.store[order.resourceType] + " " + order.resourceType, "Market: ");
                    return true;
                }
            }
        }
    }
}

function placeSellOrders(terminal, globalOrders, myOrders) {
    for (let resourceType in terminal.store) {
        // Avoid Duplicates
        if (_.filter(myOrders, (o) => o.roomName === terminal.pos.roomName && o.resourceType === resourceType && o.type === ORDER_SELL).length) continue;
        // Don't sell if we don't have enough, don't do sell orders if we're bursting at the seams
        if (terminal.store[resourceType] < TRADE_AMOUNT || terminal.store[resourceType] > SELL_OFF_AMOUNT) continue;
        // Sell
        let competitorOrder = _.min(globalOrders.filter(order => !_.includes(Memory.myRooms, order.roomName) && order.resourceType === resourceType && order.type === ORDER_SELL && order.remainingAmount >= 1500), 'price');
        let competitorPrice = competitorOrder.price || resourceWorth(resourceType);
        if (Game.market.createOrder(ORDER_SELL, resourceType, competitorPrice - 0.01, terminal.store[resourceType], terminal.pos.roomName) === OK) {
            log.w("New Sell Order: " + resourceType + " at/per " + (competitorPrice - 0.01), "Market: ");
            return true;
        }
    }
}

function baseMineralOnDemandBuys(terminal, globalOrders) {
    if (Game.market.credits < CREDIT_BUFFER) return false;
    for (let mineral of BASE_MINERALS) {
        // Don't buy minerals you can mine
        if (_.includes(Memory.ownedMinerals, mineral)) continue;
        let stored = terminal.store[mineral] + terminal.room.storage.store[mineral] || 0;
        if (stored < REACTION_AMOUNT) {
            let buyAmount = stored - (REACTION_AMOUNT * 1.2);
            let sellOrder = _.min(globalOrders.filter(order => order.resourceType === mineral &&
                order.type === ORDER_SELL && order.remainingAmount >= buyAmount && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(buyAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
            if (sellOrder.id && sellOrder.price * buyAmount < (Game.market.credits * 0.1)) {
                if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
                    log.w("Bought " + buyAmount + " " + mineral + " for " + (sellOrder.price * buyAmount) + " credits", "Market: ");
                    return true;
                }
            }
        }
    }
}

function buyPower(terminal, globalOrders) {
    if (Game.market.credits < CREDIT_BUFFER || terminal.room.controller.level < 8) return false;
    let stored = terminal.store[RESOURCE_POWER] + terminal.room.storage.store[RESOURCE_POWER] || 0;
    if (stored >= REACTION_AMOUNT) return;
    let buyAmount = REACTION_AMOUNT - stored;
    if (buyAmount >= 1000) {
        let sellOrder = _.min(globalOrders.filter(order => order.resourceType === RESOURCE_POWER &&
            order.type === ORDER_SELL && order.remainingAmount >= buyAmount && order.roomName !== terminal.pos.roomName &&
            Game.market.calcTransactionCost(buyAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
        if (sellOrder.id && sellOrder.price * buyAmount < (Game.market.credits * 0.1)) {
            if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
                log.w("Bought " + buyAmount + " POWER for " + sellOrder.price * buyAmount + " credits", "Market: ");
                return true;
            }
        }
    }
}

function fillBuyOrders(terminal, globalOrders) {
    for (let resourceType in terminal.store) {
        // Don't sell energy
        if (resourceType === RESOURCE_ENERGY) continue;
        // Only fill buy orders if we need credits or have too much
        if ((Game.market.credits < CREDIT_BUFFER && terminal.store[resourceType] > 1000 && !_.includes(MAKE_THESE_BOOSTS, resourceType)) || terminal.store[resourceType] >= DUMP_AMOUNT) {
            let sellAmount = terminal.store[resourceType] - TRADE_AMOUNT;
            if (Game.market.credits < CREDIT_BUFFER && !_.includes(MAKE_THESE_BOOSTS, resourceType)) sellAmount = terminal.store[resourceType] - 1000;
            let buyer = _.max(globalOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_BUY && order.remainingAmount >= sellAmount && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(sellAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
            if (!buyer && sellAmount >= 1000) {
                buyer = _.max(globalOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(1000, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
                sellAmount = 1000;
            }
            if (buyer) {
                switch (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName)) {
                    case OK:
                        log.w(terminal.pos.roomName + " Sell Off Completed - " + resourceType + " for " + (buyer.price * sellAmount) + " credits", "Market: ");
                        return true;
                }
            } else if (terminal.store[resourceType] >= DUMP_AMOUNT) {
                let alliedRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(FRIENDLIES, r.user) && r.level >= 6));
                let randomRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && r.level >= 6)) || _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && r.level >= 6));
                if (alliedRoom && (_.includes(END_GAME_BOOSTS, resourceType) || _.includes(TIER_2_BOOSTS, resourceType))) {
                    alliedRoom = alliedRoom.name;
                    switch (terminal.send(resourceType, 1000, alliedRoom)) {
                        case OK:
                            return true;
                    }
                } else if (randomRoom) {
                    randomRoom = randomRoom.name;
                    switch (terminal.send(resourceType, 1000, randomRoom)) {
                        case OK:
                            return true;
                    }
                }
            }
        }
    }
}

function balanceBoosts(terminal) {
    // Dont balance if being sieged or broke
    if (Memory.roomCache[terminal.room.name].requestingSupport) return false;
    // Loop thru boosts
    let storedResources = Object.keys(terminal.store);
    for (let boost of _.shuffle(_.filter(storedResources, (r) => r !== RESOURCE_ENERGY))) {
        // Ideal amount
        let targetAmount = BOOST_AMOUNT;
        if (_.includes(MAKE_THESE_BOOSTS, boost)) targetAmount = BOOST_AMOUNT * 2;
        // Don't move boosts if below ideal amount in the room
        let total = terminal.store[boost] + terminal.room.storage.store[boost];
        if (total < targetAmount * 1.2) continue;
        let needyTerminal = _.sample(_.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && s.room.name !== terminal.room.name && (s.store[boost] + s.room.storage.store[boost] < targetAmount)));
        if (needyTerminal) {
            let sendAmount = total - targetAmount;
            if ((sendAmount + (needyTerminal.store[boost] + needyTerminal.room.storage.store[boost])) > targetAmount) sendAmount = targetAmount - (needyTerminal.store[boost] + needyTerminal.room.storage.store[boost]);
            switch (terminal.send(boost, sendAmount, needyTerminal.room.name)) {
                case OK:
                    log.a('Balancing ' + sendAmount + ' ' + boost + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name), "Market: ");
                    return true;
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
                log.a('Balancing ' + availableAmount + ' ' + RESOURCE_ENERGY + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name), "Market: ");
                return true;
        }
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
                    log.a('Siege Supplies ' + availableAmount + ' ' + RESOURCE_ENERGY + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name), "Market: ");
                    return true;
            }
        }
    } else if (Memory.roomCache[terminal.room.name].requestingSupport && terminal.room.energy < ENERGY_AMOUNT * 2 && Game.market.credits >= CREDIT_BUFFER * 0.25) {
        let sellOrder = _.min(globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY && order.type === ORDER_SELL && order.remainingAmount >= 10000), 'price');
        if (sellOrder.id && sellOrder.price * 10000 < Game.market.credits * 0.1) {
            if (Game.market.deal(sellOrder.id, 10000, terminal.pos.roomName) === OK) {
                log.w("Bought " + 10000 + " " + RESOURCE_ENERGY + " for " + (sellOrder.price * 10000) + " credits", "Market: ");
                return true;
            }
        }
    }
}