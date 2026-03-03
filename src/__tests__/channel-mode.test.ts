import { describe, it, expect } from "vitest";
import { createChannelModeController } from "../channel-mode.js";
import { createChannelModeStore } from "../channel-store.js";

describe("createChannelModeController", () => {
  describe("on command", () => {
    it("activates always-on mode and returns confirmation", () => {
      // Given: a controller with a fresh store
      const store = createChannelModeStore();
      const controller = createChannelModeController({ store });

      // When: handling 'on' command
      const response = controller.handleCommand("on", "channel-1");

      // Then: store is activated and confirmation message returned
      expect(store.isAlwaysOn("channel-1")).toBe(true);
      expect(response).toContain("常時応答モード");
      expect(response).toContain("設定しました");
    });
  });

  describe("off command", () => {
    it("deactivates always-on mode and returns confirmation", () => {
      // Given: a controller with channel-1 active
      const store = createChannelModeStore();
      store.setAlwaysOn("channel-1", true);
      const controller = createChannelModeController({ store });

      // When: handling 'off' command
      const response = controller.handleCommand("off", "channel-1");

      // Then: store is deactivated and confirmation message returned
      expect(store.isAlwaysOn("channel-1")).toBe(false);
      expect(response).toContain("解除しました");
    });
  });

  describe("status command", () => {
    it("returns ON when channel is always-on", () => {
      // Given: a controller with channel-1 active
      const store = createChannelModeStore();
      store.setAlwaysOn("channel-1", true);
      const controller = createChannelModeController({ store });

      // When: handling 'status' command
      const response = controller.handleCommand("status", "channel-1");

      // Then: response shows ON
      expect(response).toContain("ON");
    });

    it("returns OFF when channel is not always-on", () => {
      // Given: a controller with channel-1 inactive
      const store = createChannelModeStore();
      const controller = createChannelModeController({ store });

      // When: handling 'status' command
      const response = controller.handleCommand("status", "channel-1");

      // Then: response shows OFF
      expect(response).toContain("OFF");
    });
  });

  describe("help command", () => {
    it("returns help text for 'help' subcommand", () => {
      // Given: a controller
      const store = createChannelModeStore();
      const controller = createChannelModeController({ store });

      // When: handling 'help' command
      const response = controller.handleCommand("help", "channel-1");

      // Then: help text is returned
      expect(response).toContain("!channel on");
      expect(response).toContain("!channel off");
    });

    it("returns help text for empty args", () => {
      // Given: a controller
      const store = createChannelModeStore();
      const controller = createChannelModeController({ store });

      // When: handling empty args
      const response = controller.handleCommand("", "channel-1");

      // Then: help text is returned
      expect(response).toContain("!channel on");
    });
  });

  describe("unknown command", () => {
    it("returns error message with help text for unknown subcommand", () => {
      // Given: a controller
      const store = createChannelModeStore();
      const controller = createChannelModeController({ store });

      // When: handling unknown command
      const response = controller.handleCommand("unknown-cmd", "channel-1");

      // Then: error message with help text
      expect(response).toContain("不明なサブコマンドです");
      expect(response).toContain("unknown-cmd");
      expect(response).toContain("!channel on");
    });
  });
});
