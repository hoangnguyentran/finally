import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceCell } from "./PriceCell";

describe("PriceCell", () => {
  it("renders the formatted price without flashing on first paint", () => {
    render(<PriceCell price={190.5} />);
    const cell = screen.getByTestId("price-cell");

    expect(cell).toHaveTextContent("190.50");
    expect(cell).not.toHaveClass("flash-up");
    expect(cell).not.toHaveClass("flash-down");
  });

  it("flashes green when the price ticks up", () => {
    const { rerender } = render(<PriceCell price={190.5} />);
    rerender(<PriceCell price={191.25} />);

    const cell = screen.getByTestId("price-cell");
    expect(cell).toHaveTextContent("191.25");
    expect(cell).toHaveClass("flash-up");
  });

  it("flashes red when the price ticks down", () => {
    const { rerender } = render(<PriceCell price={190.5} />);
    rerender(<PriceCell price={189.0} />);

    expect(screen.getByTestId("price-cell")).toHaveClass("flash-down");
  });

  it("does not flash when the price is unchanged", () => {
    const { rerender } = render(<PriceCell price={190.5} />);
    rerender(<PriceCell price={190.5} />);

    const cell = screen.getByTestId("price-cell");
    expect(cell).not.toHaveClass("flash-up");
    expect(cell).not.toHaveClass("flash-down");
  });

  it("restarts the animation on consecutive upticks", () => {
    const { rerender } = render(<PriceCell price={100} />);
    rerender(<PriceCell price={101} />);
    const first = screen.getByTestId("price-cell");

    rerender(<PriceCell price={102} />);
    const second = screen.getByTestId("price-cell");

    expect(second).toHaveClass("flash-up");
    // A new DOM node means the CSS animation replays rather than staying idle.
    expect(second).not.toBe(first);
  });

  it("renders a placeholder when no price has arrived", () => {
    render(<PriceCell price={null} />);
    expect(screen.getByTestId("price-cell")).toHaveTextContent("—");
  });
});
