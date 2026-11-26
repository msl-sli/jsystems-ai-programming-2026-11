import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLeavePageGuard } from "./use-leave-page-guard";

afterEach(() => vi.restoreAllMocks());

describe("useLeavePageGuard", () => {
  it("registers beforeunload only while active (AC-39)", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { rerender } = renderHook(({ on }) => useLeavePageGuard(on), {
      initialProps: { on: false },
    });
    expect(add.mock.calls.filter(([t]) => t === "beforeunload")).toHaveLength(
      0,
    );

    rerender({ on: true });
    expect(add.mock.calls.filter(([t]) => t === "beforeunload")).toHaveLength(
      1,
    );

    rerender({ on: false });
    expect(
      remove.mock.calls.filter(([t]) => t === "beforeunload"),
    ).toHaveLength(1);
  });

  it("prevents unload while active and unregisters on unmount", () => {
    const { unmount } = renderHook(() => useLeavePageGuard(true));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect((event as BeforeUnloadEvent).returnValue).not.toBe(true);

    unmount();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
