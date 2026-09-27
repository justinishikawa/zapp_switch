import * as hmUI from "@zos/ui";
import { getDeviceInfo } from "@zos/device";
import { showToast } from "@zos/interaction";
import { log as Logger } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";

const logger = Logger.getLogger("zapp_switch");

const { width: W } = getDeviceInfo();

const COLOR = {
  bg: 0x0c0c0e,
  on: 0xf5b301, // kasa amber
  onPress: 0xc99400,
  off: 0x2a2a2e,
  offPress: 0x1c1c1f,
  text: 0xffffff,
  dim: 0x8a8a8f,
  accent: 0x00c853,
  danger: 0xff5252,
};

Page(
  BasePage({
    state: {
      lightState: -1, // -1 = unknown, 0 = off, 1 = on
      busy: false,
      widgets: {},
    },

    build() {
      // ---- header ----
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: px(36),
        w: W,
        h: px(40),
        text: "KASA LIGHT",
        text_size: px(28),
        color: COLOR.dim,
        align_h: hmUI.align.CENTER_H,
      });

      // ---- big toggle button (state of the light itself) ----
      const btnSize = px(280);
      this.state.widgets.toggle = hmUI.createWidget(hmUI.widget.BUTTON, {
        x: (W - btnSize) / 2,
        y: px(130),
        w: btnSize,
        h: btnSize,
        radius: btnSize / 2,
        normal_color: COLOR.off,
        press_color: COLOR.offPress,
        text: "···",
        font_size: px(52),
        color: COLOR.text,
        click_func: () => {
          this.onTogglePressed();
        },
      });

      // ---- status line under the circle ----
      this.state.widgets.status = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: px(430),
        w: W,
        h: px(36),
        text: "connecting…",
        text_size: px(26),
        color: COLOR.dim,
        align_h: hmUI.align.CENTER_H,
      });

      // ---- explicit ON / OFF buttons ----
      const half = (W - px(24) * 3) / 2;
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: px(24),
        y: px(490),
        w: half,
        h: px(72),
        radius: px(36),
        normal_color: COLOR.accent,
        press_color: 0x00a344,
        text: "ON",
        font_size: px(30),
        color: 0x0c0c0e,
        click_func: () => {
          this.sendCommand("on");
        },
      });

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: px(24) * 2 + half,
        y: px(490),
        w: half,
        h: px(72),
        radius: px(36),
        normal_color: COLOR.danger,
        press_color: 0xd32f2f,
        text: "OFF",
        font_size: px(30),
        color: 0x0c0c0e,
        click_func: () => {
          this.sendCommand("off");
        },
      });

      // ---- refresh status as soon as the page is up ----
      this.sendCommand("status");
    },

    onTogglePressed() {
      if (this.state.busy) return;
      const next = this.state.lightState === 1 ? "off" : "on";
      this.sendCommand(next);
    },

    sendCommand(action) {
      if (this.state.busy && action !== "status") return;
      this.state.busy = true;
      this.setStatus("sending…");

      this.request({
        method: "CMD",
        params: { action },
      })
        .then((data) => {
          this.state.busy = false;
          logger.log("response:", JSON.stringify(data));
          if (data && data.ok) {
            this.state.lightState = data.state;
            this.refreshUI();
            this.setStatus(this.describeMode(data.mode));
          } else {
            this.state.lightState = -1;
            this.refreshUI();
            const msg = (data && data.error) || "unknown error";
            this.setStatus("error — check settings", COLOR.danger);
            showToast({ content: String(msg).slice(0, 40) });
          }
        })
        .catch((err) => {
          this.state.busy = false;
          logger.error("request failed:", err);
          this.state.lightState = -1;
          this.refreshUI();
          this.setStatus("error — is the Zepp app nearby?", COLOR.danger);
        });
    },

    refreshUI() {
      const t = this.state.widgets.toggle;
      if (!t) return;
      const s = this.state.lightState;
      if (s === 1) {
        t.setProperty(hmUI.prop.MORE, {
          normal_color: COLOR.on,
          press_color: COLOR.onPress,
          text: "ON",
          color: 0x0c0c0e,
        });
      } else if (s === 0) {
        t.setProperty(hmUI.prop.MORE, {
          normal_color: COLOR.off,
          press_color: COLOR.offPress,
          text: "OFF",
          color: COLOR.text,
        });
      } else {
        t.setProperty(hmUI.prop.MORE, {
          normal_color: COLOR.off,
          press_color: COLOR.offPress,
          text: "···",
          color: COLOR.text,
        });
      }
    },

    setStatus(text, color) {
      const w = this.state.widgets.status;
      if (w) w.setProperty(hmUI.prop.MORE, { text, color: color || COLOR.dim });
    },

    describeMode(mode) {
      if (mode === "bridge") return "via local bridge";
      if (mode === "cloud") return "via kasa cloud";
      return "ready";
    },
  })
);
