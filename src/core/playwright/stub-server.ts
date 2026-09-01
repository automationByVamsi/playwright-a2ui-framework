import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

export async function startStubServer(port = 4173, host = "127.0.0.1"): Promise<Server> {
  const htmlPath = path.resolve(process.cwd(), "stubs/complaints-workflow/index.html");
  const html = readFileSync(htmlPath);
  const server = createServer((req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  return server;
}

const invokedDirectly = process.argv[1]?.includes("stub-server");
if (invokedDirectly) {
  const port = Number(process.env.STUB_PORT ?? 4173);
  startStubServer(port)
    .then(() => {
      process.stdout.write(`stub listening on http://127.0.0.1:${port}\n`);
    })
    .catch((err) => {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    });
}
