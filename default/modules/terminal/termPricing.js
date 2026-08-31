/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Order pricing, cleanup, and pixel sales.

 */


const state = require('termState');
const {
    selectMarketHub,
    shouldProcureResource,
    isMarketProcureResource,
    isCompressedBar,
    maxBarBuyPrice
} = require('termMarket');
const FactoryControl = require('module.factoryController');

const TerminalControl = require('termClass');

function isPendingOrder(order) {
    return !!(order && (order.pending || (typeof order.id === 'string' && order.id.startsWith('pending_'))));
}

function pickDuplicateKeeper(group, orderType) {
    let keeper = group[0];
    for (let i = 1; i < group.length; i++) {
        const order = group[i];
        if (orderType === ORDER_SELL) {
            if (order.price > keeper.price) {
                keeper = order;
                continue;
            }
            if (order.price < keeper.price) continue;
        } else {
            if (order.price < keeper.price) {
                keeper = order;
                continue;
            }
            if (order.price > keeper.price) continue;
        }
        const orderCreated = order.created || Infinity;
        const keeperCreated = keeper.created || Infinity;
        if (orderCreated < keeperCreated) {
            keeper = order;
            continue;
        }
        if (orderCreated > keeperCreated) continue;
        if ((order.remainingAmount || 0) > (keeper.remainingAmount || 0)) {
            keeper = order;
            continue;
        }
        if ((order.remainingAmount || 0) < (keeper.remainingAmount || 0)) continue;
        if (String(order.id) < String(keeper.id)) keeper = order;
    }
    return keeper;
}


