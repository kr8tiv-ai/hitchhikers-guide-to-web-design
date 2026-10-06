/** Session stream heartbeat. Clients treat a comment line as a keep-alive. */
export const HEARTBEAT_MS = 15_000;

export interface SseSink {
  write(chunk: string): boolean;
  end(): void;
}

export interface SseHub {
  add(sink: SseSink): void;
  remove(sink: SseSink): void;
  publish(name: string, data: unknown): void;
  heartbeat(): void;
  close(): void;
}

/** One SSE frame. JSON is a single data line so a question cannot split the frame. */
export function encodeSse(name: string, data: unknown): string {
  const json = JSON.stringify(data)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `event: ${name}\ndata: ${json}\n\n`;
}

export function encodeHeartbeat(): string {
  return ": heartbeat\n\n";
}

/**
 * Fan-out for session updates. The interval is unref'd so a desk that has
 * stopped listening can exit. close() ends every sink.
 */
export function createSseHub(intervalMs: number = HEARTBEAT_MS): SseHub {
  const clients = new Set<SseSink>();

  const writeAll = (chunk: string): void => {
    for (const sink of clients) {
      if (!sink.write(chunk)) clients.delete(sink);
    }
  };

  const timer = setInterval(() => {
    writeAll(encodeHeartbeat());
  }, intervalMs);
  timer.unref();

  return {
    add(sink) {
      clients.add(sink);
    },
    remove(sink) {
      clients.delete(sink);
    },
    publish(name, data) {
      writeAll(encodeSse(name, data));
    },
    heartbeat() {
      writeAll(encodeHeartbeat());
    },
    close() {
      clearInterval(timer);
      for (const sink of clients) sink.end();
      clients.clear();
    },
  };
}
