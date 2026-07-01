import "./style.css";
import { BabylonEngine } from "./engine/BabylonEngine";
import { MmdManager } from "./engine/MmdManager";
import { XrManager } from "./engine/XrManager";
import { UIManager } from "./ui/UIManager";
import { TextureAlphaChecker } from "babylon-mmd";

// Babylon.js v7.54+ の LOD Map 対応のための TextureAlphaChecker モンキーパッチ
if (TextureAlphaChecker && TextureAlphaChecker.prototype) {
  const originalTextureHasAlphaOnGeometry = TextureAlphaChecker.prototype.textureHasAlphaOnGeometry;
  if (originalTextureHasAlphaOnGeometry) {
    TextureAlphaChecker.prototype.textureHasAlphaOnGeometry = async function (texture, mesh, alphaThreshold, alphaBlendThreshold) {
      const info = mesh._internalAbstractMeshDataInfo;
      if (info && info._currentLOD && typeof info._currentLOD.get === "function") {
        const originalLOD = info._currentLOD;
        const dummyLOD = {
          get: () => mesh,
          set: () => {}
        };
        Object.defineProperty(info, "_currentLOD", {
          get: () => dummyLOD,
          set: () => {},
          configurable: true
        });
        try {
          return await originalTextureHasAlphaOnGeometry.call(this, texture, mesh, alphaThreshold, alphaBlendThreshold);
        } finally {
          delete info._currentLOD;
          info._currentLOD = originalLOD;
        }
      } else {
        return await originalTextureHasAlphaOnGeometry.call(this, texture, mesh, alphaThreshold, alphaBlendThreshold);
      }
    };
  }
}


async function main() {
  const canvas = document.getElementById("renderCanvas");
  if (!canvas) {
    console.error("renderCanvas element not found");
    return;
  }

  // 1. Babylon.js エンジン・物理の初期化
  const babylonEngine = new BabylonEngine();
  await babylonEngine.initialize(canvas);

  // 2. MMDモデル・モーション管理クラスの初期化
  const mmdManager = new MmdManager(
    babylonEngine.scene,
    babylonEngine.camera,
    babylonEngine.physicsPlugin
  );

  // 3. WebXR (VR) 管理クラスの初期化
  const xrManager = new XrManager(babylonEngine.scene, babylonEngine.ground);
  const vrButton = document.getElementById("overlay-vr-button");
  await xrManager.initialize(vrButton);

  // 4. UIコントロールのバインディング
  const uiManager = new UIManager(babylonEngine, mmdManager, xrManager);
  
  // キャッシュによる新旧スクリプト混在時のエラー対策
  if (typeof uiManager.restoreSession === "function") {
    uiManager.restoreSession();
  } else {
    uiManager.showLoading(false);
  }

  // グローバルにバインドしてデバッグなどを容易にする
  window.babylonApp = {
    engine: babylonEngine,
    mmd: mmdManager,
    xr: xrManager,
    ui: uiManager
  };
}

// アプリケーション起動
main().catch((err) => {
  console.error("Failed to boot webmmd application:", err);
});
