Creep.prototype.robbery = function () {
    let sentence = ['#overlords', 'Thanks', 'You', 'For', 'The', 'Stuff', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    let terminal = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let storage = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    if (this.room.name !== this.memory.targetRoom && !this.memory.hauling) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    if (this.room.name === this.memory.targetRoom && (_.sum(terminal.store) === 0 && _.sum(storage.store) === 0)) {
        switch (this.signController(this.room.controller, 'Thanks for the loot! #robbed #overlords')) {
            case OK:
                Game.rooms[this.memory.overlord].memory.cleaningTargets = _.filter(Game.rooms[this.memory.overlord].memory.cleaningTargets, (t) => t.name !== this.memory.targetRoom);
                Memory.targetRooms = _.filter(Memory.targetRooms, (t) => t !== this.memory.targetRoom);
                break;
            case ERR_NOT_IN_RANGE:
                return this.shibMove(this.room.controller);
        }
        Memory.targetRooms = _.filter(Memory.targetRooms, (t) => t !== this.memory.targetRoom);
    }
    if (!this.memory.hauling) {
        if ((!terminal || (_.sum(terminal.store) === 0) && (!storage || _.sum(storage.store) === 0)) || _.sum(this.carry) === this.carryCapacity) return this.memory.hauling = true;
        if (storage && _.sum(storage.store) > 0) {
            for (let resourceType in storage.store) {
                switch (this.withdraw(storage, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        return this.shibMove(storage);
                }
            }
        } else if (terminal && _.sum(terminal.store) > 0) {
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
        if (_.sum(this.carry) === 0) return this.memory.hauling = undefined;
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
                            this.memory.storageDestination = undefined;
                            break;
                    }
                }
            } else {
                let storage = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
                let terminal = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
                if (storage && _.sum(storage.store) < storage.storeCapacity * 0.70) {
                    this.memory.storageDestination = storage.id;
                    for (const resourceType in this.carry) {
                        switch (this.transfer(storage, resourceType)) {
                            case OK:
                                this.memory.storageDestination = undefined;
                                this.memory.destinationReached = false;
                                break;
                            case ERR_NOT_IN_RANGE:
                                this.shibMove(storage);
                                break;
                            case ERR_FULL:
                                this.memory.storageDestination = undefined;
                                this.findStorage();
                                break;
                        }
                    }
                } else if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.70) {
                    this.memory.storageDestination = terminal.id;
                    for (const resourceType in this.carry) {
                        switch (this.transfer(terminal, resourceType)) {
                            case OK:
                                this.memory.storageDestination = undefined;
                                this.memory.destinationReached = false;
                                break;
                            case ERR_NOT_IN_RANGE:
                                this.shibMove(terminal);
                                break;
                            case ERR_FULL:
                                this.memory.storageDestination = undefined;
                                this.findStorage();
                                break;
                        }
                    }
                }
            }
        } else {
            return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 19});
        }
    }
};