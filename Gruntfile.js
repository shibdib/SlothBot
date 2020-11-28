module.exports = function (grunt) {
    let config = require('./.screeps.json');
    let host = grunt.option('host');
    let options = config[host];

    grunt.loadNpmTasks('grunt-screeps');

    if (host !== 'mmo' && !options.token) {
        let port = 21025;
        if (options.port) port = options.port;
        grunt.initConfig({
            screeps: {
                options: {
                    server: {
                        host: options.host,
                        port: port,
                        http: true
                    },
                    email: options.email,
                    password: options.password,
                    branch: options.branch,
                    ptr: options.ptr
                },
                dist: {
                    src: ['src/*.js']
                }
            }
        });
    } else {
        grunt.initConfig({
            screeps: {
                options: {
                    token: options.token,
                    branch: options.branch,
                    ptr: options.ptr,
                    season: options.season
                },
                dist: {
                    src: ['src/*.js']
                }
            }
        });
    }
};