//  ~~ logger.js ~~
/**
 * This Log class acts as a simple logging mechanism, taking advantage of how
 * the Screeps logger outputs to raw HTML. It preserves a logging level in
 * memory to keep track of what to output and what to ignore. This only needs
 * to store a single integer in memory, should be acceptable. This could also
 * be modified to trigger other events such as an automatic defense response if
 * an ALERT level logging event occurs.
 **/
class Log {

    constructor() {
        // Use the values defined here to overwrite the logging level in the
        // console if you need to. Otherwise just change the logging level in
        // your scripts around the problem area you want to debug.
        // Ex: > Memory.loggingLevel = 5 // changes to DEBUG mode
        // Ex: > Memory.loggingLevel = 3 // changes to WARN mode
        this.LOGGING_LEVEL = {
            ALERT : {name: 'ALERT', value: 1},
            ERROR : {name: 'ERROR', value: 2},
            WARN : {name: 'WARN', value: 3},
            INFO : {name: 'INFO', value: 4},
            DEBUG : {name: 'DEBUG', value: 5}
        };

        // This sets the default logging level if it's not already defined.
        // You can change this to a different default logging level.
        Memory.loggingLevel = Memory.loggingLevel || 3;
    }

    /**
     * Setter for the logging level. You can use this to change the logging
     * level to DEBUG for a specific problematic area and then change it back
     * to WARN afterwards so you only get the debug output for the area of
     * concern. Note that if you have concurrent processes, they will all be
     * affected by the logging level change.
     **/
    setLogLevel(newLevel) {
        if(this.LOGGING_LEVEL.hasOwnProperty(newLevel.name)) {
            Memory.loggingLevel = newLevel.value;
        } else {
            this.w('Attempted to set an invalid logging level, ignoring.');
        }
    }

    /**
     * Debug level log message. This will only appear when logging level is set
     * to DEBUG. Use this to print console output you would only care about when
     * trying to debug a script. For example, you could use this to print a
     * variable value throughout several important stages of a function to make
     * sure it always maintains the values that you expect.
     **/
    d(message) {
        this.cprint('DEBUG: ' + message, this.LOGGING_LEVEL.DEBUG, '#6e6770');
    }

    /**
     * Infomation level log message. This will only appear when logging level is
     * set to INFO or DEBUG. Use this to print console output that is
     * informational but might be too detailed for regular viewing or output
     * unless explicitly asked for. For example, you might use this to print out
     * the task a creep is doing when it first starts its src task.
     **/
    i(message) {
        this.cprint('INFO: ' + message, this.LOGGING_LEVEL.INFO);
    }

    /**
     * Warning level log message. This will only appear when logging level is
     * set to WARN, INFO, or DEBUG. Use this to print console output about
     * events that would be cause for concern, but might not warrant an
     * immediate response. For example, you could log a warning for if your
     * dedicate builder role creeps were out of work and just idling.
     **/
    w(message) {
        this.cprint('WARN: ' + message, this.LOGGING_LEVEL.WARN, '#f43e6d');
    }

    /**
     * Error level log message. This will only appear when logging level is set
     * to ERROR, WARN, INFO, or DEBUG. Use this to print console output about
     * current problems or things that are not working. For example, if you try
     * to automate a creeper task that has a dependency and the dependency is
     * not met, you can print an error message saying so.
     **/
    e(message) {
        this.cprint('ERROR: ' + message, this.LOGGING_LEVEL.ERROR, '#e59821');
    }

    /**
     * Alert level log message. This will appear at all logging levels. If you
     * set the logging level to ALERT, this will be the only log messages you
     * will see. Use this to log critical events that you absolutely must
     * message the console about. For example, you can use this to alert about
     * an incoming enemy attack.
     **/
    a(message) {
        this.cprint('ALERT: ' + message, this.LOGGING_LEVEL.ALERT, '#00ff07');
    }

    /**
     * This is the function that actually prints the logs. This isn't meant to
     * be used directly, but I left it open because someone might want to do
     * their own custom logging output through this. If that's not what you want
     * then leave this alone. Use the functions above this.
     **/
    cprint(message, logLevel, color = '#ffffff') {
        if(logLevel.value <= Memory.loggingLevel) {
            console.log(`<span style="color: ${color}">${message}</span>`);
        }
    }
}
module.exports = Log;