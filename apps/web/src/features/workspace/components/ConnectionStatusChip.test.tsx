// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { ConnectionStatusChip } from "./ConnectionStatusChip";

afterEach(cleanup);

describe("ConnectionStatusChip", () => {
  it("shows connecting and offline states but hides a healthy connection", () => {
    const view = render(<ConnectionStatusChip status="Connecting" />);
    expect(screen.getByRole("status").textContent).toContain("Connecting");

    view.rerender(<ConnectionStatusChip status="Offline" />);
    expect(screen.getByRole("status").textContent).toContain("Offline");

    view.rerender(<ConnectionStatusChip status="Synced" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
