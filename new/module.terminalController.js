/**
 * Created by rober on 6/21/2017.
 */
let _ = require('lodash');
let profiler = require('screeps-profiler');

let reactionNeeds = REACTION_NEEDS;
let boostNeeds = BOOST_NEEDS;
let tradeTargets = TRADE_TARGETS;
let doNotSell = DO_NOT_SELL_LIST;
let tradeAmount = TRADE_AMOUNT;
let energyAmount = ENERGY_AMOUNT;
let reactionAmount = REACTION_AMOUNT;
let boostAmount = BOOST_AMOUNT;


function terminalControl(room) {
    if (room.level < 6) return;
    let globalOrders = Game.market.getAllOrders();
    let myOrders = Game.market.orders;
    let terminal = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    if (terminal) {
        let energyInRoom = _.sum(room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
            if (s['structure'] && s['structure'].store) {
                return s['structure'].store[RESOURCE_ENERGY] || 0;
            } else {
                return 0;
            }
        });
        let storage = _.filter(room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];

        //Cleanup broken or old order
        orderCleanup(myOrders);

        //update prices every 30 ticks
        if (Game.time % 30 === 0) {
            pricingUpdateSell(terminal, globalOrders, myOrders);
            pricingUpdateBuy(terminal, globalOrders, myOrders);
        }

        //extend old orders first
        //extendSellOrders(terminal, myOrders);

        //Try to put up a sell, otherwise fill buy
        //placeSellOrders(terminal, globalOrders, myOrders);
        //fillBuyOrders(terminal, globalOrders);

        //Extend/Place buy orders if we have enough buffer cash
        extendBuyOrders(terminal, globalOrders, myOrders);
        if (!terminal.cooldown) placeBuyOrders(terminal, globalOrders, myOrders, energyInRoom);
        if (!terminal.cooldown && room.memory.reactionRoom) placeReactionOrders(terminal, globalOrders, myOrders);
        if (!terminal.cooldown) placeBoostOrders(terminal, storage, globalOrders, myOrders);

        //Energy balancer
        if (!terminal.cooldown) balanceEnergy(terminal, energyInRoom);

        //Send minerals to reaction room
        if (!terminal.cooldown && !terminal.room.memory.reactionRoom) supplyReactionRoom(terminal);

        //Send boosts from reaction room
        if (!terminal.cooldown && terminal.room.memory.reactionRoom) balanceBoosts(terminal);

        //Sell off excess
        if (!terminal.cooldown && terminal.room.memory.reactionRoom) fillBuyOrders(terminal, globalOrders);
    }
}

module.exports.terminalControl = profiler.registerFN(terminalControl, 'terminalControl');

function fillBuyOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY]) {
        for (const resourceType in terminal.store) {
            if (!_.includes(END_GAME_BOOSTS, resourceType) && terminal.store[resourceType] > SELL_OFF_AMOUNT && resourceType !== RESOURCE_ENERGY) {
                let sellableAmount = terminal.store[resourceType] - SELL_OFF_AMOUNT;
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && buyOrder.remainingAmount >= sellableAmount) {
                    if (Game.market.deal(buyOrder.id, sellableAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Sell Off Completed - " + resourceType + " for " + buyOrder.price * sellableAmount + " credits");
                    }
                } else if (buyOrder.id && buyOrder.remainingAmount < sellableAmount) {
                    if (Game.market.deal(buyOrder.id, buyOrder.remainingAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Sell Off Completed - " + resourceType + " for " + buyOrder.price * buyOrder.remainingAmount + " credits");
                    }
                }
            }
        }
    }
}

fillBuyOrders = profiler.registerFN(fillBuyOrders, 'fillBuyOrdersTerminal');

