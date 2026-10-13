import { describe, it, expect } from "vitest";
import { addToCart, setQuantity, cartTotal, cartCount, type MenuItem } from "@/lib/cart-logic";

const burger: MenuItem = { id: "a", name: "Burger", description: "", category: "x", price: 1100, image_url: null, is_available: true };
const soup: MenuItem = { ...burger, id: "b", name: "Soup", price: 490, is_available: false };

describe("cart", () => {
  it("does not add unavailable items", () => {
    expect(addToCart([], soup)).toEqual([]);
  });
  it("totals price x quantity automatically", () => {
    let c = addToCart([], burger);
    c = addToCart(c, burger);
    c = addToCart(c, { ...burger, id: "c", price: 300 });
    expect(cartTotal(c)).toBe(2500);
    expect(cartCount(c)).toBe(3);
  });
  it("removes a line when quantity reaches zero", () => {
    const c = setQuantity(addToCart([], burger), "a", 0);
    expect(c).toHaveLength(0);
  });
});
