module.exports = {
  apps: [
    {
      name: "veele-personeel",
      cwd: "/var/www/veele",
      script: "pnpm",
      args: "--filter @workspace/personeel-pwa run start",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
    },
  ],
};