function extendSellOrders(terminal, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in myOrders) {
                if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL) {
                    if (terminal.store[resourceType] > myOrders[key].remainingAmount && _.includes(reactionNeeds, resourceType) === false && resourceType !== RESOURCE_ENERGY) {
                        if (Game.market.extendOrder(myOrders[key].id, terminal.store[resourceType]) === OK) {
                            log.w(" MARKET: Extended sell order " + myOrders[key].id + " an additional " + terminal.store[resourceType] + " " + resourceType);
                        }
                        continue resource;
                    }
                    if ((terminal.store[resourceType] - reactionAmount) > myOrders[key].remainingAmount && _.includes(reactionNeeds, resourceType) === true && resourceType !== RESOURCE_ENERGY) {
                        if (Game.market.extendOrder(myOrders[key].id, (terminal.store[resourceType] - reactionAmount)) === OK) {
                            log.w(" MARKET: Extended sell order " + myOrders[key].id + " an additional " + terminal.store[resourceType] - reactionAmount + " " + resourceType);
                        }
                        continue resource;
                    }
                }
            }
        }
}

extendSellOrders = profiler.registerFN(extendSellOrders, 'extendSellOrdersTerminal');

function placeSellOrders(terminal, globalOrders, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            if (resourceType !== RESOURCE_ENERGY && _.includes(doNotSell, resourceType) === false && terminal.store[resourceType] >= 1500) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && myOrders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 7500 && order.roomName !== terminal.pos.roomName), 'price');
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === false) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round((sellOrder.price - 0.001), 3), terminal.store[resourceType], terminal.pos.roomName) === OK) {
                        log.w(" MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.001));
                    }
                    continue;
                }
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === true && terminal.store[resourceType] - reactionAmount > 0) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round((sellOrder.price - 0.001), 3), terminal.store[resourceType] - reactionAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.001));
                    }
                }
            }
        }
}

placeSellOrders = profiler.registerFN(placeSellOrders, 'placeSellOrdersTerminal');

function extendBuyOrders(terminal, globalOrders, myOrders) {
    for (let i = 0; i < tradeTargets.length; i++) {
        for (let key in myOrders) {
            if (tradeTargets[i] !== RESOURCE_ENERGY && myOrders[key].resourceType === tradeTargets[i] && myOrders[key].type === ORDER_BUY && myOrders[key].roomName === terminal.pos.roomName && Game.market.credits > 200) {
                let currentSupply;
                let currentOrder;
                if (isNaN(myOrders[key].remainingAmount) === true) {
                    currentOrder = 0;
                } else {
                    currentOrder = myOrders[key].remainingAmount;
                }
                if (isNaN(terminal.store[tradeTargets[i]]) === true) {
                    currentSupply = 0;
                } else {
                    currentSupply = terminal.store[tradeTargets[i]];
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (currentSupply + myOrders[key].remainingAmount < tradeAmount && _.round(((sellOrder.price - 0.001) - buyOrder.price), 3) > 0.04 && Game.market.credits - (_.round(((sellOrder.price - 0.001) - buyOrder.price), 3) * 0.05) > 200) {
                    if (Game.market.credits > (tradeAmount - (currentSupply + myOrders[key].remainingAmount)) * buyOrder.price) {
                        if (Game.market.extendOrder(myOrders[key].id, tradeAmount - (currentSupply + currentOrder)) === OK) {
                            log.w(" MARKET: Extended Buy order " + myOrders[key].id + " an additional " + tradeAmount - (currentSupply + currentOrder) + " " + tradeTargets[i]);
                        }
                    }
                }
            }
        }
    }
}

extendBuyOrders = profiler.registerFN(extendBuyOrders, 'extendBuyOrdersTerminal');

function placeBuyOrders(terminal, globalOrders, myOrders, energyInRoom) {
    resource:
        for (let i = 0; i < tradeTargets.length; i++) {
            if (terminal.store[tradeTargets[i]] < tradeAmount || !terminal.store[tradeTargets[i]] && Game.market.credits > 100) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === tradeTargets[i] && myOrders[key].type === ORDER_BUY) {
                        continue resource;
                    }
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && _.round(((sellOrder.price - 0.001) - buyOrder.price), 2) > 0.04 && Game.market.credits - (_.round(((sellOrder.price - 0.001) - buyOrder.price), 3) * 0.05) > 100) {
                    if (Game.market.credits > tradeAmount * buyOrder.price) {
                        if (Game.market.createOrder(ORDER_BUY, tradeTargets[i], buyOrder.price + 0.001, tradeAmount, terminal.pos.roomName) === OK) {
                            log.w(" MARKET: New Buy Order: " + tradeTargets[i] + " at/per " + (buyOrder.price + 0.001) + " credits");
                            break;
                        }
                    }
                }
            }
        }
    if (energyInRoom < energyAmount / 2 || !terminal.store[RESOURCE_ENERGY]) {
        for (let key in myOrders) {
            if (myOrders[key].resourceType === RESOURCE_ENERGY && myOrders[key].type === ORDER_BUY) {
                let currentSupply;
                if (isNaN(terminal.store[RESOURCE_ENERGY]) === true) {
                    currentSupply = myOrders[key].remainingAmount;
                } else {
                    currentSupply = terminal.store[RESOURCE_ENERGY] + myOrders[key].remainingAmount;
                }
                if (myOrders[key].remainingAmount < (energyAmount - currentSupply)) {
                    if (Game.market.credits * 0.1 > (energyAmount - (currentSupply + myOrders[key].remainingAmount)) * myOrders[key].price) {
                        if (Game.market.extendOrder(myOrders[key].id, energyAmount - currentSupply) === OK) {
                            log.w(" MARKET: Extended energy buy order " + myOrders[key].id + " an additional " + myOrders[key].remainingAmount - currentSupply);
                        }
                    }
                }
                return;
            }
        }
        let buyOrder = _.max(globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY &&
            order.type === ORDER_BUY && order.remainingAmount >= energyAmount / 2 && order.roomName !== terminal.pos.roomName), "price");
        if (buyOrder.id) {
            if (Game.market.credits * 0.1 > energyAmount * buyOrder.price) {
                if (Game.market.createOrder(ORDER_BUY, RESOURCE_ENERGY, buyOrder.price + 0.001, energyAmount, terminal.pos.roomName) === OK) {
                    log.w(" MARKET: New Buy Order: " + RESOURCE_ENERGY + " at/per " + (buyOrder.price + 0.001));
                }
            }
        }
    }
}

