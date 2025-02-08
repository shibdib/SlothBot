/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('military.highCommand');

Creep.prototype.harass = function () {
    // If no harass targets are defined, switch to border patrol.
    if (!Memory._threats || !Memory._threats.length) {
        this.memory.operation = 'borderPatrol';
        return;
    }

    let sentence = ['MURDER', 'MODE', 'ACTIVATED', '--', 'DANGER', '--'];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling
    if (this.handleMilitaryCreep() || this.scorchedEarth()) return;

    // Healing
    if (this.hits < this.hitsMax) {
        if (this.hasActiveBodyparts(HEAL)) {
            this.findDefensivePosition();
            return this.heal(this);
        } else {
            return this.fleeHome();
        }
    }

    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this);  // Record threat for the current room

        // Handle visited tracking
        let visited = this.memory.other.visited || [];
        visited.push(this.room.name);
        this.memory.other.visited = visited;

        // Find the next harass target by considering threat level and user activity
        let target = _.min(
            _.filter(INTEL, (r) => {
                return (!visited.includes(r.name) && (!r.owner || !r.towers) && Memory._threats.includes(r.user) && !r.armedHostile);
            }),
            (r) => findClosestOwnedRoom(r.name, true)
        );

        if (target) {
            this.memory.destination = target.name;
            this.say('RE-TASKED', true);
            log.a('Re-tasking harasser ' + this.name + ' to ' + roomLink(target.name) + ' targeting ' + INTEL[target.name].user + ' from ' + roomLink(this.room.name), 'HARASS: ');
        } else if (this.memory.other.visited.length) {
            this.memory.other.visited = [];
        } else {
            this.idleFor(5);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
