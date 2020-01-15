/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.robbery = function () {
    let sentence = ['#overlords', 'Thanks', 'For', 'The', 'Stuff', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    let terminal = this.room.terminal;
    let storage = this.room.storage;
    // Kill if target is gone
    if (!Memory.targetRooms[this.memory.destination]) return this.memory.recycle = true;
    let tower = _.max(_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy > 0), 'energy');
    if (this.room.name !== this.memory.destination && !this.memory.hauling) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {
        range: 23,
        preferHighway: true,
        offRoad: true
    });
    if (this.room.name === this.memory.destination && (!terminal || !_.sum(terminal.store)) && (!storage || !_.sum(storage.store))) {
        highCommand.operationSustainability(this.room);
        switch (this.signController(this.room.controller, 'Thanks for the loot! #robbed #Overlord-Bot')) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                return this.shibMove(this.room.controller, {offRoad: true});
        }
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'clean',
            level: 1,
            complete: true
        };
        Memory.targetRooms = cache;
        return this.memory.role = 'remoteHauler';
    }
    // Set level based on how much stuff to haul
    if (this.room.name === this.memory.destination) {
        let tick = Game.time;
        let storageAmount, terminalAmount = 0;
        if (storage) storageAmount = _.sum(_.filter(storage.store, (r) => _.includes(TIER_2_BOOSTS, r.resourceType) || _.includes(END_GAME_BOOSTS, r.resourceType))) || 0;
        if (terminal) terminalAmount = _.sum(_.filter(terminal.store, (r) => _.includes(TIER_2_BOOSTS, r.resourceType) || _.includes(END_GAME_BOOSTS, r.resourceType))) || 0;
        let lootAmount = storageAmount + terminalAmount;
        let opLevel = lootAmount / 500;
        let cache = Memory.targetRooms || {};
        if (opLevel >= 1) {
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'robbery',
                level: _.round(opLevel),
            };
        } else {
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'clean',
                level: 1,
            };
        }
        Memory.targetRooms = cache;
    }
    if (!this.memory.hauling) {
        if (((!terminal || !_.sum(terminal.store)) && (!storage || !_.sum(storage.store))) || _.sum(this.store) === this.store.getCapacity()) return this.memory.hauling = true;
        if (tower.id) {
            switch (this.withdraw(tower, RESOURCE_ENERGY)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return this.shibMove(tower, {offRoad: true});
            }
        } else if (storage && _.sum(storage.store)) {
            for (let resourceType in storage.store) {
                switch (this.withdraw(storage, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        return this.shibMove(storage, {offRoad: true});
                }
            }
        } else if (terminal && _.sum(terminal.store)) {
            for (let resourceType in terminal.store) {
                switch (this.withdraw(terminal, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        return this.shibMove(terminal, {offRoad: true});
                }
            }
        }
    } else {
        if (!_.sum(this.store)) return delete this.memory.hauling;
        if (this.pos.roomName === this.memory.overlord) {
            if (this.memory.storageDestination || this.haulerDelivery()) {
                let storageItem = Game.getObjectById(this.memory.storageDestination);
                if (!storageItem) return delete this.memory.storageDestination;
                switch (this.transfer(storageItem, RESOURCE_ENERGY)) {
                    case OK:
                        delete this.memory.storageDestination;
                        delete this.memory._shibMove;
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(storageItem);
                        break;
                    case ERR_FULL || ERR_INVALID_TARGET:
                        delete this.memory.storageDestination;
                        delete this.memory._shibMove;
                        if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                        break;
                }
            } else this.idleFor(5);
        } else {
            return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {
                range: 19,
                preferHighway: true,
                offRoad: true
            });
        }
    }
};