placeBuyOrders = profiler.registerFN(placeBuyOrders, 'placeBuyOrdersTerminal');

function placeReactionOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < reactionNeeds.length; i++) {
            let storage = _.filter(terminal.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
            let stored = terminal.store[reactionNeeds[i]] + storage.store[reactionNeeds[i]] || 0;
            let minerals = terminal.room.mineral[0];
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
                            }
                        }
                        continue resource;
                    }
                }
                if (Game.market.credits * 0.1 > reactionAmount * buyOrder.price) {
                    if (Game.market.createOrder(ORDER_BUY, reactionNeeds[i], buyOrder.price + 0.001, reactionAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Reaction Needs Buy Order: " + reactionNeeds[i] + " at/per " + (buyOrder.price) + " credits");
                    }
                }
            }
        }
}

placeReactionOrders = profiler.registerFN(placeReactionOrders, 'placeReactionOrdersTerminal');

function placeBoostOrders(terminal, storage, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < boostNeeds.length; i++) {
            let storedBoost = storage.store[boostNeeds[i]] + terminal.store[boostNeeds[i]] || 0;
            let activeOrder = _.filter(myOrders, (o) => o.roomName === terminal.pos.roomName && o.resourceType === boostNeeds[i] && o.type === ORDER_BUY)[0];
            if (storedBoost < boostAmount && Game.market.credits > 500 && !activeOrder) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === boostNeeds[i] &&
                    order.type === ORDER_BUY && order.remainingAmount >= 2000 && order.roomName !== terminal.pos.roomName), 'price');
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === boostNeeds[i] && myOrders[key].type === ORDER_BUY) {
                        let currentSupply = storedBoost + myOrders[key].remainingAmount;
                        if (Game.market.credits * 0.1 > (boostAmount - currentSupply) * buyOrder.price) {
                            if (Game.market.extendOrder(myOrders[key].id, boostAmount - currentSupply) === OK) {
                                log.w("MARKET: Extended Reaction buy order " + myOrders[key].id + " an additional " + boostAmount - currentSupply);
                            }
                        }
                        continue resource;
                    }
                }
                if (Game.market.credits * 0.1 > boostAmount * buyOrder.price) {
                    if (Game.market.createOrder(ORDER_BUY, boostNeeds[i], buyOrder.price + 0.001, boostAmount, terminal.pos.roomName) === OK) {
                        log.w("MARKET: Reaction Needs Buy Order: " + boostNeeds[i] + " at/per " + (buyOrder.price) + " credits");
                    }
                }
            }
        }
}

