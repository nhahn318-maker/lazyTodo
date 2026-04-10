const { createApp } = require('./http/app');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const { server, auth } = createApp();

server.listen(port, host, () => {
  process.stdout.write(
    `lazyTodo backend listening on http://${host}:${port}\nUse Cookie: sid=${auth.demoSessionId} for authenticated task endpoints.\n`,
  );
});
