/**
 * A Guide poll that never answers must throw. It must not sit until the suite watchdog.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { settleRaw } from "./settle-guide-job.ts";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The test server has no port."));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

const running = {
  status: 200,
  body: JSON.stringify({ jobId: "job-1", status: "running" }),
};

test("a poll that never answers throws instead of hanging", async () => {
  const server = http.createServer(() => undefined);
  const port = await listen(server);
  const started = Date.now();
  try {
    await assert.rejects(
      () => settleRaw(port, running, 400),
      /The Guide job did not finish\./,
    );
    assert.ok(Date.now() - started < 2_000);
  } finally {
    await close(server);
  }
});

test("a finished job poll is the settled answer", async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "done", httpStatus: 201 }));
  });
  const port = await listen(server);
  try {
    const settled = await settleRaw(port, { ...running, body: JSON.stringify({ jobId: "job-2", status: "running" }) }, 2_000);
    assert.equal(settled.status, 201);
    assert.match(settled.body, /"status":"done"/);
  } finally {
    await close(server);
  }
});
