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


function terminalControl() {
    let globalOrders = Game.market.getAllOrders();
    let myOrders = Game.market.orders;
    for (let terminal of _.values(Game.structures)) {
        if (terminal.structureType === STRUCTURE_TERMINAL) {
            let energyInRoom = _.sum(terminal.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                if (s['structure'] && s['structure'].store) {
                    return s['structure'].store[RESOURCE_ENERGY] || 0;
                } else {
                    return 0;
                }
            });
            //Energy balancer
            balanceEnergy(terminal, energyInRoom);

            //Cleanup broken or old order
            orderCleanup(myOrders);

            //update prices every 30 ticks
            if (Game.time % 30 === 0) {
                pricingUpdateSell(terminal, globalOrders, myOrders);
                pricingUpdateBuy(terminal, globalOrders, myOrders);
            }

            //extend old orders first
            extendSellOrders(terminal, myOrders);

            //Try to put up a sell, otherwise fill buy
            placeSellOrders(terminal, globalOrders, myOrders);
            fillBuyOrders(terminal, globalOrders);

            //Extend/Place buy orders if we have enough buffer cash
            extendBuyOrders(terminal, globalOrders, myOrders);
            placeBuyOrders(terminal, globalOrders, myOrders, energyInRoom);
            placeReactionOrders(terminal, globalOrders, myOrders);
            placeBoostOrders(terminal, globalOrders, myOrders);
        }
    }
}
module.exports.terminalControl = profiler.registerFN(terminalControl, 'terminalControl');

function fillBuyOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY]) {
        for (const resourceType in terminal.store) {
            if (resourceType !== RESOURCE_ENERGY) {
                if (Game.market.credits > 10000) {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                        order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                        Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 500), 'price');
                    let mySellOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                        order.type === ORDER_SELL && order.remainingAmount >= 1000 && order.roomName === terminal.pos.roomName), 'price');
                    if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                        if (Game.market.deal(buyOrder.id, terminal.store[resourceType], terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType]) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType]) + " credits</font>");
                        }
                    } else if (buyOrder.id && buyOrder.remainingAmount < terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                        if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                        }
                    } else {
                        let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                            order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                            Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 1000), 'price');
                        if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                            if (Game.market.deal(buyOrder.id, terminal.store[resourceType], terminal.pos.roomName) === OK) {
                                console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType]) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType]) + " credits</font>");
                            }
                        } else if (buyOrder.id && buyOrder.remainingAmount < terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                            if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                                console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                            }
                        } else {
                            let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                                order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                                Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= terminal.store[RESOURCE_ENERGY]), 'price');
                            if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                                if (Game.market.deal(buyOrder.id, terminal.store[resourceType], terminal.pos.roomName) === OK) {
                                    console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType]) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType]) + " credits</font>");
                                }
                            } else if (buyOrder.id && buyOrder.remainingAmount < terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                                if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                                    console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                                }
                            }
                        }
                    }
                }
                else {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                        order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                        Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= terminal.store[RESOURCE_ENERGY]), 'price');
                    if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType]) {
                        if (Game.market.deal(buyOrder.id, terminal.store[resourceType], terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType] - energyAmount) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType] - energyAmount) + " credits</font>");
                        }
                    } else if (buyOrder.id && buyOrder.remainingAmount < terminal.store[resourceType]) {
                        if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                        }
                    }
                }
            }
            /**else if (terminal.store[RESOURCE_ENERGY] > energyAmount * 2) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(terminal.store[RESOURCE_ENERGY] - energyAmount, terminal.pos.roomName, order.roomName) < energyAmount), 'price');
                if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType] - energyAmount) {
                    if (Game.market.deal(buyOrder.id, (terminal.store[RESOURCE_ENERGY] - energyAmount), terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType] - energyAmount) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType] - energyAmount) + " credits</font>");
                    }
                } else if (buyOrder.id) {
                    if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                    }
                }
            }**/
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
                            console.log("<font color='#adff2f'>MARKET: Extended sell order " + myOrders[key].id + " an additional " + terminal.store[resourceType] + " " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                    if ((terminal.store[resourceType] - reactionAmount) > myOrders[key].remainingAmount && _.includes(reactionNeeds, resourceType) === true && resourceType !== RESOURCE_ENERGY) {
                        if (Game.market.extendOrder(myOrders[key].id, (terminal.store[resourceType] - reactionAmount)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Extended sell order " + myOrders[key].id + " an additional " + terminal.store[resourceType] - reactionAmount + " " + resourceType + "</font>");
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
            if (resourceType !== RESOURCE_ENERGY && _.includes(doNotSell, resourceType) === false) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && myOrders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 7500 && order.roomName !== terminal.pos.roomName), 'price');
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === false) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round((sellOrder.price - 0.001), 3), terminal.store[resourceType], terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.001) + "</font>");
                    }
                    continue;
                }
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === true && terminal.store[resourceType] - reactionAmount > 0) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round((sellOrder.price - 0.001), 3), terminal.store[resourceType] - reactionAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.001) + "</font>");
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
                            console.log("<font color='#adff2f'>MARKET: Extended Buy order " + myOrders[key].id + " an additional " + tradeAmount - (currentSupply + currentOrder) + " " + tradeTargets[i] + "</font>");
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
                            console.log("<font color='#adff2f'>MARKET: New Buy Order: " + tradeTargets[i] + " at/per " + (buyOrder.price + 0.001) + " credits</font>");
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
                            console.log("<font color='#adff2f'>MARKET: Extended energy buy order " + myOrders[key].id + " an additional " + myOrders[key].remainingAmount - currentSupply + "</font>");
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
                    console.log("<font color='#adff2f'>MARKET: New Buy Order: " + RESOURCE_ENERGY + " at/per " + (buyOrder.price + 0.001) + "</font>");
                }
            }
        }
    }
}
placeBuyOrders = profiler.registerFN(placeBuyOrders, 'placeBuyOrdersTerminal');

function placeReactionOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < reactionNeeds.length; i++) {
            let minerals = terminal.pos.findClosestByRange(FIND_MINERALS);
            if (minerals.resourceType === reactionNeeds[i] && minerals.mineralAmount > 0) {
                continue;
            }
            if (terminal.store[reactionNeeds[i]] < reactionAmount || !terminal.store[reactionNeeds[i]] && Game.market.credits > 500) {
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
                                console.log("<font color='#adff2f'>MARKET: Extended Reaction buy order " + myOrders[key].id + " an additional " + reactionAmount - currentSupply + "</font>");
                            }
                        }
                        continue resource;
                    }
                }
                if (Game.market.credits * 0.1 > reactionAmount * buyOrder.price) {
                    if (Game.market.createOrder(ORDER_BUY, reactionNeeds[i], buyOrder.price + 0.001, reactionAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Reaction Needs Buy Order: " + reactionNeeds[i] + " at/per " + (buyOrder.price) + " credits</font>");
                    }
                }
            }
        }
}
placeReactionOrders = profiler.registerFN(placeReactionOrders, 'placeReactionOrdersTerminal');

function placeBoostOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < boostNeeds.length; i++) {
            if (terminal.store[boostNeeds[i]] < boostAmount || !terminal.store[boostNeeds[i]] && Game.market.credits > 500) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === boostNeeds[i] &&
                    order.type === ORDER_BUY && order.remainingAmount >= 2000 && order.roomName !== terminal.pos.roomName), 'price');
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === boostNeeds[i] && myOrders[key].type === ORDER_BUY) {
                        let currentSupply;
                        if (isNaN(terminal.store[boostNeeds[i]]) === true) {
                            currentSupply = myOrders[key].remainingAmount;
                        } else {
                            currentSupply = terminal.store[boostNeeds[i]] + myOrders[key].remainingAmount;
                        }
                        if (Game.market.credits * 0.1 > (boostAmount - currentSupply) * buyOrder.price) {
                            if (Game.market.extendOrder(myOrders[key].id, boostAmount - currentSupply) === OK) {
                                console.log("<font color='#adff2f'>MARKET: Extended Reaction buy order " + myOrders[key].id + " an additional " + boostAmount - currentSupply + "</font>");
                            }
                        }
                        continue resource;
                    }
                }
                if (Game.market.credits * 0.1 > boostAmount * buyOrder.price) {
                    if (Game.market.createOrder(ORDER_BUY, boostNeeds[i], buyOrder.price + 0.001, boostAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Reaction Needs Buy Order: " + boostNeeds[i] + " at/per " + (buyOrder.price) + " credits</font>");
                    }
                }
            }
        }
}
placeReactionOrders = profiler.registerFN(placeReactionOrders, 'placeReactionOrdersTerminal');

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
                                console.log("<font color='#adff2f'>MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price), 3) + "/" + myOrders[key].price + " Resource - " + resourceType + "</font>");
                            }
                            continue resource;
                        }
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.001, 3) !== _.round(myOrders[key].price, 3) && _.round(sellOrder.price - 0.001, 3) > _.round(buyOrder.price, 3) && sellOrder.price - 0.001 !== 0) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, _.round((sellOrder.price - 0.001), 3)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price - 0.001), 3) + "/" + myOrders[key].price + " Resource - " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(myOrders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) < _.round(buyOrder.price, 2) && sellOrder.price - 0.01 !== 0) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, _.round((buyOrder.price), 3)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price - 0.001), 3) + "/" + myOrders[key].price + " Resource - " + resourceType + "</font>");
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
                        console.log("<font color='#adff2f'>MARKET: Buy order price change " + myOrders[key].id + " new/old " + (buyOrder.price + 0.001) + "/" + myOrders[key].price + " Resource - " + myOrders[key].resourceType + "</font>");
                    }
                }
            } else {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === myOrders[key].resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 20000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id) {
                    if (Game.market.changeOrderPrice(myOrders[key].id, (buyOrder.price + 0.001)) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Buy order price change " + myOrders[key].id + " new/old " + (buyOrder.price + 0.001) + "/" + myOrders[key].price + " Resource - " + myOrders[key].resourceType + "</font>");

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
                    console.log("<font color='#adff2f'>MARKET: Order Cancelled: " + myOrders[key].id + " due to low credits </font>");
                }
            }
            if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                if (myOrders[key].remainingAmount > tradeAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + tradeAmount + "</font>");
                    }
                }
            } else {
                if (myOrders[key].remainingAmount > energyAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + energyAmount + "</font>");
                    }
                }
            }
        }
    }
}
orderCleanup = profiler.registerFN(orderCleanup, 'orderCleanupTerminal');

function balanceEnergy(terminal, energyInRoom) {
    terminal.room.memory.energySurplus = energyInRoom >= energyAmount + (energyAmount * 0.10);
    terminal.room.memory.energyNeeded = energyInRoom < energyAmount;
    let needingRooms = _.filter(Game.rooms, (r) => r.memory && r.memory.energyNeeded);
    let cost;
    if (needingRooms[0]) cost = Game.market.calcTransactionCost(energyAmount * 0.10, needingRooms[0].name, terminal.room.name);
    if (needingRooms[0] && terminal.room.memory.energySurplus && terminal.store[RESOURCE_ENERGY] >= (energyAmount * 0.10) + cost && !terminal.cooldown) {
        terminal.send(RESOURCE_ENERGY, energyAmount * 0.10, needingRooms[0].name, terminal.room.name + ' energy distributed to ' + needingRooms[0].name);
    }
}

balanceEnergy = profiler.registerFN(balanceEnergy, 'orderCleanupTerminal'); 