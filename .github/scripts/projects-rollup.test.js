const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeForecastDate,
  computeRollupForNode,
  parseWeekdaysCsv,
  parseDateSetCsv,
  processRootsWithContinuation,
} = require("./projects-rollup");

function makeItem(itemId, estimate, remaining) {
  const fieldMap = new Map();
  fieldMap.set("estimate", { type: "number", value: estimate });
  if (remaining !== undefined) {
    fieldMap.set("remaining", { type: "number", value: remaining });
  }
  return { id: itemId, _fieldMap: fieldMap };
}

test("single-item leaf rollup keeps leaf value", () => {
  const childMap = new Map([["leaf", new Set()]]);
  const itemsByItemId = new Map([["leaf", makeItem("leaf", 5, 3)]]);

  const result = computeRollupForNode(
    "leaf",
    childMap,
    itemsByItemId,
    {
      estimateFieldId: "estimate",
      remainingHoursFieldId: "remaining",
      strictMode: true,
    },
    new Map(),
    new Set(),
  );

  assert.equal(result.estimateHours, 5);
  assert.equal(result.remainingHours, 3);
  assert.equal(result.missing, false);
  assert.equal(result.hasChildren, false);
});

test("multi-item rollup sums descendants bottom-up", () => {
  const childMap = new Map([
    ["root", new Set(["childA", "childB"])],
    ["childA", new Set()],
    ["childB", new Set()],
  ]);

  const itemsByItemId = new Map([
    ["root", makeItem("root", null, null)],
    ["childA", makeItem("childA", 3, 2)],
    ["childB", makeItem("childB", 4, 1)],
  ]);

  const result = computeRollupForNode(
    "root",
    childMap,
    itemsByItemId,
    {
      estimateFieldId: "estimate",
      remainingHoursFieldId: "remaining",
      strictMode: true,
    },
    new Map(),
    new Set(),
  );

  assert.equal(result.estimateHours, 7);
  assert.equal(result.remainingHours, 3);
  assert.equal(result.hasChildren, true);
  assert.equal(result.missing, false);
});

test("strict mode marks missing descendants as incomplete", () => {
  const childMap = new Map([
    ["root", new Set(["child"])],
    ["child", new Set()],
  ]);

  const itemsByItemId = new Map([
    ["root", makeItem("root", null, null)],
    ["child", makeItem("child", null, null)],
  ]);

  const result = computeRollupForNode(
    "root",
    childMap,
    itemsByItemId,
    {
      estimateFieldId: "estimate",
      remainingHoursFieldId: "remaining",
      strictMode: true,
    },
    new Map(),
    new Set(),
  );

  assert.equal(result.missing, true);
  assert.equal(result.estimateHours, 0);
  assert.equal(result.remainingHours, 0);
});

test("forecast calculation skips weekends and configured holidays", () => {
  const forecast = computeForecastDate({
    remainingHours: 12,
    capacityHoursPerDay: 6,
    startDate: new Date("2026-04-03T00:00:00.000Z"),
    nonWorkingWeekdays: parseWeekdaysCsv("0,6"),
    nonWorkingDateSet: parseDateSetCsv("2026-04-06"),
  });

  assert.equal(forecast, "2026-04-07");
});

test("partial-failure continuation keeps processing when fail-fast disabled", () => {
  const seen = [];
  const summary = processRootsWithContinuation(
    ["rootA", "rootB", "rootC"],
    (root) => {
      seen.push(root);
      if (root === "rootB") {
        throw new Error("simulated failure");
      }
    },
    false,
  );

  assert.deepEqual(seen, ["rootA", "rootB", "rootC"]);
  assert.equal(summary.completed, 2);
  assert.equal(summary.failed, 1);
});
