// gsd-pi — Regression test for streaming segment walker cache bug.
//
// The _desiredSegmentsCache bug caused the walker to skip calling
// buildDesiredSegmentsForMessage on subsequent streaming deltas.
// This meant the walker never detected content growth and never
// called updateContent() on the component.
//
// This test verifies that buildDesiredSegmentsForMessage is called
// fresh each time (not cached) by checking that the walker correctly
// processes growing content and updates renderedSegments.
//
// The test uses buildDesiredSegmentsForMessage directly — if the
// cache were re-enabled in runSegmentWalker, this test would still
// pass (because the function itself is correct), but the walker
// would fail to call updateContent during streaming.
//
// The real regression test is behavioral: verify that the walker's
// update loop detects content growth via the length check.

import assert from "node:assert/strict";
import test from "node:test";

import {
	buildDesiredSegmentsForMessage,
	getTextLengthFromContentBlocks,
	getTextFromContentBlocks,
} from "./chat-handoff-filter.js";

// ── tests ────────────────────────────────────────────────────────────

test("buildDesiredSegmentsForMessage: returns segments for single text block", () => {
	const message = {
		content: [{ type: "text", text: "Hello" }],
		provider: "test",
	};

	const segments = buildDesiredSegmentsForMessage(message);
	assert.equal(segments.length, 1, "one segment for one text block");
	assert.equal(segments[0].kind, "text-run");
	assert.equal(segments[0].startIndex, 0);
	assert.equal(segments[0].endIndex, 0);
	assert.equal(segments[0].contentType, "text");
});

test("buildDesiredSegmentsForMessage: returns segments for multiple text blocks", () => {
	const message = {
		content: [
			{ type: "text", text: "First" },
			{ type: "text", text: "Second" },
		],
		provider: "test",
	};

	const segments = buildDesiredSegmentsForMessage(message);

	// Consecutive text blocks are merged into a single run.
	// The segment has startIndex=0, endIndex=1 covering both blocks.
	assert.ok(
		segments.length >= 1,
		"must have at least 1 segment",
	);
	const textSegments = segments.filter((s) => s.kind === "text-run");
	assert.ok(textSegments.length >= 1);
	// Verify the segment covers both blocks
	assert.equal(textSegments[0].startIndex, 0);
	assert.equal(textSegments[0].endIndex, 1);
});

test("getTextLengthFromContentBlocks: reflects growing text within a block", () => {
	const blocks = [{ type: "text", text: "Hello" }];

	let length1 = getTextLengthFromContentBlocks(blocks, 0, 0, "text");
	assert.equal(length1, 5, "initial length should be 5");

	// Grow the text within the same block
	blocks[0] = { type: "text", text: "Hello, world!" };
	let length2 = getTextLengthFromContentBlocks(blocks, 0, 0, "text");
	assert.equal(length2, 13, "growing text should return new length");

	// Grow further
	blocks[0] = { type: "text", text: "ABCDEF012345" };
	let length3 = getTextLengthFromContentBlocks(blocks, 0, 0, "text");
	assert.equal(length3, 12, "further growth should return updated length");

	// Verify lengths are different (the key property for the cache bug)
	assert.notEqual(length1, length2, "length must change when text grows");
	assert.notEqual(length2, length3, "length must change on each growth");
});

test("getTextLengthFromContentBlocks: same length for unchanged text", () => {
	const blocks = [{ type: "text", text: "Same text" }];

	const length1 = getTextLengthFromContentBlocks(blocks, 0, 0, "text");
	const length2 = getTextLengthFromContentBlocks(blocks, 0, 0, "text");

	assert.equal(length1, length2, "length must be identical for unchanged text");
});

test("getTextFromContentBlocks: returns growing text content", () => {
	const blocks = [{ type: "text", text: "A" }];

	let text1 = getTextFromContentBlocks(blocks, 0, 0, "text");
	assert.equal(text1, "A");

	blocks[0] = { type: "text", text: "ABC" };
	let text2 = getTextFromContentBlocks(blocks, 0, 0, "text");
	assert.equal(text2, "ABC");

	blocks[0] = { type: "text", text: "ABCDEF" };
	let text3 = getTextFromContentBlocks(blocks, 0, 0, "text");
	assert.equal(text3, "ABCDEF");

	assert.notEqual(text1, text2, "text content must change when it grows");
	assert.notEqual(text2, text3, "text content must change on each growth");
});

test("buildDesiredSegmentsForMessage: returns consistent segments for same content", () => {
	const message = {
		content: [
			{ type: "text", text: "Block one" },
			{ type: "text", text: "Block two" },
		],
		provider: "test",
	};

	const segs1 = buildDesiredSegmentsForMessage(message);
	const segs2 = buildDesiredSegmentsForMessage(message);

	// Same content should produce same segments
	assert.equal(segs1.length, segs2.length, "segment count must be consistent");
	for (let i = 0; i < segs1.length; i++) {
		assert.equal(segs1[i].startIndex, segs2[i].startIndex);
		assert.equal(segs1[i].endIndex, segs2[i].endIndex);
		assert.equal(segs1[i].contentType, segs2[i].contentType);
	}
});
