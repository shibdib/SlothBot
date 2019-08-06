/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/* USAGE:
Configure CONFIG below
At VERY top of main.js:
> const stats = require('stats')

At top of loop():
> stats.reset()

At bottom of loop():
> stats.commit()

to add a stat, just call
> stats.addSimpleStat(key,value)
or more advanced
> stats.addStat('scheduler',{ queue: 1 },{ count: 5, max: 5, min: 2, amount: 3 })

Tags (second argument) should not contain data that varies a lot, for example, don't
put stuff like object ids in tags doing so ends up causing massive performance hits
as the tag indexes get too large too quickly. Good data for tags is more static stuff
such as roomName, sectorName, etc, low overall spread.

*/
const CONFIG = {
    driver: 'Graphite', // Graphite, InfluxDB
    format: 'JSON', // Or JSON, only applies to Graphite driver
    types: ['segment'], // memory, segment, console
    key: 'stats',
    segment: 31,
    baseStats: true,
    measureMemoryParse: true,
    divider: ';',  // "\n",
    usermap: { // use module.user in console to get userID for mapping.
        '5bd347ffc58571714c03493a': 'Shibdib', // Useful for Private Servers
    }
}

class InfluxDB {
    constructor(opts = {}) {
        this.opts = Object.assign(CONFIG, opts)
        global.influxdb = this
        this.reset()
        this.startTick = Game.time
    }

    get mem() {
        Memory[this.opts.key] = Memory[this.opts.key] || {index: 0, last: 0}
        return Memory[this.opts.key]
    }

    reset() {
        if (Game.time === this.startTick) return // Don't reset on new tick
        this.stats = []
        this.cpuReset = Game.cpu.getUsed()

        if (!this.opts.measureMemoryParse) return
        let start = Game.cpu.getUsed()
        if (this.lastTime && global.LastMemory && Game.time === (this.lastTime + 1)) {
            delete global.Memory
            global.Memory = global.LastMemory
            RawMemory._parsed = global.LastMemory
            //console.log('[1] Tick has same GID!')
        } else {
            Memory // eslint-disable-line no-unused-expressions
            global.LastMemory = RawMemory._parsed
        }
        this.lastTime = Game.time
        let end = Game.cpu.getUsed()
        let el = end - start
        this.memoryParseTime = el
        this.addStat('memory', {}, {
            parse: el,
            size: RawMemory.get().length
        })
        this.endReset = Game.cpu.getUsed()
        //console.log(`[1] [Stats] Entry: ${this.cpuReset.toFixed(3)} - Exit: ${(this.endReset - this.cpuReset).toFixed(3)} - Mem: ${this.memoryParseTime.toFixed(3)} (${(RawMemory.get().length / 1024).toFixed(2)}kb)`)
    }

    addSimpleStat(name, value = 0) {
        this.addStat(name, {}, {value})
    }

    addStat(name, tags = {}, values = {}) {
        this.stats.push({name, tags, values})
    }

    addBaseStats() {
        this.addStat('time', {}, {
            tick: Game.time,
            timestamp: Date.now(),
            duration: Memory.lastDur
        });
        let lastTickProgress = Memory.lastTickProgress || 0;
        let progressPerTick = Game.gcl.progress - lastTickProgress;
        Memory.lastTickProgress = Game.gcl.progress;
        this.addStat('gcl', {}, {
            level: Game.gcl.level,
            progress: Game.gcl.progress,
            progressTotal: Game.gcl.progressTotal,
            progressPercent: (Game.gcl.progress / Game.gcl.progressTotal) * 100,
            gclTickProgress: progressPerTick,
            secondsToUpgrade: _.round((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick) * Memory.tickLength
        });
        this.addStat('market', {}, {
            credits: Game.market.credits
        });
        this.addSimpleStat('tickRate', Memory.tickLength);
        _.each(Game.rooms, room => {
            let {controller, storage, terminal} = room
            if (!controller || !controller.my) return
            this.addStat('room', {
                room: room.name
            }, {
                level: controller.level,
                progress: controller.progress,
                progressTotal: controller.progressTotal,
                progressPercent: (controller.progress / controller.progressTotal) * 100,
                secondsToUpgrade: _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickLength,
                energyAvailable: room.energyAvailable,
                energyCapacityAvailable: room.energyCapacityAvailable,
                creepCount: _.size(_.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military))
            });
            if (controller) {
                this.addStat('controller', {
                    room: room.name
                }, {
                    level: controller.level,
                    progress: controller.progress,
                    progressTotal: controller.progressTotal,
                    progressPercent: (controller.progress / controller.progressTotal) * 100
                })
            }
            if (storage) {
                this.addStat('storage', {
                    room: room.name
                }, storage.store)
            }
            if (terminal) {
                this.addStat('terminal', {
                    room: room.name
                }, terminal.store)
            }
        });
        if (typeof Game.cpu.getHeapStatistics === 'function') {
            this.addStat('heap', {}, Game.cpu.getHeapStatistics())
        }
        let used = Game.cpu.getUsed()
        this.addStat('cpu', {}, {
            bucket: Game.cpu.bucket,
            used: used,
            limit: Game.cpu.limit,
            start: this.cpuReset,
            percent: (used / Game.cpu.limit) * 100
        })
    }

    commit() {
        let usermap = this.opts.usermap
        this.shard = (Game.shard && Game.shard.name) || 'shard0'
        this.user = Game.shard.name
        let start = Game.cpu.getUsed()
        if (this.opts.baseStats) this.addBaseStats()
        let stats = `text/grafana\n`
        stats += `${Game.time}\n`
        stats += `${Math.floor(Date.now() / 1000)}\n`
        let format = this[`format${this.opts.driver}`].bind(this)
        _.each(this.stats, (v, k) => {
            stats += format(v)
        })
        let end = Game.cpu.getUsed()
        stats += format({
            name: 'stats',
            tags: {},
            values: {count: this.stats.length, size: stats.length, cpu: end - start}
        })
        if (this.opts.types.includes('segment')) {
            RawMemory.segments[this.opts.segment] = stats
        }
        if (this.opts.types.includes('memory')) {
            Memory[this.opts.key] = stats
        }
        if (this.opts.types.includes('console')) {
            console.log('STATS;' + stats.replace(/\n/g, ';'))
        }
    }

    formatInfluxDB(stat) {
        let {name, tags, values} = stat
        Object.assign(tags, {user: this.user, shard: this.shard})
        return `${name},${this.kv(tags)} ${this.kv(values)}\n`
    }

    formatGraphite(stat) {
        let {name, tags, values} = stat
        if (!this.prefix) {
            this.prefix = `${this.user}` // .${this.shard}`
        }
        let pre = [this.prefix, this.kv(tags, '.').join('.'), name].filter(v => v).join('.')
        return this.kv(values, ' ').map(v => `${pre}.${v}\n`).join('')
    }

    kv(obj, sep = '=') {
        return _.map(obj, (v, k) => `${k}${sep}${v}`)
    }
}

const driver = new InfluxDB()
module.exports = driver