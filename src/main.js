import { BabylonEngine } from "./engine/BabylonEngine";
import { MmdManager } from "./engine/MmdManager";
import { XrManager } from "./engine/XrManager";
import { UIManager } from "./ui/UIManager";
import "./style.css";

async function main() {
  const canvas = document.getElementById("renderCanvas");
  if (!canvas) {
    console.error("renderCanvas element not found");
    return;
  }

  // Babylon 初期化前にサイドバー幅を復元し、キャンバスサイズのズレを防ぐ
  try {
    const savedSidebarWidth = localStorage.getItem("webmmd-sidebar-width");
    if (savedSidebarWidth) {
      const parsed = parseInt(savedSidebarWidth, 10);
      if (!Number.isNaN(parsed) && parsed >= 200) {
        const maxWidth = Math.max(200, Math.floor(window.innerWidth * 0.5));
        const width = Math.min(maxWidth, parsed);
        document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
      }
    }
  } catch (_) {
    // localStorage 不可時はデフォルト幅のまま続行
  }

  const babylonEngine = new BabylonEngine();
  await babylonEngine.initialize(canvas);

  const mmdManager = new MmdManager(
    babylonEngine.scene,
    babylonEngine.camera,
    babylonEngine.physicsPlugin,
    babylonEngine.renderingManager
  );

  const xrManager = new XrManager(babylonEngine.scene, babylonEngine.ground);
  xrManager.mmdManager = mmdManager;
  xrManager.babylonEngine = babylonEngine;
  const vrButton = document.getElementById("overlay-vr-button");
  await xrManager.initialize(vrButton);

  const uiManager = new UIManager(babylonEngine, mmdManager, xrManager);

  if (typeof uiManager.restoreSession === "function") {
    uiManager.restoreSession();
  } else {
    uiManager.showLoading(false);
  }

  window.babylonApp = {
    engine: babylonEngine,
    mmd: mmdManager,
    xr: xrManager,
    ui: uiManager,
    rendering: babylonEngine.renderingManager
  };
}

main().catch((err) => {
  console.error("Failed to boot webmmd application:", err);
});
