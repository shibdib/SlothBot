/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('military.highCommand');

Creep.prototype.harass = function () {
    // If no harass targets are defined, switch to border patrol.
    if (!Memory.harassTargets || !Memory.harassTargets.length) {
        this.memory.operation = 'borderPatrol';
        return;
    }

    let sentence = ['MURDER', 'MODE', 'ACTIVATED', '--', 'DANGER', '--'];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this);  // Record threat for the current room

        // Handle combat: Engage if hostile creeps or structures are present and we can win
        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            if (!this.handleMilitaryCreep() && !this.scorchedEarth()) {
                this.findDefensivePosition();  // Move to a defensive position if necessary
            }
        } else {
            let visited = this.memory.other.visited || [];
            visited.push(this.room.name);
            this.memory.other.visited = visited;

            // Find the next harass target by considering threat level and user activity
            let target = _.min(
                _.filter(INTEL, (r) => {
                    return (
                        !visited.includes(r.name) &&
                        (!r.owner || r.level < 3) &&
                        Memory.harassTargets.includes(r.user)
                    );
                }),
                (r) => findClosestOwnedRoom(r.name, true)
            );

            if (target) {
                this.memory.destination = target.name;
                this.say('RE-TASKED', true);
                log.a('Re-tasking harasser ' + this.name + ' to ' + roomLink(target.name) + ' targeting ' + INTEL[target.name].user + ' from ' + roomLink(this.room.name), 'HARASS: ');
            } else if (this.memory.other.visited.length) {
                // If all potential targets have been visited, reset and start again
                this.memory.other.visited = [];
            } else {
                // If no target found, idle for a while before reassessing
                this.idleFor(5);
            }
        }
    } else {
        // If not in the target room, move there
        if (this.room.hostileCreeps.length && this.canIWin(50)) {
            return this.handleMilitaryCreep();  // Engage if hostile creeps are present
        }

        // Move to the target destination
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
