// HTTP liveness only: never starts an agent or makes a model request.
const response = await fetch("http://127.0.0.1:3210/health", {
  headers: { Authorization: `Bearer ${process.env.ACP_BRIDGE_TOKEN}` },
  signal: AbortSignal.timeout(4000),
});
if (!response.ok) process.exit(1);
