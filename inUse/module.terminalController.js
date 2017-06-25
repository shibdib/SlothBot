/**
 * Created by rober on 6/21/2017.
 */
let _ = require('lodash');

let reactionNeeds = [
    RESOURCE_HYDROGEN,
    RESOURCE_GHODIUM
];

let tradeTargets = [RESOURCE_HYDROGEN,
    RESOURCE_OXYGEN,
    RESOURCE_UTRIUM,
    RESOURCE_KEANIUM,
    RESOURCE_LEMERGIUM,
    RESOURCE_ZYNTHIUM,
    RESOURCE_CATALYST,
    RESOURCE_POWER,
    RESOURCE_HYDROXIDE];

let tradeAmount = 1000;
let energyAmount = 5000;

module.exports.terminalControl = function () {
    let globalOrders = Game.market.getAllOrders();
    let myOrders = Game.market.orders;
    for (let terminal of _.values(Game.structures)) {
        if (terminal.structureType === STRUCTURE_TERMINAL) {
            //Cleanup broken or old order
            orderCleanup(myOrders);

            //update prices every 30 ticks
            if (Game.time % 30 === 0) {
                sellPriceUpdates(terminal, globalOrders, myOrders);
                buyPriceUpdates(terminal, globalOrders, myOrders);
            }

            //extend old orders first
            extendSellOrders(terminal, globalOrders, myOrders);

            //Try to put up a sell, otherwise fill buy
            placeSellOrders(terminal, globalOrders, myOrders);
            fillBuyOrders(terminal, globalOrders);

            //Extend/Place buy orders if we have enough buffer cash
            extendBuyOrders(terminal, globalOrders, myOrders);
            placeBuyOrders(terminal, globalOrders, myOrders);
            buyReactionNeeds(terminal, globalOrders, myOrders);

            //if we have credits make sure we have energy
            buyEnergy(terminal, globalOrders, myOrders);
        }
    }
};

function fillBuyOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY]) {
        for (const resourceType in terminal.store) {
            if (resourceType !== RESOURCE_ENERGY) {
                if (Game.market.credits > 500) {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 500), 'price');
                    let mySellOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 1000 && order.roomName === terminal.pos.roomName), 'price');
                    if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                        if (Game.market.deal(buyOrder.id, terminal.store[resourceType] - energyAmount, terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType] - energyAmount) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType] - energyAmount) + " credits</font>");
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
                            if (Game.market.deal(buyOrder.id, terminal.store[resourceType] - energyAmount, terminal.pos.roomName) === OK) {
                                console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType] - energyAmount) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType] - energyAmount) + " credits</font>");
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
                                if (Game.market.deal(buyOrder.id, terminal.store[resourceType] - energyAmount, terminal.pos.roomName) === OK) {
                                    console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType] - energyAmount) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType] - energyAmount) + " credits</font>");
                                }
                            } else if (buyOrder.id && buyOrder.remainingAmount < terminal.store[resourceType] && mySellOrder.id && buyOrder.price >= mySellOrder.price) {
                                if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                                    console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                                }
                            }
                        }
                    }
                } else {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= terminal.store[RESOURCE_ENERGY]), 'price');
                    if (buyOrder.id) {
                        if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                        }
                    }
                }
            } else if (terminal.store[RESOURCE_ENERGY] > energyAmount * 2) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(terminal.store[RESOURCE_ENERGY] - energyAmount, terminal.pos.roomName, order.roomName) < energyAmount), 'price');
                if (buyOrder.id && buyOrder.remainingAmount >= terminal.store[resourceType] - energyAmount) {
                    if (Game.market.deal(buyOrder.id, terminal.store[resourceType] - energyAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: buyOrderFilled - " + (terminal.store[resourceType] - energyAmount) + " " + resourceType + " for " + buyOrder.price * (terminal.store[resourceType] - energyAmount) + " credits</font>");
                    }
                } else if (buyOrder.id) {
                    if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + " credits</font>");
                    }
                }
            }
        }
    }
}

