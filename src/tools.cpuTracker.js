// Store CPU Info
let lastCreepTick = Game.time;
module.exports.creepCPU = function (minion, cpuUsed) {
    // Refresh arrays and store info
    if (lastCreepTick !== Game.time) {
        global.CREEP_ROLE_CPU = {};
        if (_.size(CREEP_ROLE_CPU_ARRAY)) {
            for (let role of Object.keys(CREEP_ROLE_CPU_ARRAY)) {
                if (!role) continue;
                CREEP_ROLE_CPU[role] = _.round(average(CREEP_ROLE_CPU_ARRAY[role]), 2);
            }
        }
        global.CREEP_ROLE_CPU_ARRAY = {};
        lastCreepTick = Game.time;
    }
    // Track individual creep cpu
    let used = Game.cpu.getUsed() - cpuUsed;
    let cpuUsageArray = CREEP_CPU_ARRAY[minion.name] || [];
    if (cpuUsageArray.length < 100) {
        cpuUsageArray.push(used)
    } else {
        cpuUsageArray.shift();
        cpuUsageArray.push(used);
        let cpuCap = 2.5;
        if (minion.memory.military) cpuCap = 4;
        if (_.round(average(cpuUsageArray), 2) > cpuCap) {
            minion.suicide();
            log.e(minion.name + ' was killed for overusing CPU in room ' + roomLink(minion.room.name));
        }
    }
    minion.room.visual.text(
        _.round(average(cpuUsageArray), 2),
        minion.pos.x,
        minion.pos.y,
        {opacity: 0.8, font: 0.4, stroke: '#000000', strokeWidth: 0.05}
    );
    // Track creep role cpu
    CREEP_CPU_ARRAY[minion.name] = cpuUsageArray;
    let cpuRoleUsageArray = CREEP_ROLE_CPU_ARRAY[minion.memory.role] || [];
    if (cpuRoleUsageArray.length < 100) {
        cpuRoleUsageArray.push(used)
    } else {
        cpuRoleUsageArray.shift();
        cpuRoleUsageArray.push(used);
    }
    CREEP_ROLE_CPU_ARRAY[minion.memory.role] = cpuUsageArray;
}