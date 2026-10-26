import { describe, it, expect } from "vitest";
import { stockStatus, formatQty } from "@/lib/inventory-logic";

describe("inventory stock status", () => {
  it("marks an item out of stock when nothing is left", () => {
    expect(stockStatus(0, 3)).toBe("out");
  });
  it("marks an item low when at or below its minimum level", () => {
    expect(stockStatus(2.5, 3)).toBe("low");
    expect(stockStatus(3, 3)).toBe("low");
  });
  it("marks an item in stock when above its minimum level", () => {
    expect(stockStatus(10, 3)).toBe("ok");
  });
});

describe("inventory quantity formatting", () => {
  it("shows whole quantities without decimals and keeps the unit", () => {
    expect(formatQty(26, "bags")).toBe("26 bags");
  });
  it("shows fractional quantities with two decimals", () => {
    expect(formatQty(2.5, "kg")).toBe("2.50 kg");
  });
});
