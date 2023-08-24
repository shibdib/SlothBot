/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Provides structure memory.
 */
Object.defineProperty(StructureLab.prototype, 'memory', {
    get: function () {
        if (this.room.memory._structureMemory === undefined || !this.room.memory._structureMemory) {
            this.room.memory._structureMemory = {};
        }
        if (this.room.memory._structureMemory[this.id] === undefined || !this.room.memory._structureMemory[this.id]) {
            this.room.memory._structureMemory[this.id] = {};
        }
        return this.room.memory._structureMemory[this.id];
    },
    set: function (v) {
        return _.set(this.room.memory, '_structureMemory.' + this.id, v);
    },
    configurable: true,
    enumerable: false,
});

let isActive = OwnedStructure.prototype.isActive;
OwnedStructure.prototype.isActive = function () {
    if (this.room.memory && this.room.memory.stats && this.room.memory.stats.highestRCL && this.room.memory.stats.highestRCL === (this.room.controller.level || 0)) {
        return true;
    }
    return isActive.call(this);
}

Object.defineProperty(StructureFactory.prototype, 'memory', {
    get: function () {
        if (this.room.memory._structureMemory === undefined || !this.room.memory._structureMemory) {
            this.room.memory._structureMemory = {};
        }
        if (this.room.memory._structureMemory[this.id] === undefined || !this.room.memory._structureMemory[this.id]) {
            this.room.memory._structureMemory[this.id] = {};
        }
        return this.room.memory._structureMemory[this.id];
    },
    set: function (v) {
        return _.set(this.room.memory, '_structureMemory.' + this.id, v);
    },
    configurable: true,
    enumerable: false,
});

Object.defineProperty(StructureTerminal.prototype, 'memory', {
    get: function () {
        if (this.room.memory._structureMemory === undefined || !this.room.memory._structureMemory) {
            this.room.memory._structureMemory = {};
        }
        if (this.room.memory._structureMemory[this.id] === undefined || !this.room.memory._structureMemory[this.id]) {
            this.room.memory._structureMemory[this.id] = {};
        }
        return this.room.memory._structureMemory[this.id];
    },
    set: function (v) {
        return _.set(this.room.memory, '_structureMemory.' + this.id, v);
    },
    configurable: true,
    enumerable: false,
});

Object.defineProperty(Source.prototype, 'memory', {
    get: function () {
        if (this.room.memory._structureMemory === undefined || !this.room.memory._structureMemory) {
            this.room.memory._structureMemory = {};
        }
        if (this.room.memory._structureMemory[this.id] === undefined || !this.room.memory._structureMemory[this.id]) {
            this.room.memory._structureMemory[this.id] = {};
        }
        return this.room.memory._structureMemory[this.id];
    },
    set: function (v) {
        return _.set(this.room.memory, '_structureMemory.' + this.id, v);
    },
    configurable: true,
    enumerable: false,
});
/**
 * Generalized target locking function for actors with memory.
 *
 * Valid actors include creeps, flags, and structures if you assign them memory.
 *
 * The selector function picks all available candidates, but only runs during
 * the target selection phase. This is where your CPU heavy work should go.
 *
 * The validator function is ran for each candidate, and once per call to
 * ensure the target is still valid for use, so you want this function to be as
 * cheap as possible. The parameter is technically optional, with all values
 * being considered valid. But then why are you using this?
 *
 * The chooser function is ran once at the end of target selection, to pick
 * which of the valid candidates you want to use. This parameter is optional,
 * defaulting to the first item in the array if omitted. It expects a single
 * result so opt for a _.min or _.max over a sort.
 *
 * The prop parameter is the key used to store the target's id in memory. This
 * optionally allows us to have multiple target locks with different names.
 *
 * @param selector
 * @param validator
 * @param chooser
 * @param prop
 */
RoomObject.prototype.getTarget = function (selector, validator = _.identity, chooser = _.first, prop = 'tid') {
    let tid = this.memory[prop];
    let target = Game.getObjectById(tid);
    if (!target || !validator(target)) {
        let candidates = _.filter(selector.call(this, this), validator);
        if (candidates && candidates.length)
            target = chooser(candidates, this);
        else
            target = undefined;
        if (target)
            this.memory[prop] = target.id;
        else
            delete this.memory[prop];
    }
    if (target)
        target.room.visual.line(this.pos, target.pos, {lineStyle: 'dashed', opacity: 0.5});
    return target;
};

/**
 * Similar to getTarget, but ensures no other actor is assigned to this target.
 *
 * @param selector
 * @param restrictor
 * @param validator
 * @param chooser
 * @param prop
 */
RoomObject.prototype.getUniqueTarget = function (selector, restrictor, validator = _.identity, chooser = _.first, prop = 'tid') {
    let tid = this.memory[prop];
    let target = Game.getObjectById(tid);
    if (!target || !validator(target)) {
        this.clearTarget(prop);
        let invalid = restrictor.call(this, this) || [];
        let candidates = _.filter(selector.call(this, this), x => validator(x) && !invalid.includes(x.id));
        if (candidates && candidates.length)
            target = chooser(candidates, this);
        else
            target = undefined;
        if (target)
            this.memory[prop] = target.id;
        // console.log(`New target on tick ${Game.time}: ${target}`);
    }
    if (target)
        target.room.visual.line(this.pos, target.pos, {lineStyle: 'dashed', opacity: 0.5});
    return target;
};

RoomObject.prototype.clearTarget = function (prop = 'tid') {
    // delete this.memory[prop];
    delete this.memory[prop];
};

Creep.prototype.getRepairTarget = function () {
    return this.getTarget(
        ({room, pos}) => room.structures,
        (structure) => structure.hits < structure.hitsMax,
        (candidates) => _.min(candidates, 'hits')
    );
};

Creep.prototype.getLoadedContainerTarget = function () {
    return this.getTarget(
        ({room, pos}) => _.filter(room.structures, s => s.structureType === STRUCTURE_CONTAINER),
        (container) => _.sum(container.store) > 0,
        (containers) => _.max(containers, c => _.sum(container.store))
    )
};

RoomObject.prototype.say = function (what) {
    this.room.visual.line(this.pos.x, this.pos.y, this.pos.x + 1 - 0.2, this.pos.y - 1, {
        color: "#eeeeee",
        opacity: 0.9,
        width: 0.1
    }).circle(this.pos, {
        fill: "#aaffaa",
        opacity: 0.9
    }).text(what, this.pos.x + 1, this.pos.y - 1, {
        color: "black",
        opacity: 0.9,
        align: "left",
        font: "bold 0.6 Monospace",
        backgroundColor: "black",
        backgroundPadding: 0.3
    }).text(what, this.pos.x + 1, this.pos.y - 1, {
        color: "black",
        opacity: 0.9,
        align: "left",
        font: "bold 0.6 Monospace",
        backgroundColor: "#eeeeee",
        backgroundPadding: 0.2
    });
};

RoomObject.prototype.lineTo = function (to, color = "#eeeeee") {
    this.room.visual.line(this.pos.x, this.pos.y, to.pos.x, to.pos.y, {
        color: color,
        opacity: 0.9,
        width: 0.1
    });
};