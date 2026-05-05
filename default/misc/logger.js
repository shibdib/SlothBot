/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

class Log {

    constructor() {
        // Define logging levels with associated names and values
        this.LOGGING_LEVEL = {
            ALERT : {name: 'ALERT', value: 1},
            ERROR : {name: 'ERROR', value: 2},
            WARN : {name: 'WARN', value: 3},
            INFO : {name: 'INFO', value: 4},
            DEBUG : {name: 'DEBUG', value: 5}
        };

        // Default logging level is WARN unless overridden in Memory
        this._desiredLoggingLevel = Memory.loggingLevel || 3;  // Default to WARN level
    }

    // Getter for DESIRED_LOGGING_LEVEL
    get desiredLoggingLevel() {
        return this._desiredLoggingLevel;
    }

    // Setter for DESIRED_LOGGING_LEVEL
    set desiredLoggingLevel(level) {
        if (Object.values(this.LOGGING_LEVEL).find(l => l.value === level)) {
            this._desiredLoggingLevel = level;
            Memory.loggingLevel = level;  // Persist logging level in memory
        } else {
            this.w('Attempted to set an invalid logging level, ignoring.');
        }
    }

    /**
     * DEBUG level log message. This will only appear when logging level is set to DEBUG.
     * Use this to print console output that is useful during debugging.
     */
    d(message) {
        this.cprint('DEBUG: ' + message, this.LOGGING_LEVEL.DEBUG, '#6e6770');
    }

    /**
     * INFO level log message. This will appear when the logging level is set to INFO or DEBUG.
     * Use for informational messages.
     */
    i(message, custom = undefined) {
        if (custom) {
            this.cprint(custom + ' ' + message, this.LOGGING_LEVEL.INFO, '#0b5ed7');
        } else {
            this.cprint('INFO: ' + message, this.LOGGING_LEVEL.INFO, '#0b5ed7');
        }
    }

    /**
     * WARN level log message. This will appear when the logging level is set to WARN, INFO, or DEBUG.
     * Use for warnings, such as minor issues or things to keep an eye on.
     */
    w(message, custom = undefined) {
        if (custom) {
            this.cprint(custom + ' ' + message, this.LOGGING_LEVEL.WARN, '#f43e6d');
        } else {
            this.cprint('WARN: ' + message, this.LOGGING_LEVEL.WARN, '#f43e6d');
        }
    }

    /**
     * ERROR level log message. This will appear when logging level is set to ERROR, WARN, INFO, or DEBUG.
     * Use for issues that need immediate attention.
     */
    e(message, custom = undefined) {
        if (custom) {
            this.cprint(custom + ' ' + message, this.LOGGING_LEVEL.ERROR, '#e59821');
        } else {
            this.cprint('ERROR: ' + message, this.LOGGING_LEVEL.ERROR, '#e59821');
            if (!Memory.errorLogs) Memory.errorLogs = [];
            Memory.errorLogs.push(message);
        }
    }

    /**
     * ALERT level log message. This will appear at all logging levels.
     * Use this for critical messages that should be noticed immediately.
     */
    a(message, custom = undefined) {
        if (custom) {
            this.cprint(custom + ' ' + message, this.LOGGING_LEVEL.ALERT, '#00ff07');
        } else {
            this.cprint('ALERT: ' + message, this.LOGGING_LEVEL.ALERT, '#00ff07');
        }
    }

    /**
     * Core function to print log messages. Checks logging level and prints with color.
     */
    cprint(message, logLevel, color = '#ffffff') {
        if (logLevel.value <= this.desiredLoggingLevel) {
            // For all logs, ensure they print the message without the `%c` format
            if (logLevel === this.LOGGING_LEVEL.DEBUG) {
                console.debug(message);  // Use console.debug for DEBUG logs
            } else {
                console.logUnsafe(message);  // Use console.log for other logs
                if (logLevel === this.LOGGING_LEVEL.ERROR) Game.notify(message, 0)
            }
        }
    }
}

module.exports = Log;