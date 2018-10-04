Creep.prototype.robbery = function () {
    let sentence = ['#overlords', 'Thanks', 'For', 'The', 'Stuff', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    let terminal = this.room.terminal;
    let storage = this.room.storage;
    let tower = _.max(_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy > 0), 'energy');
    if (this.room.name !== this.memory.targetRoom && !this.memory.hauling) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        preferHighway: true
    });
    if (this.room.name === this.memory.targetRoom && (!terminal || !_.sum(terminal.store)) && (!storage || !_.sum(storage.store))) {
        switch (this.signController(this.room.controller, 'Thanks for the loot! #robbed #Overlord-Bot')) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                return this.shibMove(this.room.controller);
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
    if (this.room.name === this.memory.targetRoom) {
        let tick = Game.time;
        let storageAmount, terminalAmount = 0;
        if (storage) storageAmount = _.sum(storage.store) || 0;
        if (terminal) terminalAmount = _.sum(terminal.store) || 0;
        let lootAmount = storageAmount + terminalAmount;
        let opLevel = lootAmount / 500 || 1;
        let cache = Memory.targetRooms || {};
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'robbery',
            level: _.round(opLevel),
        };
        Memory.targetRooms = cache;
    }
    if (!this.memory.hauling) {
        if (((!terminal || !_.sum(terminal.store)) && (!storage || !_.sum(storage.store))) || _.sum(this.carry) === this.carryCapacity) return this.memory.hauling = true;
        if (tower) {
            switch (this.withdraw(tower, RESOURCE_ENERGY)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return this.shibMove(storage);
            }
        } else if (storage && _.sum(storage.store)) {
            for (let resourceType in storage.store) {
                switch (this.withdraw(storage, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        return this.shibMove(storage);
                }
            }
        } else if (terminal && _.sum(terminal.store)) {
            for (let resourceType in terminal.store) {
                switch (this.withdraw(terminal, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        return this.shibMove(terminal);
                }
            }
        }
    } else {
        if (_.sum(this.carry) === 0) return delete this.memory.hauling;
        if (this.pos.roomName === this.memory.overlord) {
            if (this.renewalCheck(6)) return;
            if (this.memory.storageDestination) {
                let storageItem = Game.getObjectById(this.memory.storageDestination);
                for (const resourceType in this.carry) {
                    switch (this.transfer(storageItem, resourceType)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            this.shibMove(storageItem);
                            break;
                        case ERR_FULL:
                            delete this.memory.storageDestination;
                            break;
                    }
                }
            } else {
                let storage = this.room.storage;
                let terminal = this.room.terminal;
                if (storage && _.sum(storage.store) < storage.storeCapacity * 0.70) {
                    this.memory.storageDestination = storage.id;
                    for (const resourceType in this.carry) {
                        switch (this.transfer(storage, resourceType)) {
                            case OK:
                                delete this.memory.storageDestination;
                                delete this.memory.destinationReached;
                                break;
                            case ERR_NOT_IN_RANGE:
                                this.shibMove(storage);
                                break;
                            case ERR_FULL:
                                delete this.memory.storageDestination;
                                this.findStorage();
                                break;
                        }
                    }
                } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.70) {
                    this.memory.storageDestination = terminal.id;
                    for (const resourceType in this.carry) {
                        switch (this.transfer(terminal, resourceType)) {
                            case OK:
                                delete this.memory.storageDestination;
                                delete this.memory.destinationReached;
                                break;
                            case ERR_NOT_IN_RANGE:
                                this.shibMove(terminal);
                                break;
                            case ERR_FULL:
                                delete this.memory.storageDestination;
                                this.findStorage();
                                break;
                        }
                    }
                }
            }
        } else {
            return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 19, preferHighway: true});
        }
    }
};