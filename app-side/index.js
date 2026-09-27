import { BaseSideService } from "@zeppos/zml/base-side";

const DEFAULT_CLOUD_URL = "https://wap.tplinkcloud.com";

// ---------------------------------------------------------------------------
// config helpers
// ---------------------------------------------------------------------------
function getStore() {
  return settings.settingsStorage;
}

function getCfg(key, fallback) {
  const v = getStore().getItem(key);
  return v === undefined || v === null || v === "" ? fallback : v;
}

function loadConfig() {
  let uuid = getCfg("terminalUuid", "");
  if (!uuid) {
    uuid = "zapp-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2, 10);
    getStore().setItem("terminalUuid", uuid);
  }
  return {
    mode: getCfg("mode", "cloud"), // "cloud" | "bridge"
    email: getCfg("email", ""),
    password: getCfg("password", ""),
    alias: (getCfg("alias", "") || "").trim().toLowerCase(),
    cloudUrl: (getCfg("cloudUrl", DEFAULT_CLOUD_URL) || DEFAULT_CLOUD_URL).replace(/\/+$/, ""),
    bridgeUrl: (getCfg("bridgeUrl", "") || "").replace(/\/+$/, ""),
    token: getCfg("kasaToken", ""),
    deviceId: getCfg("kasaDeviceId", ""),
    uuid,
  };
}

