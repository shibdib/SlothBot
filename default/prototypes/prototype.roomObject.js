/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Per-tick cached structure memory — avoids repeated room.memory walks on hot paths
 * (lab.memory is accessed tens of thousands of times per tick via haulers / labTech).
 */
function getStructureMemory(obj) {
    const tick = Game.time;
    if (obj._structMemTick === tick) return obj._structMem;

    const roomMem = obj.room.memory;
    let byId = roomMem._structureMemory;
    if (!byId) byId = roomMem._structureMemory = {};
    let mem = byId[obj.id];
    if (!mem) mem = byId[obj.id] = {};

    obj._structMemTick = tick;
    obj._structMem = mem;
    return mem;
}

function setStructureMemory(obj, v) {
    obj._structMem = undefined;
    obj._structMemTick = undefined;
    return _.set(obj.room.memory, '_structureMemory.' + obj.id, v);
}

function defineStructureMemory(proto) {
    Object.defineProperty(proto.prototype, 'memory', {
        get: function () {
            return getStructureMemory(this);
        },
        set: function (v) {
            return setStructureMemory(this, v);
        },
        configurable: true,
        enumerable: false,
    });
}

defineStructureMemory(StructureLab);
defineStructureMemory(StructureFactory);
defineStructureMemory(StructureTerminal);
defineStructureMemory(Source);

let isActive = OwnedStructure.prototype.isActive;
/**
 * More efficient isActive function for owned structures
 * @returns {boolean|*}
 */
OwnedStructure.prototype.isActive = function () {
    try {
        const room = this.room;
        const controller = room && room.controller;
        const highestRCL = room && room.memory && room.memory.stats && room.memory.stats.highestRCL;
        if (highestRCL && controller && highestRCL === controller.level) {
            return true;
        }
        return isActive.call(this);
    } catch (e) {
        try {
            return isActive.call(this);
        } catch (ignored) {
            return false;
        }
    }
};

OwnedStructure.prototype.safeOwnerName = function () {
    try {
        return this.owner && this.owner.username;
    } catch (e) {
        return undefined;
    }
};

OwnedStructure.prototype.safeIsMy = function () {
    try {
        return !!this.my;
    } catch (e) {
        return false;
    }
};

if (typeof ConstructionSite !== 'undefined') {
    ConstructionSite.prototype.safeOwnerName = function () {
        try {
            return this.owner && this.owner.username;
        } catch (e) {
            return undefined;
        }
    };

    ConstructionSite.prototype.safeIsMy = function () {
        try {
            return !!this.my;
        } catch (e) {
            return false;
        }
    };
}

/**
 * Structure room visual
 * @param what
 */
RoomObject.prototype.say = function (what) {
    if (!this.room) return;
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