module.exports = {
  apps: [
    {
      name: "driver-management",
      script: "npm",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 10000,
      listen_timeout: 10000,
      restart_delay: 1000,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "discord-worker",
      script: "node_modules/.bin/tsx",
      args: "scripts/discord-worker.ts",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 10000,
      listen_timeout: 10000,
      restart_delay: 1000,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