async function httpJson(url, body) {
  const resp = await fetch({
    url,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const data = typeof resp.body === "string" ? JSON.parse(resp.body) : resp.body;
  return data;
}

// ---------------------------------------------------------------------------
// Kasa Cloud API (legacy tplinkcloud — works with Kasa app accounts)
// ---------------------------------------------------------------------------
async function cloudLogin(cfg) {
  const data = await httpJson(cfg.cloudUrl, {
    method: "login",
    params: {
      appType: "Kasa_Android",
      cloudUserName: cfg.email,
      cloudPassword: cfg.password,
      terminalUUID: cfg.uuid,
    },
  });
  if (data.error_code !== 0 || !data.result || !data.result.token) {
    cfg.token = "";
    getStore().removeItem("kasaToken");
    throw new Error("Kasa login failed — check email/password in settings");
  }
  cfg.token = data.result.token;
  getStore().setItem("kasaToken", cfg.token);
  return cfg.token;
}

async function cloudDeviceList(cfg) {
  const data = await httpJson(cfg.cloudUrl, {
    method: "getDeviceList",
    params: { token: cfg.token },
  });
  if (data.error_code !== 0 || !data.result || !data.result.deviceList) {
    throw new Error("Kasa device list failed: " + JSON.stringify(data.msg || data));
  }
  return data.result.deviceList;
}

async function cloudFindDeviceId(cfg) {
  const devices = await cloudDeviceList(cfg);
  if (devices.length === 0) throw new Error("No Kasa devices on this account");

  let picked = null;
  if (cfg.alias) {
    picked = devices.find(
      (d) => (d.alias || "").trim().toLowerCase() === cfg.alias
    );
    if (!picked) {
      const names = devices.map((d) => d.alias).join(", ");
      throw new Error("No device named '" + cfg.alias + "'. You have: " + names);
    }
  } else {
    // no alias configured: prefer a smartplug-like device, else first
    picked =
      devices.find((d) => /plug|switch|bulb|light/i.test(d.deviceType || d.deviceModel || "")) ||
      devices[0];
  }
  cfg.deviceId = picked.deviceId;
  getStore().setItem("kasaDeviceId", cfg.deviceId);
  getStore().setItem("kasaAliasSeen", picked.alias || "");
  return cfg.deviceId;
}

async function cloudPassthrough(cfg, commandObj, allowRetry) {
  const data = await httpJson(cfg.cloudUrl, {
    method: "passthrough",
    params: {
      deviceId: cfg.deviceId,
      token: cfg.token,
      requestData: JSON.stringify(commandObj),
    },
  });
  if (data.error_code === 0 && data.result) {
    return data.result;
  }
  // token expired?
  if (data.error_code === -20651 || data.error_code === -20675 || data.error_code === 9999) {
    if (allowRetry) {
      await cloudLogin(cfg);
      return cloudPassthrough(cfg, commandObj, false);
    }
  }
  throw new Error("Kasa passthrough failed: " + JSON.stringify(data.msg || data));
}

async function cloudCommand(cfg, commandObj) {
  if (!cfg.email || !cfg.password) {
    throw new Error("Add Kasa email + password in the Zepp app settings page");
  }
  if (!cfg.token) await cloudLogin(cfg);
  if (!cfg.deviceId) await cloudFindDeviceId(cfg);
  try {
    return await cloudPassthrough(cfg, commandObj, true);
  } catch (e) {
    // maybe deviceId went stale (device removed / account reshuffle)
    cfg.deviceId = "";
    getStore().removeItem("kasaDeviceId");
    await cloudFindDeviceId(cfg);
    return await cloudPassthrough(cfg, commandObj, true);
  }
}

function extractRelayState(result) {
  try {
    const inner = JSON.parse(result.responseData);
    const info = inner.system.get_sysinfo;
    return info.relay_state ? 1 : 0;
  } catch (e) {
    throw new Error("Could not parse light state");
  }
}

async function cloudSetState(cfg, state) {
  const result = await cloudCommand(cfg, {
    system: { set_relay_state: { state: state } },
  });
  // set_relay_state echoes the requested state on success
  if (!result.responseData) throw new Error("No response from light");
  return state;
}

async function cloudGetState(cfg) {
  const result = await cloudCommand(cfg, { system: { get_sysinfo: {} } });
  return extractRelayState(result);
}

// ---------------------------------------------------------------------------
// Local bridge mode (bridgeUrl points at a tiny http bridge on your network,
// see bridge/kasa_bridge.py in the repo)
// ---------------------------------------------------------------------------
async function bridgeFetchJson(url) {
  const resp = await fetch({ url, method: "GET" });
  const data = typeof resp.body === "string" ? JSON.parse(resp.body) : resp.body;
  return data;
}

async function bridgeSetState(cfg, state) {
  const data = await bridgeFetchJson(cfg.bridgeUrl + "/set?state=" + state);
  return data.state ? 1 : 0;
}

async function bridgeGetState(cfg) {
  const data = await bridgeFetchJson(cfg.bridgeUrl + "/status");
  return data.state ? 1 : 0;
}

// ---------------------------------------------------------------------------
// command dispatcher
// ---------------------------------------------------------------------------
async function runAction(action) {
  const cfg = loadConfig();

  if (cfg.mode === "bridge") {
    if (!cfg.bridgeUrl) throw new Error("Set the bridge URL in settings");
    if (action === "on") return { ok: true, state: await bridgeSetState(cfg, 1), mode: "bridge" };
    if (action === "off") return { ok: true, state: await bridgeSetState(cfg, 0), mode: "bridge" };
    if (action === "status") return { ok: true, state: await bridgeGetState(cfg), mode: "bridge" };
    throw new Error("Unknown action: " + action);
  }

  // cloud mode (default)
  if (action === "on") return { ok: true, state: await cloudSetState(cfg, 1), mode: "cloud" };
  if (action === "off") return { ok: true, state: await cloudSetState(cfg, 0), mode: "cloud" };
  if (action === "status") return { ok: true, state: await cloudGetState(cfg), mode: "cloud" };
  throw new Error("Unknown action: " + action);
}

AppSideService(
  BaseSideService({
    onInit() {
      console.log("zapp_switch side service onInit");
    },

    onRequest(req, res) {
      console.log("side service request:", JSON.stringify(req));
      const action = req && req.params && req.params.action;
      if (!action) {
        res(null, { ok: false, error: "missing action" });
        return;
      }
      runAction(action)
        .then((result) => res(null, result))
        .catch((err) => {
          console.error("action failed:", err);
          res(null, { ok: false, error: (err && err.message) || String(err) });
        });
    },

    onRun() {},

    onDestroy() {
      console.log("zapp_switch side service onDestroy");
    },
  })
);
