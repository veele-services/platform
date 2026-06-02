module.exports = {
  apps: [
    {
      name: "veele-staging-klant",
      cwd: "/var/www/veele-staging",
      script: "pnpm",
      args: "--filter @workspace/klant-pwa run start",
      env: {
        NODE_ENV: "production",
        PORT: "3005",
      },
    },
  ],
};
