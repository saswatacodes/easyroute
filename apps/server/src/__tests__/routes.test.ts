import { describe, it, expect, mock } from "bun:test";

let queryResults: any[] = [];

const chain = {
  from: () => chain,
  where: () => chain,
  orderBy: () => chain,
  offset: () => chain,
  limit: () => Promise.resolve(queryResults),
  then: (onFulfilled: any) => Promise.resolve(queryResults).then(onFulfilled),
};

mock.module("@/db", () => ({
  db: {
    select: () => chain,
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

const { default: app } = await import("@/index");

describe("GET /routes", () => {
  it("returns paginated route list with count", async () => {
    queryResults = [
      { id: 1, name: "Route A", startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }, isActive: true, count: 2 },
      { id: 2, name: "Route B", startPoint: { x: 2, y: 2 }, endPoint: { x: 3, y: 3 }, isActive: true, count: 2 },
    ];

    const res = await app.request("/routes");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.limit).toBe(20);
    expect(res.headers.get("Cache-Control")).toBe("max-age=300");
  });
});

describe("GET /routes/:id/stops", () => {
  it("returns ordered stops for a route", async () => {
    queryResults = [
      { id: 1, name: "Stop 1", location: { x: 0, y: 0 }, sequence: 1 },
      { id: 2, name: "Stop 2", location: { x: 1, y: 1 }, sequence: 2 },
    ];

    const res = await app.request("/routes/1/stops");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].sequence).toBe(1);
    expect(body[1].sequence).toBe(2);
  });
});
