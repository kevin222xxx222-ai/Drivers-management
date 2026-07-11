module.exports = {
  apps: [
    {
      name: "driver-management",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "discord-worker",
      script: "node_modules/.bin/tsx",
      args: "scripts/discord-worker.ts",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
