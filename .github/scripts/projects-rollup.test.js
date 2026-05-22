const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeForecastDate,
  computeRollupForNode,
  parseWeekdaysCsv,
  parseDateSetCsv,
  processRootsWithContinuation,
  parseCapacityYaml,
  getUserDayCapacity,
  scheduleAssigneeItems,
  deriveParentScheduleDates,
} = require("./projects-rollup");

function makeItem(itemId, estimate) {
  const fieldMap = new Map();
  fieldMap.set("estimate", { type: "number", value: estimate });
  return { id: itemId, _fieldMap: fieldMap };
}

test("single-item leaf rollup keeps leaf value", () => {
  const childMap = new Map([["leaf", new Set()]]);
  const itemsByItemId = new Map([["leaf", makeItem("leaf", 5)]]);

  const result = computeRollupForNode(
    "leaf",
    childMap,
    itemsByItemId,
    {
      estimateFieldId: "estimate",
      strictMode: true,
    },
    new Map(),
    new Set(),
  );

  assert.equal(result.estimateHours, 5);
  assert.equal(result.effectiveHours, 5);
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
    ["root", makeItem("root", null)],
    ["childA", makeItem("childA", 3)],
    ["childB", makeItem("childB", 4)],
  ]);

  const result = computeRollupForNode(
    "root",
    childMap,
    itemsByItemId,
    {
      estimateFieldId: "estimate",
      strictMode: true,
    },
    new Map(),
    new Set(),
  );

  assert.equal(result.estimateHours, 7);
  assert.equal(result.effectiveHours, 7);
  assert.equal(result.hasChildren, true);
  assert.equal(result.missing, false);
});

test("strict mode marks missing descendants as incomplete", () => {
  const childMap = new Map([
    ["root", new Set(["child"])],
    ["child", new Set()],
  ]);

  const itemsByItemId = new Map([
    ["root", makeItem("root", null)],
    ["child", makeItem("child", null)],
  ]);

  const result = computeRollupForNode(
    "root",
    childMap,
    itemsByItemId,
    {
      estimateFieldId: "estimate",
      strictMode: true,
    },
    new Map(),
    new Set(),
  );

  assert.equal(result.missing, true);
  assert.equal(result.estimateHours, 0);
  assert.equal(result.effectiveHours, 0);
});

