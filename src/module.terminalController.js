/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 6/21/2017.
 */

let tradeAmount = MINERAL_TRADE_AMOUNT;
let runOnce, globalOrders, lastPriceAdjust;

module.exports.terminalControl = function (room) {
    Memory.saleTerminal = Memory.saleTerminal || {};
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
        // Set saleTerminal
        if (!Memory.saleTerminal.room || Memory.saleTerminal.saleSet + 15000 < Game.time) {
            Memory.saleTerminal.room = _.sample(_.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && s.room.level === Memory.maxLevel && s.isActive() && _.sum(s.store) < s.store.getCapacity() * 0.9)).room.name;
            Memory.saleTerminal.saleSet = Game.time;
        }
        runOnce = Game.time;
    }
    if (room.terminal.store[RESOURCE_ENERGY] >= TERMINAL_ENERGY_BUFFER) {
        //Buy Power
        if (buyPower(room.terminal, globalOrders)) return;
        //Disperse Minerals and Boosts
        if (balanceResources(room.terminal)) return;
        //Buy Energy
        if (buyEnergy(room.terminal, globalOrders)) return;
        //Send energy to rooms under siege
        if (emergencyEnergy(room.terminal)) return;
    }
    //Buy minerals if needed
    if (baseMineralOnDemandBuys(room.terminal, globalOrders, myOrders)) return;
    //Dump Excess
    if (fillBuyOrders(room.terminal, globalOrders)) return;
    //Handle Sell Orders
    manageSellOrders(room.terminal, globalOrders, myOrders);
    placeSellOrders(room.terminal, globalOrders, myOrders);
};

function orderCleanup(myOrders) {
    let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    for (let key in myOrders) {
        let order = myOrders[key];
        if (!order.active) {
            if (Game.market.cancelOrder(order.id) === OK) {
                log.e("Order Cancelled: " + order.id + " no longer active.", 'MARKET: ');
                return true;
            }
        }
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
                if (_.filter(myRooms, (r) => r.terminal && r.energy >= ENERGY_AMOUNT * 2)[0]) {
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
            if (order.roomName !== Memory.saleTerminal.room) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " - Not the designated sale terminal.", 'MARKET: ');
                    return true;
                }
            } else if (order.resourceType !== RESOURCE_ENERGY) {
                if (order.amount < 10) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " - Not enough resources remaining in terminal.", 'MARKET: ');
                        return true;
                    }
                }
            } else if (Game.rooms[order.roomName].energy < ENERGY_AMOUNT) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " - Cancel sale of energy as we have a shortage in the room.", 'MARKET: ');
                    return true;
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
            let newPrice = currentPrice;
            let competitorOrder = _.min(globalOrders.filter(o => !_.includes(Memory.myRooms, o.roomName) && o.resourceType === order.resourceType && o.type === ORDER_SELL && o.remainingAmount >= MINERAL_TRADE_AMOUNT), 'price');
            if (competitorOrder) {
                newPrice = competitorOrder.price - 0.01;
            } else if (latestMarketHistory(order.resourceType)) {
                newPrice = latestMarketHistory(order.resourceType)['avgPrice'];
            }
            if (currentPrice !== newPrice) {
                if (Game.market.changeOrderPrice(order.id, newPrice) === OK) {
                    log.w("Sell order price decrease " + order.id + " new/old " + newPrice + "/" + order.price + " Resource - " + order.resourceType, "Market: ");
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
            if (terminal.store[order.resourceType] - order.remainingAmount > 1500) {
                if (Game.market.extendOrder(order.id, terminal.store[order.resourceType]) === OK) {
                    log.w("Extended sell order " + order.id + " an additional " + terminal.store[order.resourceType] + " " + order.resourceType + " in " + roomLink(terminal.room.name), "Market: ");
                    return true;
                }
            }
        }
    }
}

function placeSellOrders(terminal, globalOrders, myOrders) {
    if (terminal.room.name === Memory.saleTerminal.room) {
        for (let resourceType of Object.keys(terminal.store)) {
            // No energy
            if (resourceType === RESOURCE_ENERGY) continue;
            // No base minerals if we can produce commodities
            if (terminal.room.level >= 7 && _.includes(BASE_MINERALS, resourceType)) continue;
            // Avoid Duplicates
            if (_.filter(myOrders, (o) => o.roomName === terminal.pos.roomName && o.resourceType === resourceType && o.type === ORDER_SELL).length) continue;
            // Handle minerals
            if (_.includes(_.union(BASE_MINERALS, BASE_COMPOUNDS), resourceType) && terminal.room.store(resourceType) < MINERAL_TRADE_AMOUNT) continue;
            // Handle boosts
            if (_.includes(_.union(TIER_1_BOOSTS, TIER_2_BOOSTS, TIER_3_BOOSTS), resourceType) && terminal.room.store(resourceType) < BOOST_TRADE_AMOUNT) continue;
            // Sell
            let price = 5;
            let competitorOrder = _.min(globalOrders.filter(order => !_.includes(Memory.myRooms, order.roomName) && order.resourceType === resourceType && order.type === ORDER_SELL && order.remainingAmount >= MINERAL_TRADE_AMOUNT), 'price');
            if (competitorOrder) {
                price = competitorOrder.price - 0.01;
            } else if (latestMarketHistory(resourceType)) {
                price = latestMarketHistory(resourceType)['avgPrice'];
            }
            if (Game.market.createOrder(ORDER_SELL, resourceType, price, terminal.store[resourceType], terminal.pos.roomName) === OK) {
                log.w("New Sell Order: " + resourceType + " at/per " + price + ' in ' + roomLink(terminal.room.name), "Market: ");
                return true;
            }
        }
    }
}