function buyEnergy(terminal, globalOrders, myOrders) {
    if (Game.market.credits > 500) {
        if (terminal.store[RESOURCE_ENERGY] < energyAmount / 2 || !terminal.store[RESOURCE_ENERGY]) {
            for (let key in myOrders) {
                if (myOrders[key].resourceType === RESOURCE_ENERGY && myOrders[key].type === ORDER_BUY) {
                    let currentSupply;
                    if (isNaN(terminal.store[RESOURCE_ENERGY]) === true) {
                        currentSupply = 0;
                    } else {
                        currentSupply = terminal.store[RESOURCE_ENERGY];
                    }
                    if (myOrders[key].remainingAmount < (energyAmount - currentSupply)) {
                        if (Game.market.extendOrder(myOrders[key].id, energyAmount - (currentSupply + myOrders[key].remainingAmount)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Extended energy buy order " + myOrders[key].id + " an additional " + myOrders[key].remainingAmount - (energyAmount - currentSupply) + "</font>");
                        }
                    }
                    return;
                }
            }
            let buyOrder = _.max(globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY &&
            order.type === ORDER_BUY && order.remainingAmount >= energyAmount / 2 && order.roomName !== terminal.pos.roomName), "price");
            if (buyOrder.id) {
                if (Game.market.createOrder(ORDER_BUY, RESOURCE_ENERGY, buyOrder.price, energyAmount, terminal.pos.roomName) === OK) {
                    console.log("<font color='#adff2f'>MARKET: New Buy Order: " + RESOURCE_ENERGY + " at/per " + (buyOrder.price) + "</font>");
                }
            }
        }
    }
}

function extendSellOrders(terminal, globalOrders, myOrders) {
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
                    if ((terminal.store[resourceType] - 1000) > myOrders[key].remainingAmount && _.includes(reactionNeeds, resourceType) === true && resourceType !== RESOURCE_ENERGY) {
                        if (Game.market.extendOrder(myOrders[key].id, (terminal.store[resourceType] - 1000)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Extended sell order " + myOrders[key].id + " an additional " + terminal.store[resourceType] - 1000 + " " + resourceType + "</font>");
                        }
                    }
                    if (resourceType === RESOURCE_ENERGY && terminal.store[resourceType] - myOrders[key].remainingAmount > energyAmount) {
                        if (Game.market.extendOrder(myOrders[key].id, (terminal.store[resourceType] - myOrders[key].remainingAmount) - energyAmount) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Extended sell order " + myOrders[key].id + " an additional " + terminal.store[resourceType] + " " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                }
            }
        }
}

function placeSellOrders(terminal, globalOrders, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            if (resourceType !== RESOURCE_ENERGY) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && myOrders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_SELL && order.remainingAmount >= 7500 && order.roomName !== terminal.pos.roomName), 'price');
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === false) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round((sellOrder.price - 0.01), 2), terminal.store[resourceType], terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.01) + "</font>");
                    }
                }
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === true && terminal.store[resourceType] - 1000 > 0) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round((sellOrder.price - 0.01), 2), terminal.store[resourceType] - 1000, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.01) + "</font>");
                    }
                }
            }
            /** else if (terminal.store[resourceType] > energyAmount) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && myOrders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_SELL && order.remainingAmount >= 7500 && order.roomName !== terminal.pos.roomName), 'price');
                if (sellOrder.id && _.includes(reactionNeeds, resourceType) === false) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, _.round(sellOrder.price, 2), terminal.store[resourceType] - energyAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Sell Order: " + resourceType + " at/per " + sellOrder.price + "</font>");
                    }
                }
            }**/
        }
}

