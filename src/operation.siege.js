let highCommand = require('military.highCommand');

Creep.prototype.siegeRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name === this.memory.targetRoom) highCommand.operationSustainability(this.room);
        if (this.memory.role === 'deconstructor' || this.memory.role === 'siegeEngine') {
            return this.siege();
        } else if (this.memory.role === 'longbow') {
            return this.handleMilitaryCreep();
        } else if (this.memory.role === 'attacker') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'healer' || this.memory.role === 'siegeHealer') {
            this.siegeHeal();
        }
    }
};