placeBoostOrders = profiler.registerFN(placeBoostOrders, 'placeReactionOrdersTerminal');

function pricingUpdateSell(terminal, globalOrders, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in myOrders) {
                if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL) {
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                        order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), "price");
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                        order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (resourceType === RESOURCE_ENERGY) {
                        if (sellOrder.id && _.round(sellOrder.price, 3) !== _.round(myOrders[key].price, 3)) {
                            if (Game.market.changeOrderPrice(myOrders[key].id, _.round(sellOrder.price, 3)) === OK) {
                                //log.w(" MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price), 3) + "/" + myOrders[key].price + " Resource - " + resourceType);
                            }
                            continue resource;
                        }
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.001, 3) !== _.round(myOrders[key].price, 3) && _.round(sellOrder.price - 0.001, 3) > _.round(buyOrder.price, 3) && sellOrder.price - 0.001 !== 0) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, _.round((sellOrder.price - 0.001), 3)) === OK) {
                            //log.w(" MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price - 0.001), 3) + "/" + myOrders[key].price + " Resource - " + resourceType);
                        }
                        continue resource;
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(myOrders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) < _.round(buyOrder.price, 2) && sellOrder.price - 0.01 !== 0) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, _.round((buyOrder.price), 3)) === OK) {
                            //log.w(" MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price - 0.001), 3) + "/" + myOrders[key].price + " Resource - " + resourceType);
                        }
                        continue resource;
                    }
                }
            }
        }
}

pricingUpdateSell = profiler.registerFN(pricingUpdateSell, 'pricingUpdateSellTerminal');

function pricingUpdateBuy(terminal, globalOrders, myOrders) {
    for (let key in myOrders) {
        if (myOrders[key].type === ORDER_BUY && myOrders[key].roomName === terminal.pos.roomName && Game.market.credits > 500) {
            if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === myOrders[key].resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 2500 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === myOrders[key].resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 2500 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && (_.round(buyOrder.price + 0.001, 2)) !== _.round(myOrders[key].price, 2) && ((sellOrder.price - 0.001) - buyOrder.price) > 0.02) {
                    if (Game.market.changeOrderPrice(myOrders[key].id, (buyOrder.price + 0.001)) === OK) {
                        //log.w(" MARKET: Buy order price change " + myOrders[key].id + " new/old " + (buyOrder.price + 0.001) + "/" + myOrders[key].price + " Resource - " + myOrders[key].resourceType);
                    }
                }
            } else {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === myOrders[key].resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 20000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id) {
                    if (Game.market.changeOrderPrice(myOrders[key].id, (buyOrder.price + 0.001)) === OK) {
                        //log.w(" MARKET: Buy order price change " + myOrders[key].id + " new/old " + (buyOrder.price + 0.001) + "/" + myOrders[key].price + " Resource - " + myOrders[key].resourceType);
                    }
                }
            }
        }
    }
}

pricingUpdateBuy = profiler.registerFN(pricingUpdateBuy, 'pricingUpdateBuyTerminal');

function orderCleanup(myOrders) {
    for (let key in myOrders) {
        if (myOrders[key].type === ORDER_BUY) {
            if (Game.market.credits < 50) {
                if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                    log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " due to low credits");
                }
            }
            if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                if (myOrders[key].remainingAmount > tradeAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + tradeAmount);
                    }
                }
            } else {
                if (myOrders[key].remainingAmount > energyAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + energyAmount);
                    }
                }
            }
        }
        if (!Game.rooms[myOrders[key].roomName]) {
            if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " we no longer own this room");
            }
        }
    }
}

function balanceEnergy(terminal, energyInRoom) {
    terminal.room.memory.energySurplus = energyInRoom >= energyAmount + (energyAmount * 0.19);
    terminal.room.memory.energyNeeded = energyInRoom < energyAmount;
    let needingRooms = _.filter(Game.rooms, (r) => r.memory && r.memory.energyNeeded);
    let cost;
    if (needingRooms[0]) cost = Game.market.calcTransactionCost(terminal.store[RESOURCE_ENERGY] * 0.10, needingRooms[0].name, terminal.room.name);
    if (needingRooms[0] && terminal.room.memory.energySurplus && cost < terminal.store[RESOURCE_ENERGY] * 0.25 && !terminal.cooldown) {
        if (terminal.send(RESOURCE_ENERGY, terminal.store[RESOURCE_ENERGY] * 0.10, needingRooms[0].name) === OK) {
            return log.a(' MARKET: Distributing ' + terminal.store[RESOURCE_ENERGY] * 0.10 + ' ' + RESOURCE_ENERGY + ' To ' + needingRooms[0].name + ' From ' + terminal.room.name);
        }
    }
}