Object.assign(TerminalControl.prototype, {

    pricingUpdate(globalOrders, myOrders) {
        for (let key in myOrders) {
            let order = myOrders[key];
            if (!order || isPendingOrder(order)) continue;

            // Energy, mineral, and bar buy orders are repriced by placeBuyOrders -- skip here
            if (order.type === ORDER_BUY && (order.resourceType === RESOURCE_ENERGY || isMarketProcureResource(order.resourceType))) continue;

            // Initialize the tracker for this order if it doesn't exist
            if (!state.priceUpdateTracker[order.id]) {
                state.priceUpdateTracker[order.id] = {lastChange: 0};
            } else if (state.priceUpdateTracker[order.id].lastChange + 500 > Game.time) {
                continue; // Check less frequently (every 500 ticks) to save CPU/spam
            }

            // Determine the optimal price based on competition
            let currentPrice = order.price;
            let newPrice = this.calculatePrice(order.type, order.resourceType, currentPrice);

            // Calculate the cost of changing the price (5% market fee only if price INCREASES)
            let cost = newPrice > currentPrice ? (newPrice - currentPrice) * order.remainingAmount * 0.05 : 0;
            let availableCash = Game.market.credits - CREDIT_BUFFER;

            // Only change the price if it's significantly different and we can afford the cost
            if (Math.abs(currentPrice - newPrice) > 0.001 && cost <= availableCash) {
                if (Game.market.changeOrderPrice(order.id, newPrice) === OK) {
                    state.priceUpdateTracker[order.id].lastChange = Game.time;
                }
            }
        }
    },

    sellPixels() {
        if (Game.resources[PIXEL] && Game.resources[PIXEL] > PIXEL_BUFFER) {
            let sellAmount = Game.resources[PIXEL] - PIXEL_BUFFER;
            let marketHistory = latestMarketHistory(PIXEL);
            const trend = this.getCreditTrend();
            let minPrice = marketHistory.avg ? marketHistory.avg * (trend > 0 ? 0.95 : 0.8) : 1000;

            // Find best buyer globally (pixels don't have transaction costs)
            let orders = this.getGlobalOrders().filter(order =>
                order.resourceType === PIXEL &&
                order.type === ORDER_BUY &&
                order.price >= minPrice
            );

            if (orders.length > 0) {
                let bestOrder = orders.sort((a, b) => b.price - a.price)[0];
                let amountToSell = Math.min(sellAmount, bestOrder.remainingAmount);

                if (amountToSell > 0) {
                    if (Game.market.deal(bestOrder.id, amountToSell) === OK) {
                        log.a(`Sold ${amountToSell} Pixels for ${bestOrder.price * amountToSell} credits.`, "Market: ");
                        return true;
                    }
                }
            }
        }
        return false;
    },

    pruneNonHubOrders(myOrders) {
        if (typeof myOrders !== 'object' || !Object.keys(myOrders).length) return;
        const marketHub = state.ledger?.marketHub || selectMarketHub();
        if (!marketHub) return;
        for (const orderId in myOrders) {
            const order = myOrders[orderId];
            if (!order || isPendingOrder(order)) continue;
            if (_.includes(MY_ROOMS, order.roomName) && order.roomName !== marketHub
                && order.type === ORDER_BUY) {
                this.cancelOrder(order, 'Buy orders centralized on market hub');
            }
        }
    },

    orderCleanup(myOrders, globalOrders) {
        // Ensure myOrders is an object and contains valid order data
        if (typeof myOrders !== 'object' || Object.keys(myOrders).length === 0) {
            return;
        }

        this.pruneNonHubOrders(myOrders);

        const currentCredits = Game.market.credits;
        const cancelled = new Set();
        const seenGroups = new Set();
        for (let orderId in myOrders) {
            let order = myOrders[orderId];

            if (!order || isPendingOrder(order) || cancelled.has(order.id)) continue;

            // Check if room still exists
            if (!Game.rooms[order.roomName] && Game.market.cancelOrder(order.id) === OK) {
                cancelled.add(order.id);
                log.a(`Order Cancelled: ${order.id} - Room no longer exists.`, 'MARKET: ');
                continue;
            }

            // Cancel inactive orders
            if (!order.active) {
                this.cancelOrder(order, 'Order no longer active');
                cancelled.add(order.id);
                continue;
            }

            // Sell vs buy on the same room/resource — lab procurement conflict
            if (order.type === ORDER_SELL && _.some(myOrders, o =>
                o && !isPendingOrder(o) && !cancelled.has(o.id) && o.active
                && o.id !== order.id && o.roomName === order.roomName
                && o.type === ORDER_BUY && o.resourceType === order.resourceType
            )) {
                this.cancelOrder(order, 'Conflicting buy order active');
                cancelled.add(order.id);
                continue;
            }

            // Check if boosts and we shouldn't be selling them
            if (order.type === ORDER_SELL && ALL_BOOSTS.includes(order.resourceType) && (!SELL_BOOSTS || Game.rooms[order.roomName].controller.level < 8)) {
                this.cancelOrder(order, 'Boost sales are disabled');
                cancelled.add(order.id);
                continue;
            }

            // Check credit balance for buying
            if (order.type === ORDER_BUY && currentCredits < CREDIT_BUFFER * 0.5) {
                this.cancelOrder(order, 'Low credits');
                cancelled.add(order.id);
                continue;
            }

            // Minerals/bars only, and only when we still need them (not mining, or extreme shortage)
            if (order.type === ORDER_BUY && order.resourceType !== RESOURCE_ENERGY) {
                if (!isMarketProcureResource(order.resourceType)) {
                    this.cancelOrder(order, 'Boost and compound buys disabled');
                    cancelled.add(order.id);
                    continue;
                }
                if (!shouldProcureResource(order.resourceType)) {
                    this.cancelOrder(order, 'No longer procuring this resource');
                    cancelled.add(order.id);
                    continue;
                }
                if (isCompressedBar(order.resourceType)) {
                    const cap = maxBarBuyPrice(order.resourceType, globalOrders);
                    if (!(cap > 0)) {
                        this.cancelOrder(order, 'Cannot value bar vs raw mineral');
                        cancelled.add(order.id);
                        continue;
                    }
                    if (order.price >= cap) {
                        const capped = cap * 0.99;
                        if (capped > 0) Game.market.changeOrderPrice(order.id, capped);
                        else {
                            this.cancelOrder(order, 'Bar buy not cheaper than raw mineral');
                            cancelled.add(order.id);
                            continue;
                        }
                    }
                }
            }

            // Cancel duplicate orders. Keep best price, then oldest; never drop both
            // when prices tie (lodash max/min is unstable on equal keys).
            const dupKey = `${order.roomName}|${order.type}|${order.resourceType}`;
            if (!seenGroups.has(dupKey)) {
                seenGroups.add(dupKey);
                const group = [];
                for (const id in myOrders) {
                    const other = myOrders[id];
                    if (!other || isPendingOrder(other) || cancelled.has(other.id) || !other.active || !other.remainingAmount) continue;
                    if (other.roomName === order.roomName && other.resourceType === order.resourceType && other.type === order.type) {
                        group.push(other);
                    }
                }
                if (group.length > 1) {
                    const keeper = pickDuplicateKeeper(group, order.type);
                    for (const dup of group) {
                        if (dup.id !== keeper.id) {
                            this.cancelOrder(dup, 'Duplicate order detected');
                            cancelled.add(dup.id);
                        }
                    }
                }
            }
            if (cancelled.has(order.id)) continue;

            // One sell listing per resource empire-wide so satellites do not stack duplicates.
            if (order.type === ORDER_SELL) {
                const empireSellKey = `empire|${ORDER_SELL}|${order.resourceType}`;
                if (!seenGroups.has(empireSellKey)) {
                    seenGroups.add(empireSellKey);
                    const group = [];
                    for (const id in myOrders) {
                        const other = myOrders[id];
                        if (!other || isPendingOrder(other) || cancelled.has(other.id) || !other.active) continue;
                        if (other.type === ORDER_SELL && other.resourceType === order.resourceType
                            && other.roomName && MY_ROOMS.includes(other.roomName)) {
                            group.push(other);
                        }
                    }
                    if (group.length > 1) {
                        let keeper = group[0];
                        for (let i = 1; i < group.length; i++) {
                            const candidate = group[i];
                            if (candidate.price < keeper.price) {
                                keeper = candidate;
                                continue;
                            }
                            if (candidate.price > keeper.price) continue;
                            if ((candidate.remainingAmount || 0) > (keeper.remainingAmount || 0)) keeper = candidate;
                        }
                        for (const dup of group) {
                            if (dup.id !== keeper.id) {
                                this.cancelOrder(dup, 'Empire already listing this resource');
                                cancelled.add(dup.id);
                            }
                        }
                    }
                }
            }
            if (cancelled.has(order.id)) continue;

            // Cancel energy orders if surplus detected
            if (order.resourceType === RESOURCE_ENERGY) {
                if (order.type === ORDER_BUY) {
                    const orderRoom = Game.rooms[order.roomName];
                    // Cancel only if the room placing the order itself no longer needs energy
                    if (!orderRoom || orderRoom.energyState >= 1) {
                        this.cancelOrder(order, 'Energy surplus detected');
                        continue;
                    }
                    if (orderRoom.store(RESOURCE_BATTERY) >= FactoryControl.batteryBatchCost()) {
                        this.cancelOrder(order, 'Unpack batteries before buying energy');
                        continue;
                    }
                } else if (order.type === ORDER_SELL) {
                    if (Game.rooms[order.roomName] && Game.rooms[order.roomName].level < 8) {
                        this.cancelOrder(order, 'Pre-RCL8 rooms do not sell energy');
                        continue;
                    }
                    if (_.find(MY_ROOMS, r => {
                        const room = Game.rooms[r];
                        return room && room.terminal && room.energyState < 2;
                    })) {
                        this.cancelOrder(order, 'Energy shortage detected');
                        continue;
                    }
                    if (!SELL_ENERGY) {
                        const sellTerminal = Game.rooms[order.roomName] && Game.rooms[order.roomName].terminal;
                        if (!sellTerminal || !this.canSellSurplusEnergy(sellTerminal)) {
                            this.cancelOrder(order, 'Energy selling not allowed');
                            continue;
                        }
                    }
                    if (Game.rooms[order.roomName].energyState < 2) {
                        this.cancelOrder(order, 'Energy shortage in room');
                        continue;
                    }
                }
                continue;
            }

            // Cancel fulfilled orders
            if (order.remainingAmount === 0) {
                this.cancelOrder(order, 'Order Fulfilled');
                continue;
            }

            // Shard-specific cancellation
            if (['swc', 'botarena'].includes(Game.shard.name) && order.type === ORDER_SELL) {
                this.cancelOrder(order, 'No selling in SWC or BA');
                continue;
            }

            // Extend orders if profitable
            if (order.type === ORDER_SELL) {
                let terminal = Game.rooms[order.roomName].terminal;
                if (terminal && terminal.store[order.resourceType] - order.remainingAmount > 1500) {
                    let availableAmount = terminal.store[order.resourceType] - order.remainingAmount;
                    let marketHistory = latestMarketHistory(order.resourceType);
                    if (marketHistory) {
                        let currentPriceRatio = order.price / marketHistory.avg;

                        // Don't extend if the current price is very poor, let pricingUpdate fix it first
                        // We no longer cancel active orders just because of volatility since we actively manage price
                        if (currentPriceRatio >= 0.75) {
                            let cost = order.price * availableAmount * 0.05;
                            if (cost <= Memory._banker.spendingAccount * 0.1) {
                                if (Game.market.extendOrder(order.id, availableAmount) === OK) {
                                    Memory._banker.spendingAccount -= cost;
                                    log.w(`Extended sell order ${order.id} by ${availableAmount} ${order.resourceType} in ${roomLink(order.roomName)}`, "Market: ");
                                }
                            }
                        }
                    }
                }
            } else if (order.type === ORDER_BUY) {
                if (this.getCreditTrend() < 0 && order.resourceType !== RESOURCE_ENERGY) continue;
                let terminal = Game.rooms[order.roomName].terminal;
                let keepAmount = this.determineKeepAmount(order.resourceType);
                let currentStored = terminal.room.store(order.resourceType);
                if (terminal && currentStored < keepAmount * 0.8 && order.remainingAmount < REACTION_AMOUNT * 0.5) {
                    let extendAmount = REACTION_AMOUNT - order.remainingAmount;
                    let marketHistory = latestMarketHistory(order.resourceType);
                    if (marketHistory) {
                        let currentPriceRatio = order.price / marketHistory.avg;
                        // Only extend if our price is still reasonable (at least 90% of market avg)
                        if (currentPriceRatio >= 0.9) {
                            let cost = order.price * extendAmount * 0.05;
                            if (cost <= Game.market.credits - CREDIT_BUFFER) {
                                if (Game.market.extendOrder(order.id, extendAmount) === OK) {
                                    log.w(`Extended buy order ${order.id} for ${extendAmount} ${order.resourceType} in ${roomLink(order.roomName)}`, "Market: ");
                                }
                            }
                        }
                    }
                }
            }
        }
    },

    cancelOrder(order, reason) {
        if (Game.market.cancelOrder(order.id) === OK) {
            delete state.priceUpdateTracker[order.id];
            log.a(`Order Cancelled: ${order.id} - ${order.resourceType} - ${reason}`, 'MARKET: ');
        }
    },

    calculatePrice(orderType, resource, currentPrice = null) {
        const marketHistory = latestMarketHistory(resource);
        // Find competitors (ignore tiny dust orders < 10 to avoid baiting)
        const competitors = this.getGlobalOrders().filter(o =>
            o.resourceType === resource &&
            (o.remainingAmount || o.amount) >= 10 &&
            !MY_ROOMS.includes(o.roomName)
        );

        const avgPrice = parseFloat(marketHistory.avg) || 1;
        const lastDay = parseFloat(marketHistory.last) || avgPrice;
        const trend5 = parseFloat(marketHistory.trend5) || lastDay;
        let maxAcceptable = avgPrice * 1.5; // Don't pay more than 150% of avg

        if (orderType === ORDER_SELL) {
            const activeSells = competitors.filter(o => o.type === ORDER_SELL).sort((a, b) => a.price - b.price);
            const activeBuys = competitors.filter(o => o.type === ORDER_BUY).sort((a, b) => b.price - a.price);
            const bestBuy = activeBuys.length ? activeBuys[0].price : 0;
            // Live book, not the 14-day mean. Never undercut the best bid; 50% of last-day is the dump floor.
            const minAcceptable = Math.max(bestBuy, lastDay * 0.5, 0.001);

            if (activeSells.length > 0) {
                const lowestCompetitor = activeSells[0].price;

                if (currentPrice !== null && currentPrice <= lowestCompetitor) {
                    if (lowestCompetitor - currentPrice > 0.05 * currentPrice) {
                        return Math.max(lowestCompetitor - 0.001, minAcceptable);
                    }
                    return currentPrice;
                }

                if (lowestCompetitor > minAcceptable) {
                    return lowestCompetitor - 0.001;
                }
                return Math.max(minAcceptable, Math.min(trend5, lowestCompetitor));
            }
            return Math.max(minAcceptable, trend5 || lastDay);
        } else { // ORDER_BUY
            let activeBuys = competitors.filter(o => o.type === ORDER_BUY).sort((a, b) => b.price - a.price); // Descending

            if (activeBuys.length > 0) {
                let highestCompetitor = activeBuys[0].price;

                if (currentPrice !== null && currentPrice >= highestCompetitor) {
                    // We are currently the highest bidder. Check if we're overpaying.
                    if (currentPrice - highestCompetitor > 0.05 * currentPrice) {
                        return Math.min(highestCompetitor + 0.001, maxAcceptable);
                    }
                    return currentPrice; // Hold our position
                }

                // Not the highest. Try to overbid if it's below our ceiling.
                if (highestCompetitor < maxAcceptable) {
                    return highestCompetitor + 0.001;
                } else {
                    // Hyperinflation detected. Cap at our ceiling.
                    return maxAcceptable;
                }
            } else {
                // No competition
                return marketHistory.trend5 ? Math.min(marketHistory.trend5, avgPrice * 0.95) : avgPrice * 0.95;
            }
        }
    }
});