function extendBuyOrders(terminal, globalOrders, myOrders) {
    for (let i = 0; i < tradeTargets.length; i++) {
        for (let key in myOrders) {
            if (tradeTargets[i] !== RESOURCE_ENERGY && myOrders[key].resourceType === tradeTargets[i] && myOrders[key].type === ORDER_BUY && myOrders[key].roomName === terminal.pos.roomName && Game.market.credits > 500) {
                let currentSupply;
                if (isNaN(terminal.store[tradeTargets[i]]) === true) {
                    currentSupply = 0;
                } else {
                    currentSupply = terminal.store[tradeTargets[i]];
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (currentSupply + myOrders[key].remainingAmount < tradeAmount && _.round(((sellOrder.price - 0.01) - buyOrder.price), 2) > 0.02 && Game.market.credits - (_.round(((sellOrder.price - 0.01) - buyOrder.price), 2) * 0.05) > 200) {
                    if (Game.market.extendOrder(myOrders[key].id, tradeAmount - (currentSupply + myOrders[key].remainingAmount)) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Extended Buy order " + myOrders[key].id + " an additional " + (tradeAmount - (currentSupply + myOrders[key].remainingAmount)) + " " + tradeTargets[i] + "</font>");
                    }
                }
            }
        }
    }
}

function placeBuyOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < tradeTargets.length; i++) {
            if (terminal.store[tradeTargets[i]] < tradeAmount || !terminal.store[tradeTargets[i]] && Game.market.credits > 500) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === tradeTargets[i] && myOrders[key].type === ORDER_BUY) {
                        continue resource;
                    }
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === tradeTargets[i] &&
                order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && _.round(((sellOrder.price - 0.01) - buyOrder.price), 2) > 0.02 && Game.market.credits - (_.round(((sellOrder.price - 0.01) - buyOrder.price), 2) * 0.05) > 200) {
                    if (Game.market.createOrder(ORDER_BUY, tradeTargets[i], buyOrder.price, tradeAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Buy Order: " + tradeTargets[i] + " at/per " + (buyOrder.price) + " credits</font>");
                        break;
                    }
                }
            }
        }
}

function buyReactionNeeds(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < reactionNeeds.length; i++) {
            if (terminal.store[reactionNeeds[i]] < tradeAmount || !terminal.store[reactionNeeds[i]] && Game.market.credits > 500) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === reactionNeeds[i] && myOrders[key].type === ORDER_BUY) {
                        continue resource;
                    }
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === reactionNeeds[i] &&
                order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === reactionNeeds[i] &&
                order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && ((sellOrder.price - 0.01) - buyOrder.price) > 0.01 && Game.market.credits - (_.round(((sellOrder.price - 0.01) - buyOrder.price), 2) * 0.05) > 200) {
                    if (Game.market.createOrder(ORDER_BUY, reactionNeeds[i], buyOrder.price, tradeAmount, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Reaction Needs Buy Order: " + reactionNeeds[i] + " at/per " + (buyOrder.price) + " credits</font>");
                    }
                }
            }
        }
}

function sellPriceUpdates(terminal, globalOrders, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in myOrders) {
                if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL) {
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), "price");
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (resourceType === RESOURCE_ENERGY) {
                        if (sellOrder.id && _.round(sellOrder.price, 2) !== _.round(myOrders[key].price, 2)) {
                            if (Game.market.changeOrderPrice(myOrders[key].id, _.round(sellOrder.price, 2)) === OK) {
                                console.log("<font color='#adff2f'>MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round(sellOrder.price, 2) + "/" + myOrders[key].price + " Resource - " + resourceType + "</font>");
                            }
                            continue resource;
                        }
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(myOrders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) > _.round(buyOrder.price, 2) && sellOrder.price - 0.01 !== 0) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, _.round((sellOrder.price - 0.01), 2)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price - 0.01), 2) + "/" + myOrders[key].price + " Resource - " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(myOrders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) < _.round(buyOrder.price, 2) && sellOrder.price - 0.01 !== 0) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, _.round((buyOrder.price), 2)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Sell order price change " + myOrders[key].id + " new/old " + _.round((sellOrder.price - 0.01), 2) + "/" + myOrders[key].price + " Resource - " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                }
            }
        }
}

function buyPriceUpdates(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < tradeTargets.length; i++) {
            for (let key in myOrders) {
                if (myOrders[key].type === ORDER_BUY && myOrders[key].roomName === terminal.pos.roomName && Game.market.credits > 500) {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === myOrders[key].resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === myOrders[key].resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (buyOrder.id && (_.round(buyOrder.price, 2)) !== _.round(myOrders[key].price, 2) && ((sellOrder.price - 0.01) - buyOrder.price) > 0.02) {
                        if (Game.market.changeOrderPrice(myOrders[key].id, (buyOrder.price)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Buy order price change " + myOrders[key].id + " new/old " + buyOrder.price + "/" + myOrders[key].price + " Resource - " + myOrders[key].resourceType + "</font>");
                        }
                        continue resource;
                    }
                }
            }
        }
}

function orderCleanup(myOrders) {
    for (let key in myOrders) {
        if (myOrders[key].type === ORDER_BUY) {
            if (Game.market.credits < 200) {
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