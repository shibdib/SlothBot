/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
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

let isActive = OwnedStructure.prototype.isActive;
/**
 * More efficient isActive function for owned structures
 * @returns {boolean|*}
 */
OwnedStructure.prototype.isActive = function () {
    if (this.room.memory && this.room.memory.stats && this.room.memory.stats.highestRCL && this.room.memory.stats.highestRCL === (this.room.controller.level || 0)) {
        return true;
    }
    return isActive.call(this);
}

/**
 * Structure room visual
 * @param what
 */
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

/**
 * Structure room visual line to another object
 * @param to
 * @param color
 */
RoomObject.prototype.lineTo = function (to, color = "#eeeeee") {
    this.room.visual.line(this.pos.x, this.pos.y, to.pos.x, to.pos.y, {
        color: color,
        opacity: 0.9,
        width: 0.1
    });
};