function balanceBoosts(terminal) {
    let otherTerminals = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && !s.room.memory.reactionRoom);
    for (let key in END_GAME_BOOSTS) {
        if (terminal.store[END_GAME_BOOSTS[key]] >= 250 * otherTerminals.length) {
            for (let id in otherTerminals) {
                let stored = otherTerminals[id].store[END_GAME_BOOSTS[key]] || 0;
                if (stored < terminal.store[END_GAME_BOOSTS[key]] && _.sum(otherTerminals[id].store) <= otherTerminals[id].storeCapacity * 0.9) {
                    if (terminal.send(END_GAME_BOOSTS[key], terminal.store[END_GAME_BOOSTS[key]] * 0.5, otherTerminals[id].room.name) === OK) {
                        return log.a(' MARKET: Distributing ' + terminal.store[END_GAME_BOOSTS[key]] * 0.5 + ' ' + END_GAME_BOOSTS[key] + ' To ' + otherTerminals[id].room.name + ' From ' + terminal.room.name);
                    }
                }
            }
        }
    }
    for (let key in TIER_2_BOOSTS) {
        if (terminal.store[TIER_2_BOOSTS[key]] >= 250 * otherTerminals.length) {
            for (let id in otherTerminals) {
                let stored = otherTerminals[id].store[TIER_2_BOOSTS[key]] || 0;
                if (stored < terminal.store[TIER_2_BOOSTS[key]] && _.sum(otherTerminals[id].store) <= otherTerminals[id].storeCapacity * 0.9) {
                    if (terminal.send(TIER_2_BOOSTS[key], terminal.store[TIER_2_BOOSTS[key]] * 0.5, otherTerminals[id].room.name) === OK) {
                        return log.a(' MARKET: Distributing ' + terminal.store[TIER_2_BOOSTS[key]] * 0.5 + ' ' + TIER_2_BOOSTS[key] + ' To ' + otherTerminals[id].room.name + ' From ' + terminal.room.name);
                    }
                }
            }
        }
    }
    if (terminal.store[RESOURCE_GHODIUM] >= 1000) {
        for (let id in otherTerminals) {
            let stored = otherTerminals[id].store[RESOURCE_GHODIUM] || 0;
            if (stored < terminal.store[RESOURCE_GHODIUM] && _.sum(otherTerminals[id].store) <= otherTerminals[id].storeCapacity * 0.9) {
                if (terminal.send(RESOURCE_GHODIUM, terminal.store[RESOURCE_GHODIUM] * 0.5, otherTerminals[id].room.name) === OK) {
                    return log.a(' MARKET: Distributing ' + terminal.store[RESOURCE_GHODIUM] * 0.5 + ' ' + RESOURCE_GHODIUM + ' To ' + otherTerminals[id].room.name + ' From ' + terminal.room.name);
                }
            }
        }
    }
}

function supplyReactionRoom(terminal) {
    for (let i = 0; i < reactionNeeds.length; i++) {
        let stored = terminal.store[reactionNeeds[i]] || 0;
        let reactionTerminal = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && s.room.memory.reactionRoom)[0];
        if (stored >= 500 && _.sum(reactionTerminal.store) <= reactionTerminal.storeCapacity * 0.9) {
            let reactionRoom = _.filter(Game.rooms, (r) => r.memory && r.memory.reactionRoom)[0].name;
            if (terminal.send(reactionNeeds[i], stored, reactionRoom, 'Supplying Reaction Room With ' + reactionNeeds[i]) === OK) {
                return log.a(' MARKET: Distributing ' + stored + ' ' + reactionNeeds[i] + ' To ' + reactionRoom + ' From ' + terminal.room.name);
            }
        }
    }
}