import { BaseApp } from "@zeppos/zml/base-app";

App(
  BaseApp({
    globalData: {},
    onCreate(options) {
      console.log("zapp_switch app onCreate");
    },
    onDestroy(options) {
      console.log("zapp_switch app onDestroy");
    },
  })
);
