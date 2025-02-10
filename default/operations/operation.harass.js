/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('module.highCommand');

Creep.prototype.harass = function () {
    if (this.tryToBoost(['ranged_attack', 'heal'])) return;

    // If no harass targets, switch to border patrol.
    if (!Memory._threats || !Memory._threats.length) {
        this.memory.operation = 'borderPatrol';
        return;
    }

    let sentence = ['MURDER', 'MODE', 'ACTIVATED', '--', 'DANGER', '--'];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling
    if (this.handleMilitaryCreep()) return;

    // Healing
    if (this.hits < this.hitsMax) {
        if (this.hasActiveBodyparts(HEAL)) {
            this.findDefensivePosition();
            return this.heal(this);
        } else {
            return this.fleeHome();
        }
    }

    if (this.room.name === this.memory.destination || !this.memory.destination) {
        highCommand.generateThreat(this);  // Record threat for the current room

        // Handle visited tracking
        let visited = this.memory.other.visited || [];

        // Find the next harass target by considering threat level and user activity
        let target = _.min(
            _.filter(INTEL, (r) => {
                return (!visited.includes(r.name) && (!r.owner || !r.towers) && Memory._threats.includes(r.user)
                    && (!r.armedHostile || r.armedHostile + CREEP_LIFE_TIME < Game.time) && !r.safemode);
            }),
            (r) => findClosestOwnedRoom(r.name, true)
        );

        if (target && target.name) {
            visited.push(this.room.name);
            this.memory.other.visited = visited;
            this.memory.destination = target.name;
            this.say('RE-TASKED', true);
            log.a('Re-tasking harasser ' + this.name + ' to ' + roomLink(target.name) + ' targeting ' + INTEL[target.name].user + ' from ' + roomLink(this.room.name), 'HARASS: ');
        } else if (this.memory.other.visited.length) {
            this.memory.other.visited = [];
        } else {
            return this.fleeHome(true);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