function baseMineralOnDemandBuys(terminal, globalOrders) {
    if (!terminal.store[RESOURCE_ENERGY] || Game.market.credits < CREDIT_BUFFER) return;
    for (let mineral of shuffle(BASE_MINERALS)) {
        // Don't buy minerals you can mine
        if (_.includes(OWNED_MINERALS, mineral)) continue;
        let stored = terminal.room.store(mineral) || 0;
        if (stored < REACTION_AMOUNT * 0.8) {
            let buyAmount = REACTION_AMOUNT - stored;
            if (Game.market.credits < CREDIT_BUFFER) _.round(buyAmount *= (Game.market.credits / CREDIT_BUFFER));
            let sellOrder = _.min(globalOrders.filter(order => order.resourceType === mineral &&
                order.type === ORDER_SELL && order.remainingAmount >= buyAmount && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(buyAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
            if (sellOrder.price * buyAmount > Game.market.credits * 0.1) buyAmount = _.round(buyAmount * ((Game.market.credits * 0.1) / (sellOrder.price * buyAmount)));
            if (sellOrder.id && buyAmount >= 50) {
                if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
                    log.w("Bought " + buyAmount + " " + mineral + " for " + (sellOrder.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                    return true;
                }
            }
        }
    }
}

function buyPower(terminal, globalOrders) {
    if (Game.market.credits < CREDIT_BUFFER * 2 || terminal.room.controller.level < 8) return false;
    let stored = terminal.store[RESOURCE_POWER] + terminal.room.storage.store[RESOURCE_POWER] || 0;
    if (stored >= REACTION_AMOUNT) return;
    let buyAmount = REACTION_AMOUNT - stored;
    if (buyAmount >= 1000) {
        let sellOrder = _.min(globalOrders.filter(order => order.resourceType === RESOURCE_POWER &&
            order.type === ORDER_SELL && order.remainingAmount >= buyAmount && order.roomName !== terminal.pos.roomName &&
            Game.market.calcTransactionCost(buyAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
        if (sellOrder.id && sellOrder.price * buyAmount < (Game.market.credits * 0.1)) {
            if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
                log.w("Bought " + buyAmount + " POWER for " + (sellOrder.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                return true;
            }
        }
    }
}

function buyEnergy(terminal, globalOrders) {
    if (!BUY_ENERGY || terminal.room.energy >= ENERGY_AMOUNT) return false;
    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY &&
        order.type === ORDER_SELL && order.price <= ENERGY_MARKET_BASELINE && !_.includes(Memory.myRooms, order.roomName)), 'price');
    if (sellOrder.price) {
        let buyAmount = sellOrder.amount;
        if (sellOrder.price * buyAmount > Game.market.credits * 0.1) buyAmount = _.round(buyAmount * ((Game.market.credits * 0.1) / (sellOrder.price * buyAmount)));
        if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
            log.w("Bought " + buyAmount + " ENERGY for " + (sellOrder.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
            return true;
        }
    } else {
        let buyOrder = globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY && order.type === ORDER_BUY && _.includes(Memory.myRooms, order.roomName));
        if (!buyOrder.length && Game.market.createOrder(ORDER_BUY, RESOURCE_ENERGY, ENERGY_MARKET_BASELINE * 0.5, ENERGY_AMOUNT, terminal.pos.roomName) === OK) {
            log.w("New Buy Order: " + RESOURCE_ENERGY + " at/per " + ENERGY_MARKET_BASELINE * 0.5 + ' in ' + roomLink(terminal.room.name), "Market: ");
            return true;
        }
    }
}

function fillBuyOrders(terminal, globalOrders) {
    if (!terminal.store[RESOURCE_ENERGY]) return;
    for (let resourceType of Object.keys(terminal.store)) {
        if (resourceType === RESOURCE_ENERGY) continue;
        // Only fill buy orders if we need credits or have too much
        if (terminal.store[resourceType] > DUMP_AMOUNT || (terminal.store[resourceType] > REACTION_AMOUNT && Game.market.credits < CREDIT_BUFFER)) {
            let sellAmount = terminal.store[resourceType] - REACTION_AMOUNT;
            let buyer = _.max(globalOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_BUY && order.remainingAmount >= sellAmount && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(sellAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
            if (!buyer && sellAmount >= 1000) {
                buyer = _.max(globalOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(1000, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
                sellAmount = 1000;
            }
            if (buyer && sellAmount >= 250) {
                switch (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName)) {
                    case OK:
                        log.w(terminal.pos.roomName + " Sell Off Completed - " + resourceType + " for " + (buyer.price * sellAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                        return true;
                }
            } // Offload if we're overflowing
            else if (_.sum(terminal.store) >= terminal.store.getCapacity() * 0.95 && terminal.store[resourceType] >= DUMP_AMOUNT) {
                let alliedRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(FRIENDLIES, r.user) && r.level >= 6));
                let randomRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && r.level >= 6)) || _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && r.level >= 6));
                if (alliedRoom && (_.includes(TIER_3_BOOSTS, resourceType) || _.includes(TIER_2_BOOSTS, resourceType))) {
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

function balanceResources(terminal) {
    // Loop resources
    for (let resource of Object.keys(terminal.store)) {
        let keepAmount = REACTION_AMOUNT;
        let stockpile;
        if (_.includes(ALL_COMMODITIES, resource)) {
            keepAmount = 0;
            stockpile = true;
        }
        if (resource === RESOURCE_ENERGY) continue;
        if (_.includes(LAB_PRIORITY, resource) && terminal.room.store(resource) < BOOST_TRADE_AMOUNT) {
            continue;
        } else if (_.includes(LAB_PRIORITY, resource)) {
            keepAmount = BOOST_TRADE_AMOUNT;
        } else if (terminal.room.store(resource) < REACTION_AMOUNT) {
            continue;
        }
        let sendAmount = keepAmount - terminal.room.store(resource);
        if (sendAmount > terminal.store[resource]) sendAmount = terminal.store[resource];
        let needyTerminal = _.sortBy(_.filter(Game.structures, (r) => r.structureType === STRUCTURE_TERMINAL && r.room.name !== terminal.room.name && !r.cooldown && r.room.store(resource) < keepAmount), function (s) {
            s.room.store(resource);
        })[0];
        if (sendAmount > 0) {
            if (needyTerminal && !stockpile) {
                switch (terminal.send(resource, sendAmount, needyTerminal.room.name)) {
                    case OK:
                        log.a('Balancing ' + sendAmount + ' ' + resource + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name), "Market: ");
                        return true;
                }
            } else if (terminal.room.name !== Memory.saleTerminal.room) {
                switch (terminal.send(resource, sendAmount, Memory.saleTerminal.room)) {
                    case OK:
                        log.a('Sent ' + sendAmount + ' ' + resource + ' To ' + roomLink(Memory.saleTerminal.room) + ' From ' + roomLink(terminal.room.name) + ' to sell on the market.', "Market: ");
                        return true;
                }
            }
        }
    }
    if (Memory.roomCache[terminal.room.name].requestingSupport) return false;
    // Find needy terminals
    let needyRoom = _.sortBy(_.filter(Game.structures, (r) => r.structureType === STRUCTURE_TERMINAL && r.room.name !== terminal.room.name && !r.cooldown && r.room.energy < terminal.room.energy * 0.85), '.room.energy')[0];
    if (needyRoom) {
        // Determine how much you can move
        let availableAmount = terminal.store[RESOURCE_ENERGY] - (TERMINAL_ENERGY_BUFFER * 1.01);
        let requestedAmount = (terminal.room.energy - needyRoom.room.energy) * 0.5;
        if (requestedAmount > availableAmount) requestedAmount = availableAmount;
        if (requestedAmount > 1000) {
            switch (terminal.send(RESOURCE_ENERGY, requestedAmount, needyRoom.room.name)) {
                case OK:
                    log.a('Balancing ' + requestedAmount + ' ' + RESOURCE_ENERGY + ' To ' + roomLink(needyRoom.room.name) + ' From ' + roomLink(terminal.room.name), "Market: ");
                    return true;
            }
        }
    }
}

function emergencyEnergy(terminal) {
    // Balance energy
    if (terminal.store[RESOURCE_ENERGY] && !Memory.roomCache[terminal.room.name].requestingSupport) {
        // Find needy terminals
        let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
        let responseNeeded = _.min(_.filter(myRooms, (r) => r.name !== terminal.room.name && ((Memory.roomCache[r.name] && Memory.roomCache[r.name].threatLevel >= 4) || (r.memory.nuke > 1500)) && r.terminal && r.energy < ENERGY_AMOUNT * 2), '.energy');
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

function latestMarketHistory(resource) {
    let history = Game.market.getHistory(resource);
    if (_.size(history)) {
        return history[_.size(history) - 1]
    } else {
        return false;
    }
}

function sellResource(terminal, resource, globalOrders, myOrders) {

}