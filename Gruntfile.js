module.exports = function (grunt) {
    // Var style - --force --host=xxx --email=xxx --pass=xxx
    let host = grunt.option('host');
    let email = grunt.option('email');
    let pass = grunt.option('pass');
    let token = grunt.option('token');
    grunt.loadNpmTasks('grunt-screeps');

    if (!token) {
        let port = 21025;
        grunt.initConfig({
            screeps: {
                options: {
                    server: {
                        host: host,
                        port: port,
                        http: true
                    },
                    email: email,
                    password: pass,
                    branch: "default",
                    ptr: false
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
                    token: token,
                    branch: "default",
                    ptr: false
                },
                dist: {
                    src: ['src/*.js']
                }
            }
        });
    }
};