test("forecast calculation skips weekends and configured holidays", () => {
  const forecast = computeForecastDate({
    hours: 12,
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

// ─── Capacity calendar tests ──────────────────────────────────────────────────

test("parseCapacityYaml parses users and non-working days", () => {
  const yaml = `
users:
  nicolas:
    monday: 6
    tuesday: 6
    wednesday: 6
    thursday: 7
    friday: 4
  alice:
    monday: 8
non_working_days:
  - "2026-05-01"
  - "2026-07-14"
`;
  const result = parseCapacityYaml(yaml);
  assert.deepEqual(result.users.nicolas, { monday: 6, tuesday: 6, wednesday: 6, thursday: 7, friday: 4 });
  assert.deepEqual(result.users.alice, { monday: 8 });
  assert.ok(result.nonWorkingDays.has("2026-05-01"));
  assert.ok(result.nonWorkingDays.has("2026-07-14"));
  assert.equal(result.nonWorkingDays.size, 2);
});

test("parseCapacityYaml handles empty non_working_days list", () => {
  const yaml = `
users:
  bob:
    monday: 4
non_working_days: []
`;
  const result = parseCapacityYaml(yaml);
  assert.ok(result.users.bob);
  assert.equal(result.nonWorkingDays.size, 0);
});

test("getUserDayCapacity returns correct hours for weekday", () => {
  const userCal = { monday: 6, tuesday: 6, wednesday: 6, thursday: 7, friday: 4 };
  // 2026-04-27 is a Monday (UTC)
  const monday = new Date("2026-04-27T00:00:00.000Z");
  assert.equal(getUserDayCapacity(userCal, monday), 6);
  // 2026-04-30 is a Thursday
  const thursday = new Date("2026-04-30T00:00:00.000Z");
  assert.equal(getUserDayCapacity(userCal, thursday), 7);
  // 2026-05-02 is a Saturday - not in calendar
  const saturday = new Date("2026-05-02T00:00:00.000Z");
  assert.equal(getUserDayCapacity(userCal, saturday), 0);
});

// ─── Scheduler tests ──────────────────────────────────────────────────────────

test("scheduleAssigneeItems: single issue fits in one day", () => {
  const userCal = { monday: 6, tuesday: 6 };
  const item = { id: "a" };
  const rollupMemo = new Map([["a", { estimateHours: 3, hasChildren: false }]]);
  // 2026-04-27 is Monday
  const anchor = new Date("2026-04-27T00:00:00.000Z");

  const schedule = scheduleAssigneeItems(userCal, [item], anchor, new Set([0, 6]), new Set(), rollupMemo);

  const result = schedule.get("a");
  assert.equal(result.startDate, "2026-04-27");
  assert.equal(result.endDate, "2026-04-27");
});

test("scheduleAssigneeItems: two issues sequential, second starts next day when first fills day", () => {
  const userCal = { monday: 6, tuesday: 6 };
  const items = [{ id: "a" }, { id: "b" }];
  const rollupMemo = new Map([
    ["a", { estimateHours: 6, hasChildren: false }],
    ["b", { estimateHours: 3, hasChildren: false }],
  ]);
  const anchor = new Date("2026-04-27T00:00:00.000Z"); // Monday

  const schedule = scheduleAssigneeItems(userCal, items, anchor, new Set([0, 6]), new Set(), rollupMemo);

  assert.equal(schedule.get("a").startDate, "2026-04-27");
  assert.equal(schedule.get("a").endDate, "2026-04-27"); // exactly fills Monday
  assert.equal(schedule.get("b").startDate, "2026-04-28"); // Tuesday
  assert.equal(schedule.get("b").endDate, "2026-04-28");
});

test("scheduleAssigneeItems: issue spans weekend", () => {
  // 2026-05-01 is Friday, capacity 4h; then Mon 2026-05-04 capacity 6h
  const userCal = { friday: 4, monday: 6 };
  const item = { id: "a" };
  const rollupMemo = new Map([["a", { estimateHours: 8, hasChildren: false }]]);
  const anchor = new Date("2026-05-01T00:00:00.000Z"); // Friday

  const schedule = scheduleAssigneeItems(userCal, [item], anchor, new Set([0, 6]), new Set(), rollupMemo);

  const result = schedule.get("a");
  assert.equal(result.startDate, "2026-05-01"); // Friday
  assert.equal(result.endDate, "2026-05-04");   // Monday (4h Fri + 4h Mon = 8h)
});

test("scheduleAssigneeItems: zero-estimate issue is same-day start and end", () => {
  const userCal = { monday: 6 };
  const item = { id: "a" };
  const rollupMemo = new Map([["a", { estimateHours: 0, hasChildren: false }]]);
  const anchor = new Date("2026-04-27T00:00:00.000Z"); // Monday

  const schedule = scheduleAssigneeItems(userCal, [item], anchor, new Set([0, 6]), new Set(), rollupMemo);

  const result = schedule.get("a");
  assert.equal(result.startDate, "2026-04-27");
  assert.equal(result.endDate, "2026-04-27");
});

test("scheduleAssigneeItems: two assignees produce independent parallel tracks", () => {
  // Alice and Bob both start Monday; their issues are scheduled independently.
  const aliceCal = { monday: 8 };
  const bobCal = { monday: 4, tuesday: 4 };
  const anchor = new Date("2026-04-27T00:00:00.000Z"); // Monday

  const aliceItems = [{ id: "alice-1" }];
  const bobItems = [{ id: "bob-1" }];
  const rollupMemo = new Map([
    ["alice-1", { estimateHours: 8, hasChildren: false }],
    ["bob-1", { estimateHours: 8, hasChildren: false }],
  ]);

  const aliceSchedule = scheduleAssigneeItems(aliceCal, aliceItems, anchor, new Set([0, 6]), new Set(), rollupMemo);
  const bobSchedule = scheduleAssigneeItems(bobCal, bobItems, anchor, new Set([0, 6]), new Set(), rollupMemo);

  // Alice finishes Monday (8h cap)
  assert.equal(aliceSchedule.get("alice-1").startDate, "2026-04-27");
  assert.equal(aliceSchedule.get("alice-1").endDate, "2026-04-27");

  // Bob finishes Tuesday (4h Mon + 4h Tue)
  assert.equal(bobSchedule.get("bob-1").startDate, "2026-04-27");
  assert.equal(bobSchedule.get("bob-1").endDate, "2026-04-28");
});

test("deriveParentScheduleDates: parent gets min start and max end of children", () => {
  const childMap = new Map([
    ["parent", new Set(["childA", "childB"])],
    ["childA", new Set()],
    ["childB", new Set()],
  ]);
  const scheduleMap = new Map([
    ["childA", { startDate: "2026-04-27", endDate: "2026-04-28" }],
    ["childB", { startDate: "2026-04-29", endDate: "2026-04-30" }],
  ]);

  deriveParentScheduleDates("parent", childMap, scheduleMap, new Set());

  const parent = scheduleMap.get("parent");
  assert.equal(parent.startDate, "2026-04-27");
  assert.equal(parent.endDate, "2026-04-30");
});

test("deriveParentScheduleDates: parent with no scheduled children gets no dates", () => {
  const childMap = new Map([
    ["parent", new Set(["child"])],
    ["child", new Set()],
  ]);
  const scheduleMap = new Map(); // child has no dates (unassigned)

  deriveParentScheduleDates("parent", childMap, scheduleMap, new Set());

  assert.equal(scheduleMap.get("parent"), undefined);
});
