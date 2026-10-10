import assert from "node:assert/strict";
import { X509Certificate, randomBytes } from "node:crypto";
import { createSecureContext } from "node:tls";
import { test } from "node:test";
import { derInt, derLen, localCertificate } from "../src/playwright-opener.ts";

function integerContent(encoded: Buffer): Buffer {
  assert.equal(encoded[0], 0x02);
  const lengthByte = encoded[1];
  assert.ok(lengthByte !== undefined && lengthByte < 0x80);
  assert.equal(encoded.length, lengthByte + 2);
  return encoded.subarray(2);
}

function assertMinimal(content: Buffer): void {
  assert.ok(content.length >= 1 && content.length <= 20);
  const lead = content[0];
  assert.ok(lead !== undefined && lead < 0x80);
  if (content.length === 1) return;
  const next = content[1];
  assert.ok(next !== undefined);
  const neg = lead & 0x80;
  const pad = lead === (neg === 0 ? 0x00 : 0xff);
  assert.equal(pad && neg === (next & 0x80), false);
}

function derFromPem(pemText: string): Buffer {
  const body = pemText
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

function readTlv(der: Buffer, offset: number): { tag: number; content: Buffer; next: number } {
  const tag = der[offset];
  assert.ok(tag !== undefined, "missing tag");
  let cursor = offset + 1;
  const first = der[cursor];
  assert.ok(first !== undefined, "missing length");
  cursor += 1;
  let length = 0;
  if (first < 0x80) {
    length = first;
  } else {
    const count = first & 0x7f;
    assert.ok(count >= 1 && count <= 3, `bad length form ${first.toString(16)}`);
    for (let index = 0; index < count; index += 1) {
      const byte = der[cursor + index];
      assert.ok(byte !== undefined, "truncated length");
      length = length * 256 + byte;
    }
    const lead = der[cursor];
    assert.notEqual(lead, 0);
    if (count === 1) assert.ok(length >= 0x80);
    if (count === 2) assert.ok(length >= 0x100);
    if (count === 3) assert.ok(length >= 0x10000);
    cursor += count;
  }
  const content = der.subarray(cursor, cursor + length);
  assert.equal(content.length, length);
  return { tag, content, next: cursor + length };
}

function walkLengths(der: Buffer): void {
  const visit = (view: Buffer): void => {
    let offset = 0;
    while (offset < view.length) {
      const part = readTlv(view, offset);
      if ((part.tag & 0x20) !== 0) visit(part.content);
      offset = part.next;
    }
  };
  visit(der);
}

function assertFixtureCert(pemText: string): X509Certificate {
  createSecureContext({ cert: pemText });
  const der = derFromPem(pemText);
  assert.equal(der[0], 0x30);
  assert.equal(der[1], 0x82);
  walkLengths(der);
  const outer = readTlv(der, 0);
  assert.equal(outer.next, der.length);
  let cursor = 0;
  const tbs = readTlv(outer.content, cursor);
  assert.equal(tbs.tag, 0x30);
  cursor = tbs.next;
  const algorithm = readTlv(outer.content, cursor);
  assert.equal(algorithm.tag, 0x30);
  cursor = algorithm.next;
  const signature = readTlv(outer.content, cursor);
  assert.equal(signature.tag, 0x03);
  assert.equal(signature.content[0], 0);
  assert.equal(signature.content.length, 257);
  assert.equal(signature.next, outer.content.length);

  const parsed = new X509Certificate(pemText);
  const san = parsed.subjectAltName;
  assert.ok(san);
  assert.match(san, /DNS:localhost/);
  assert.match(san, /127\.0\.0\.1/);
  assert.equal(parsed.checkHost("localhost"), "localhost");
  assert.equal(parsed.checkIP("127.0.0.1"), "127.0.0.1");
  assert.match(parsed.subject, /localhost/);
  const from = Date.parse(parsed.validFrom);
  const until = Date.parse(parsed.validTo);
  assert.ok(Number.isFinite(from) && from <= Date.now());
  assert.ok(Number.isFinite(until) && until > Date.now());
  const serial = serialBytes(parsed.serialNumber);
  assert.ok(serial.length >= 1 && serial.length <= 20);
  return parsed;
}

function serialBytes(serialNumber: string): Buffer {
  const hex = serialNumber.replaceAll(":", "");
  const padded = hex.length % 2 === 0 ? hex : `0${hex}`;
  return Buffer.from(padded, "hex");
}

test("derLen uses minimal short and long forms", () => {
  assert.equal(derLen(0).toString("hex"), "00");
  assert.equal(derLen(127).toString("hex"), "7f");
  assert.equal(derLen(128).toString("hex"), "8180");
  assert.equal(derLen(255).toString("hex"), "81ff");
  assert.equal(derLen(256).toString("hex"), "820100");
  assert.equal(derLen(65535).toString("hex"), "82ffff");
  assert.equal(derLen(65536).toString("hex"), "83010000");
});

test("derInt emits a minimal non-negative INTEGER for the bad serial shapes", () => {
  const cases: ReadonlyArray<readonly [Buffer, string]> = [
    [Buffer.from([0x00, 0x01]), "01"],
    [Buffer.from([0x00, 0x7f]), "7f"],
    [Buffer.from([0x00, 0x7f, 0x00]), "7f00"],
    [Buffer.from([0xff, 0x80]), "00ff80"],
    [Buffer.from([0xff, 0x80, 0x01]), "00ff8001"],
    [Buffer.from([0xff, 0xff, 0x80]), "00ffff80"],
    [Buffer.from([0x80]), "0080"],
    [Buffer.from([0xff]), "00ff"],
    [Buffer.alloc(8), "00"],
    [Buffer.alloc(0), "00"],
    [Buffer.from([0x00]), "00"],
    [Buffer.from([0x00, 0x00, 0x80]), "0080"],
    [Buffer.from([0x00, 0x00, 0x00, 0x01]), "01"],
    [Buffer.from([0x7f]), "7f"],
    [Buffer.from([0x01, 0x00]), "0100"],
  ];
  for (const [input, expected] of cases) {
    const body = integerContent(derInt(input));
    assert.equal(body.toString("hex"), expected);
    assertMinimal(body);
  }
  for (let index = 0; index < 5000; index += 1) {
    assertMinimal(integerContent(derInt(randomBytes(8))));
  }
});

test("bad serial shapes still mint a certificate for localhost and 127.0.0.1", () => {
  const shapes: ReadonlyArray<readonly [Buffer, string]> = [
    [Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]), "01020304050607"],
    [Buffer.from([0xff, 0x80, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66]), "ff80112233445566"],
    [Buffer.from([0x80, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70]), "8010203040506070"],
    [Buffer.alloc(8), "0"],
    [Buffer.alloc(0), "0"],
  ];
  for (const [serial, expected] of shapes) {
    const made = localCertificate(serial);
    createSecureContext({ key: made.key, cert: made.cert });
    const parsed = assertFixtureCert(made.cert);
    assert.equal(parsed.serialNumber.toLowerCase(), expected);
  }
});

test("localCertificate is accepted on every call", { timeout: 180_000 }, () => {
  for (let index = 0; index < 500; index += 1) {
    const made = localCertificate();
    createSecureContext({ key: made.key, cert: made.cert });
    const parsed = assertFixtureCert(made.cert);
    const serial = serialBytes(parsed.serialNumber);
    const lead = serial[0];
    assert.equal(serial.length, 8);
    assert.ok(lead !== undefined && lead >= 0x01 && lead <= 0x7f);
  }
});
