import { Color3, Vector3 } from "@babylonjs/core/Maths/math";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { KeyLightGizmo } from "./KeyLightGizmo.js";

const QUALITY_PRESETS = {
  low: {
    label: "低",
    pixelRatio: 1,
    shadowEnabled: false,
    shadowMapSize: 512,
    useCascadedShadows: false,
    rimLight: false,
    bloom: false,
    fxaa: true,
    msaa: 0,
    dof: false,
    sharpen: false,
    ssao: false,
    exposure: 1.0
  },
  medium: {
    label: "中",
    pixelRatio: 1,
    shadowEnabled: true,
    shadowMapSize: 1024,
    useCascadedShadows: false,
    rimLight: true,
    bloom: false,
    fxaa: true,
    msaa: 0,
    dof: false,
    sharpen: false,
    // PBR 時のセルフ影感を補う（_syncSsao 側で PBR+デスクトップのみ有効）
    ssao: true,
    exposure: 1.0
  },
  high: {
    label: "高",
    pixelRatio: 1.5,
    shadowEnabled: true,
    shadowMapSize: 2048,
    useCascadedShadows: true,
    rimLight: true,
    bloom: false,
    fxaa: true,
    msaa: 2,
    dof: false,
    sharpen: true,
    ssao: true,
    exposure: 1.0
  },
  ultra: {
    label: "最高",
    pixelRatio: 2,
    shadowEnabled: true,
    shadowMapSize: 2048,
    useCascadedShadows: true,
    rimLight: true,
    bloom: true,
    fxaa: true,
    msaa: 4,
    dof: false,
    sharpen: true,
    ssao: true,
    exposure: 1.0
  }
};

/** Standard(トゥーン)向けのライト強度 */
const LIGHT_LEVELS_STANDARD = {
  hemi: 0.45,
  key: 0.7,
  fill: 0.18,
  rim: 0.22
};

/**
 * PBR はエネルギー保存のため同強度だと暗く見える。
 * ただし IBL/fill/hemi が強いとシャドウマップも陰影も消えてのっぺりするため、
 * キーを強く・間接光を弱く保つ。
 */
const LIGHT_LEVELS_PBR = {
  hemi: 0.32,
  key: 2.2,
  fill: 0.1,
  rim: 0.28
};

/** マテリアルモード別の影の濃さ既定（0=無し〜1=真っ黒） */
const SHADOW_DARKNESS_STANDARD = 0.35;
const SHADOW_DARKNESS_PBR = 0.75;

/**
 * 描画（照明・影・ポストFX・IBL・品質）の中枢。
 */
export class RenderingManager {
  engine = null;
  scene = null;
  camera = null;

  hemiLight = null;
  keyLight = null;
  fillLight = null;
  rimLight = null;
  shadowGenerator = null;

  pipeline = null;
  ssaoPipeline = null;

  qualityPreset = "auto";
  resolvedQuality = "medium";
  materialMode = "standard"; // "standard" | "pbr"
  xrMode = false;

  settings = {
    shadowEnabled: true,
    shadowMapSize: 1024,
    useCascadedShadows: false,
    shadowDarkness: SHADOW_DARKNESS_STANDARD,
    bloom: false,
    bloomThreshold: 0.9,
    bloomWeight: 0.15,
    fxaa: true,
    msaa: 0,
    dof: false,
    sharpen: false,
    ssao: false,
    ibl: true,
    // 高いと影領域が IBL で埋まりセルフシャドウが見えない
    iblIntensity: 0.55,
    exposure: 1.0,
    contrast: 1.0,
    rimLight: true,
    // Directional キー（影を落とす主光）の方位・高度（度）
    keyAzimuth: 130,
    keyElevation: 55,
    keyIntensityMul: 1.0
  };

  _envTexture = null;
  _fallbackEnvTexture = null;
  _savedContrast = 1.0;
  _deviceScore = 0;
  _fpsSamples = [];
  _autoObserver = null;
  _casters = new Set();
  _keyLightGizmo = null;

  constructor(engine, scene, camera) {
    this.engine = engine;
    this.scene = scene;
    this.camera = camera;
    this._deviceScore = this._scoreDevice();
  }

  /**
   * エンジン初期化直後に呼ぶ。ライト・影・ポストFX・IBL を構築する。
   */
  initialize() {
    // MMD 互換: ambient は 0.5 が仕様。ライト過剰と重ねると白飛びするので光量は控えめに。
    this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);

    // 既存ライトを除去してから再構築
    for (const light of [...this.scene.lights]) {
      light.dispose();
    }

    // 旧構成（hemi 0.5 + dir 0.7）に近い総光量を維持しつつ、フィル/リムは弱く足す
    this.hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), this.scene);
    this.hemiLight.groundColor = new Color3(0.12, 0.12, 0.14);
    this.hemiLight.specular = new Color3(0, 0, 0);

    // キーライト（主光源・影キャスタ）— 方位/高度は settings から適用
    this.keyLight = new DirectionalLight("dirLight", new Vector3(-0.6, -1.2, 0.5), this.scene);
    // MMD は IK 等で AABB が巨大化しやすく、autoUpdateExtends だと影解像度が落ちて
    // セルフシャドウが消える。手動フラスタム + Z 自動計算で近傍精度を確保する。
    this.keyLight.shadowMinZ = 0.5;
    this.keyLight.shadowMaxZ = 60;
    this.keyLight.shadowFrustumSize = 14;
    this.keyLight.autoUpdateExtends = false;
    this.keyLight.autoCalcShadowZBounds = true;
    this.keyLight.shadowEnabled = true;
    this._keyLightGizmo = new KeyLightGizmo(this.scene);
    this._applyKeyLightDirection();

    // フィルライト（正面の白飛びを避けるため弱め）
    this.fillLight = new DirectionalLight("fillLight", new Vector3(0.8, -0.4, -0.3), this.scene);
    this.fillLight.position = new Vector3(-15, 18, 12);
    this.fillLight.specular = new Color3(0, 0, 0);
    this.fillLight.shadowEnabled = false;

    // リムライト（中品質以上）
    this.rimLight = new DirectionalLight("rimLight", new Vector3(0.2, 0.15, -1.0), this.scene);
    this.rimLight.position = new Vector3(-5, 12, 25);
    this.rimLight.shadowEnabled = false;

    this._syncLightingForMaterialMode();

    this._rebuildShadowGenerator();
    this._setupImageProcessing();
    this._ensurePipeline();
    this._loadIblAsync();

    // auto プリセット初期適用
    this.setQualityPreset(this.qualityPreset);
  }

  _scoreDevice() {
    let score = 50;
    try {
      const cores = navigator.hardwareConcurrency || 4;
      const mem = navigator.deviceMemory || 4;
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      score = Math.min(100, cores * 8 + mem * 6);
      if (isMobile) score *= 0.55;
      if (this.engine) {
        const caps = this.engine.getCaps?.();
        if (caps && !caps.textureFloat) score *= 0.7;
      }
    } catch (_) {
      // ignore
    }
    return Math.max(10, Math.min(100, score));
  }

  _resolveAutoQuality() {
    const score = this._deviceScore;
    const avgFps = this._fpsSamples.length
      ? this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length
      : 60;

    if (score < 30 || avgFps < 28) return "low";
    if (score < 50 || avgFps < 40) return "medium";
    if (score < 75 || avgFps < 52) return "high";
    return "ultra";
  }

  setQualityPreset(preset) {
    this.qualityPreset = preset || "auto";

    if (this._autoObserver) {
      this.scene.onAfterRenderObservable.remove(this._autoObserver);
      this._autoObserver = null;
    }

    if (this.qualityPreset === "auto") {
      this.resolvedQuality = this._resolveAutoQuality();
      let frameCount = 0;
      this._autoObserver = this.scene.onAfterRenderObservable.add(() => {
        frameCount++;
        if (frameCount % 30 !== 0) return;
        const fps = this.engine.getFps?.() || 60;
        this._fpsSamples.push(fps);
        if (this._fpsSamples.length > 20) this._fpsSamples.shift();
        if (frameCount % 180 === 0) {
          const next = this._resolveAutoQuality();
          if (next !== this.resolvedQuality) {
            this.resolvedQuality = next;
            this._applyPreset(QUALITY_PRESETS[next]);
          }
        }
      });
    } else {
      this.resolvedQuality = this.qualityPreset;
    }

    const cfg = QUALITY_PRESETS[this.resolvedQuality] || QUALITY_PRESETS.medium;
    this._applyPreset(cfg);
  }

  _applyPreset(cfg) {
    if (this.xrMode) {
      // XR 中は重い効果を強制OFF（後で setXrMode でも再適用）
      Object.assign(this.settings, {
        ...cfg,
        bloom: false,
        dof: false,
        sharpen: false,
        ssao: false,
        useCascadedShadows: false,
        msaa: 0
      });
    } else {
      Object.assign(this.settings, cfg);
    }

    if (this.engine && cfg.pixelRatio) {
      this.engine.setHardwareScalingLevel(1 / cfg.pixelRatio);
    }

    if (this.rimLight) {
      this.rimLight.setEnabled(!!this.settings.rimLight && !this.xrMode);
    }

    // PBR では品質プリセットによらず影を常時 ON（低品質で OFF にしない）
    const shadowOn = this.materialMode === "pbr" ? true : !!this.settings.shadowEnabled;
    this.setShadowEnabled(shadowOn);
    this.setShadowResolution(this.settings.shadowMapSize);
    this._syncPipelineFromSettings();
    this._syncLightingForMaterialMode();
    this._syncIblForMaterialMode();
    this.setExposure(this.settings.exposure);
  }

  /** Standard / PBR でライト強度・環境色・スペキュラーを切り替える */
  _syncLightingForMaterialMode() {
    const levels = this.materialMode === "pbr" ? LIGHT_LEVELS_PBR : LIGHT_LEVELS_STANDARD;
    const keyMul = typeof this.settings.keyIntensityMul === "number" ? this.settings.keyIntensityMul : 1.0;
    if (this.hemiLight) this.hemiLight.intensity = levels.hemi;
    if (this.keyLight) this.keyLight.intensity = levels.key * keyMul;
    if (this.fillLight) this.fillLight.intensity = levels.fill;
    if (this.rimLight) this.rimLight.intensity = levels.rim;

    // PBR では scene.ambientColor が拡散光に加算されるため低く抑えないとシャドウが白飛びしてコントラスト低下する
    if (this.materialMode === "pbr") {
      this.scene.ambientColor = new Color3(0.1, 0.1, 0.12);
      if (this.hemiLight) this.hemiLight.specular = new Color3(0.15, 0.15, 0.15);
    } else {
      this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);
      if (this.hemiLight) this.hemiLight.specular = new Color3(0, 0, 0);
    }
  }

  /**
   * キーライトの方位角・高度から direction / position を更新する。
   * azimuth: 0=前(+Z)から時計回り（度）、elevation: 水平面からの仰角（度）
   */
  _applyKeyLightDirection() {
    if (!this.keyLight) return;
    const az = (this.settings.keyAzimuth * Math.PI) / 180;
    const el = (this.settings.keyElevation * Math.PI) / 180;
    const cosEl = Math.cos(el);
    // 光が進む方向（光源からシーンへ）
    const dir = new Vector3(
      Math.sin(az) * cosEl,
      -Math.sin(el),
      Math.cos(az) * cosEl
    );
    dir.normalize();
    this.keyLight.direction = dir;
    // 影の原点になる光源位置（キャラ上空付近）
    const dist = 35;
    this.keyLight.position = new Vector3(-dir.x * dist, -dir.y * dist, -dir.z * dist);
    this._updateKeyLightGizmo();
  }

  setKeyLightDirection(azimuthDeg, elevationDeg) {
    if (typeof azimuthDeg === "number" && !Number.isNaN(azimuthDeg)) {
      this.settings.keyAzimuth = ((azimuthDeg % 360) + 360) % 360;
    }
    if (typeof elevationDeg === "number" && !Number.isNaN(elevationDeg)) {
      this.settings.keyElevation = Math.max(5, Math.min(89, elevationDeg));
    }
    this._applyKeyLightDirection();
  }

  setKeyIntensityMul(mul) {
    this.settings.keyIntensityMul = Math.max(0, Math.min(3, mul));
    this._syncLightingForMaterialMode();
  }

  /** Unity 風キーライト位置ギズモの表示切替 */
  setKeyLightGizmoVisible(visible) {
    if (!this._keyLightGizmo) {
      this._keyLightGizmo = new KeyLightGizmo(this.scene);
    }
    this._keyLightGizmo.setVisible(!!visible);
    if (visible) {
      this._updateKeyLightGizmo();
    }
  }

  getKeyLightGizmoVisible() {
    return !!this._keyLightGizmo?.visible;
  }

  _updateKeyLightGizmo() {
    if (!this._keyLightGizmo?.visible) return;
    // 方位・高度をそのまま渡し、特異点のない回転を組む
    this._keyLightGizmo.update(this.settings.keyAzimuth, this.settings.keyElevation);
  }

  // --- Lights / Shadows ---

  _rebuildShadowGenerator() {
    const casters = [...this._casters];
    if (this.shadowGenerator) {
      this.shadowGenerator.dispose();
      this.shadowGenerator = null;
    }
    if (!this.keyLight) return;

    const size = this.settings.shadowMapSize || 1024;
    const useCsm =
      this.settings.useCascadedShadows &&
      !this.xrMode &&
      (this.resolvedQuality === "high" || this.resolvedQuality === "ultra");

    const darkness =
      typeof this.settings.shadowDarkness === "number"
        ? this.settings.shadowDarkness
        : SHADOW_DARKNESS_STANDARD;

    if (useCsm) {
      const csm = new CascadedShadowGenerator(size, this.keyLight);
      csm.numCascades = 2;
      csm.autoCalcDepthBounds = true;
      csm.lambda = 0.85;
      csm.cascadeBlendPercentage = 0.08;
      // セルフシャドウ向け: normalBias 過大だと体の影が消える
      csm.bias = 0.0003;
      csm.normalBias = 0.003;
      csm.transparencyShadow = true;
      csm.forceBackFacesOnly = true;
      csm.usePercentageCloserFiltering = true;
      csm.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      csm.setDarkness(darkness);
      this.shadowGenerator = csm;
    } else {
      const sg = new ShadowGenerator(size, this.keyLight);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      sg.bias = 0.0003;
      sg.normalBias = 0.003;
      sg.transparencyShadow = true;
      sg.forceBackFacesOnly = true;
      sg.setDarkness(darkness);
      this.shadowGenerator = sg;
    }

    this.keyLight.shadowEnabled = !!this.settings.shadowEnabled;
    this._reapplyCasters(casters);
    this._fitShadowFrustumToCasters();
  }

  _reapplyCasters(casters = [...this._casters]) {
    if (!this.shadowGenerator || !this.settings.shadowEnabled) return;
    for (const mesh of casters) {
      if (mesh && !mesh.isDisposed?.()) {
        this._registerCasterMeshes(mesh, true);
      }
    }
  }

  setShadowEnabled(enabled) {
    // PBR では影を常時有効（UI の ON/OFF は廃止済み）
    const on = this.materialMode === "pbr" ? true : !!enabled;
    this.settings.shadowEnabled = on;
    if (this.keyLight) {
      this.keyLight.shadowEnabled = on;
    }
    if (on) {
      if (!this.shadowGenerator) {
        this._rebuildShadowGenerator();
      } else {
        // OFF→ON 時、生成器はあるがキャスタ未登録のことがあるので再適用
        this._reapplyCasters();
      }
    }
  }

  setShadowDarkness(v) {
    const next = Math.max(0, Math.min(1, Number(v)));
    if (Number.isNaN(next)) return;
    this.settings.shadowDarkness = next;
    if (this.shadowGenerator && typeof this.shadowGenerator.setDarkness === "function") {
      this.shadowGenerator.setDarkness(next);
    }
  }

  setShadowResolution(size) {
    const next = parseInt(size, 10) || 1024;
    this.settings.shadowMapSize = next;

    if (!this.shadowGenerator) {
      this._rebuildShadowGenerator();
      return;
    }

    const wantCsm =
      this.settings.useCascadedShadows &&
      !this.xrMode &&
      (this.resolvedQuality === "high" || this.resolvedQuality === "ultra");
    const isCsm = this.shadowGenerator instanceof CascadedShadowGenerator;

    if (wantCsm !== isCsm) {
      this._rebuildShadowGenerator();
      return;
    }

    const shadowMap = this.shadowGenerator.getShadowMap?.();
    if (shadowMap && typeof shadowMap.resize === "function") {
      shadowMap.resize(next);
    } else {
      this._rebuildShadowGenerator();
    }
  }

  addShadowCaster(mesh, includeDescendants = true) {
    if (!mesh) return;
    this._casters.add(mesh);
    if (!this.shadowGenerator) {
      this._rebuildShadowGenerator();
      return;
    }
    if (!this.settings.shadowEnabled) return;
    this._registerCasterMeshes(mesh, includeDescendants);
    this._fitShadowFrustumToCasters();
  }

  /**
   * キャスタ群に合わせて Directional の影フラスタムを絞る。
   * MMD の巨大 AABB を避け、セルフシャドウに十分なテクセル密度を確保する。
   */
  _fitShadowFrustumToCasters() {
    if (!this.keyLight || this.keyLight.autoUpdateExtends) return;

    let maxAxis = 6;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let any = false;

    for (const root of this._casters) {
      if (!root || root.isDisposed?.()) continue;
      const meshes = root.getChildMeshes
        ? [root, ...root.getChildMeshes(false)]
        : [root];
      for (const m of meshes) {
        if (!m || m.isDisposed?.() || !m.getBoundingInfo) continue;
        if (typeof m.getTotalVertices === "function" && m.getTotalVertices() === 0) continue;
        if (this._isFullyInvisibleCaster(m)) continue;
        try {
          m.computeWorldMatrix(true);
          const bb = m.getBoundingInfo().boundingBox;
          const size = bb.extendSizeWorld;
          // IK ターゲット等の異常に大きいバウンディングは無視
          const axis = Math.max(size.x, size.y, size.z) * 2;
          if (!(axis > 0.05) || axis > 40) continue;
          maxAxis = Math.max(maxAxis, axis);
          const min = bb.minimumWorld;
          const max = bb.maximumWorld;
          minX = Math.min(minX, min.x);
          maxX = Math.max(maxX, max.x);
          minZ = Math.min(minZ, min.z);
          maxZ = Math.max(maxZ, max.z);
          any = true;
        } catch (_) {
          // ignore
        }
      }
    }

    let frustum = Math.max(10, maxAxis * 1.35);
    if (any && Number.isFinite(minX)) {
      const spread = Math.max(maxX - minX, maxZ - minZ);
      frustum = Math.max(frustum, spread * 1.25 + 2);
    }
    this.keyLight.shadowFrustumSize = Math.min(36, frustum);
  }

  _registerCasterMeshes(mesh, includeDescendants = true) {
    if (!this.shadowGenerator) return;

    const meshes = includeDescendants && mesh.getChildMeshes
      ? [mesh, ...mesh.getChildMeshes(false)]
      : [mesh];

    for (const m of meshes) {
      if (!m || m.isDisposed?.()) continue;
      if (typeof m.getTotalVertices === "function" && m.getTotalVertices() === 0) continue;
      // 完全に見えないメッシュだけ除外。MMD は1メッシュに半透明材が混ざるため
      // 「一部でも透明 → 全体を除外」にすると影が消える。
      if (this._isFullyInvisibleCaster(m)) continue;
      this.shadowGenerator.addShadowCaster(m, false);
      m.receiveShadows = true;
    }
    mesh.receiveShadows = true;
  }

  removeShadowCaster(mesh) {
    if (!mesh) return;
    this._casters.delete(mesh);
    if (!this.shadowGenerator) return;
    this.shadowGenerator.removeShadowCaster(mesh, true);
  }

  _isFullyInvisibleCaster(mesh) {
    if (mesh.isVisible === false || mesh.visibility === 0) return true;
    const mat = mesh.material;
    if (!mat) return false;
    const mats = mat.subMaterials ? mat.subMaterials : [mat];
    if (!mats.length) return false;
    // 全マテリアルが完全透明なときだけキャスタにしない
    return mats.every((m) => m && typeof m.alpha === "number" && m.alpha <= 0.01);
  }

  enableReceiveShadows(rootMesh) {
    if (!rootMesh) return;
    const meshes = rootMesh.getChildMeshes
      ? [rootMesh, ...rootMesh.getChildMeshes(false)]
      : [rootMesh];
    for (const m of meshes) {
      m.receiveShadows = true;
    }
  }

  // --- Image processing / Exposure ---

  _setupImageProcessing() {
    const ipc = this.scene.imageProcessingConfiguration;
    if (!ipc) return;
    ipc.isEnabled = true;
    // DefaultRenderingPipeline 側で一度だけ適用し、マテリアルシェーダとの二重露出を防ぐ
    ipc.applyByPostProcess = true;
    ipc.toneMappingEnabled = true;
    ipc.toneMappingType = 1; // ACES
    ipc.exposure = this.settings.exposure;
    ipc.contrast = this.settings.contrast;
  }

  setExposure(value) {
    this.settings.exposure = value;
    const ipc = this.scene.imageProcessingConfiguration;
    if (ipc) {
      ipc.exposure = value;
      // マテリアル個別の cameraExposure は触らない（シーン IPC + ポストプロセスで一元管理）
    }
  }

  setContrast(value) {
    this.settings.contrast = value;
    if (this.scene.imageProcessingConfiguration) {
      this.scene.imageProcessingConfiguration.contrast = value;
    }
  }

  // --- Post FX ---

  _ensurePipeline() {
    if (this.pipeline) return;
    this.pipeline = new DefaultRenderingPipeline(
      "defaultPipeline",
      true,
      this.scene,
      [this.camera]
    );
    this.pipeline.bloomEnabled = false;
    this.pipeline.fxaaEnabled = true;
    this.pipeline.imageProcessingEnabled = true;
    // ポストプロセス経由の IP を有効にし、フラグメント側との二重適用を避ける
    if (this.scene.imageProcessingConfiguration) {
      this.scene.imageProcessingConfiguration.applyByPostProcess = true;
    }
    this.pipeline.sharpenEnabled = false;
    this.pipeline.depthOfFieldEnabled = false;
    // Bloom 既定を肌が滲まない高めの閾値に
    this.pipeline.bloomThreshold = this.settings.bloomThreshold;
    this.pipeline.bloomWeight = this.settings.bloomWeight;
    this._syncPipelineFromSettings();
  }

  _syncPipelineFromSettings() {
    this._ensurePipeline();
    const p = this.pipeline;
    const s = this.settings;
    const heavyOff = this.xrMode;

    p.bloomEnabled = !heavyOff && !!s.bloom;
    if (p.bloomEnabled) {
      p.bloomThreshold = s.bloomThreshold;
      p.bloomWeight = s.bloomWeight;
      p.bloomKernel = 64;
      p.bloomScale = 0.5;
    }

    p.fxaaEnabled = !!s.fxaa;
    p.samples = heavyOff ? 1 : (s.msaa || 1);

    p.sharpenEnabled = !heavyOff && !!s.sharpen;
    if (p.sharpenEnabled) {
      p.sharpen.edgeAmount = 0.2;
    }

    p.depthOfFieldEnabled = !heavyOff && !!s.dof;
    if (p.depthOfFieldEnabled) {
      p.depthOfFieldBlurLevel = 1;
      p.depthOfField.focalLength = 50;
      p.depthOfField.fStop = 2.8;
      p.depthOfField.focusDistance = 2000;
    }

    this._syncSsao(!heavyOff && !!s.ssao);
  }

  _syncSsao(enabled) {
    // medium 以上でセルフシャドウ不足を SSAO で補う（デスクトップ + PBR）
    const qualityOk =
      this.resolvedQuality === "medium" ||
      this.resolvedQuality === "high" ||
      this.resolvedQuality === "ultra";
    const allow =
      enabled &&
      this.materialMode === "pbr" &&
      qualityOk &&
      !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    if (!allow) {
      if (this.ssaoPipeline) {
        this.ssaoPipeline.dispose();
        this.ssaoPipeline = null;
      }
      return;
    }

    if (!this.ssaoPipeline) {
      this.ssaoPipeline = new SSAO2RenderingPipeline(
        "ssao",
        this.scene,
        { ssaoRatio: 0.5, blurRatio: 0.5 },
        [this.camera]
      );
      this.ssaoPipeline.radius = 2.0;
      this.ssaoPipeline.totalStrength = 0.8;
      this.ssaoPipeline.expensiveBlur = true;
      this.ssaoPipeline.samples = 8;
    }
  }

  setBloomEnabled(v) {
    this.settings.bloom = !!v;
    this._syncPipelineFromSettings();
  }

  setFxaaEnabled(v) {
    this.settings.fxaa = !!v;
    this._syncPipelineFromSettings();
  }

  setDofEnabled(v) {
    this.settings.dof = !!v;
    this._syncPipelineFromSettings();
  }

  setSharpenEnabled(v) {
    this.settings.sharpen = !!v;
    this._syncPipelineFromSettings();
  }

  setSsaoEnabled(v) {
    this.settings.ssao = !!v;
    this._syncPipelineFromSettings();
  }

  setMsaaSamples(n) {
    this.settings.msaa = n;
    this._syncPipelineFromSettings();
  }

  // --- IBL ---

  async _loadIblAsync() {
    const base = (import.meta.env?.BASE_URL || "/").replace(/\/?$/, "/");
    const candidates = [
      `${base}env/studio.env`,
      `${base}env/default.env`
    ];

    for (const url of candidates) {
      try {
        const ok = await this._urlExists(url);
        if (!ok) continue;
        if (this._envTexture) {
          this._envTexture.dispose();
        }
        this._envTexture = CubeTexture.CreateFromPrefilteredData(url, this.scene);
        this._envTexture.name = "iblEnv";
        this._syncIblForMaterialMode();
        return;
      } catch (e) {
        console.warn("[RenderingManager] IBL load failed:", url, e);
      }
    }

    // フォールバック: プログラム生成の簡易環境キューブ（PBR 時のみ使用。prefiltered ではない）
    this._fallbackEnvTexture = this._createFallbackEnvTexture();
    this._syncIblForMaterialMode();
  }

  /**
   * Standard(トゥーン)では environmentTexture を当てない。
   * PBR では必ず IBL を当てる（無いと直射光だけでは真っ暗に近い）。
   */
  _syncIblForMaterialMode() {
    const wantIbl = this.materialMode === "pbr" && !!this.settings.ibl && !this.xrMode;
    if (!wantIbl) {
      this.scene.environmentTexture = null;
      this.scene.environmentIntensity = 0;
      return;
    }
    const tex = this._envTexture || this._fallbackEnvTexture;
    if (!tex) {
      // まだロード中ならフォールバック生成を試みる
      if (!this._fallbackEnvTexture) {
        this._fallbackEnvTexture = this._createFallbackEnvTexture();
      }
    }
    const env = this._envTexture || this._fallbackEnvTexture;
    if (env) {
      this.scene.environmentTexture = env;
      // スライダー値を尊重（以前は Math.max(1.0,…) で影が潰れていた）
      // フォールバック（非 prefiltered）のみわずかにブースト
      const boost = this._envTexture ? 1.0 : 1.15;
      const intensity = typeof this.settings.iblIntensity === "number"
        ? this.settings.iblIntensity
        : 0.55;
      this.scene.environmentIntensity = Math.max(0, intensity) * boost;
    }
  }

  _urlExists(url) {
    return fetch(url, { method: "HEAD" })
      .then((r) => r.ok)
      .catch(() => false);
  }

  _createFallbackEnvTexture() {
    try {
      const size = 128;
      const faces = [];
      // PBR反射が方向性を持って見えるよう、屋内照明風のパターンを生成
      // 上面=空(青みがかった寒色)、天井=暖白色、床=暗め、側面=中間トーン
      const facePatterns = [
        // +X (右面): 暖色の壁
        { top: [140, 130, 120], bottom: [90, 85, 75] },
        // -X (左面): 暖色の壁
        { top: [140, 130, 120], bottom: [90, 85, 75] },
        // +Z (前面): 明るい窓側/天井灯
        { top: [185, 180, 170], bottom: [120, 115, 105] },
        // -Z (背面): 暗めの壁
        { top: [110, 105, 100], bottom: [65, 60, 55] },
        // +Y (天井): 暖白色の天井灯
        { top: [210, 205, 190], bottom: [180, 175, 160] },
        // -Y (床): 暗い床材
        { top: [85, 80, 75], bottom: [50, 48, 45] }
      ];
      for (let f = 0; f < 6; f++) {
        const pat = facePatterns[f];
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
          const t = y / size;
          const r = Math.round(pat.top[0] * (1 - t) + pat.bottom[0] * t);
          const g = Math.round(pat.top[1] * (1 - t) + pat.bottom[1] * t);
          const b = Math.round(pat.top[2] * (1 - t) + pat.bottom[2] * t);
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            // すこしノイズを加えて反射にディテールを出す
            const noise = (Math.random() - 0.5) * 6;
            data[i] = Math.max(0, Math.min(255, r + noise));
            data[i + 1] = Math.max(0, Math.min(255, g + noise));
            data[i + 2] = Math.max(0, Math.min(255, b + noise));
            data[i + 3] = 255;
          }
        }
        faces.push(data);
      }
      const tex = new RawCubeTexture(
        this.scene,
        faces,
        size,
        5, // TEXTUREFORMAT_RGBA
        undefined,
        true, // genMipMaps
        false
      );
      tex.name = "fallbackIbl";
      tex.coordinatesMode = Texture.SKYBOX_MODE;
      return tex;
    } catch (e) {
      console.warn("[RenderingManager] Failed to create fallback IBL", e);
      return null;
    }
  }

  setIblEnabled(enabled) {
    this.settings.ibl = !!enabled;
    if (enabled && !this._envTexture && !this._fallbackEnvTexture) {
      this._loadIblAsync();
      return;
    }
    this._syncIblForMaterialMode();
  }

  setIblIntensity(v) {
    this.settings.iblIntensity = Math.max(0, Number(v) || 0);
    this._syncIblForMaterialMode();
  }

  // --- Material mode / XR ---

  setMaterialMode(mode) {
    this.materialMode = mode === "pbr" ? "pbr" : "standard";
    if (this.materialMode === "pbr") {
      this.settings.ibl = true;
      // IBL を強くしすぎるとモデル上の影が消える。未設定時のみ控えめな既定へ
      if (!(this.settings.iblIntensity > 0)) {
        this.settings.iblIntensity = 0.55;
      }
      // ACES tone mapping のトーン圧縮を補償し、PBR で少しシャープに見せる
      this._savedContrast = this.settings.contrast;
      this.settings.contrast = Math.max(1.15, this._savedContrast + 0.2);
      this.setContrast(this.settings.contrast);
      // モード切替時は影の濃さをモード既定へ合わせる（IBL で薄くならないよう濃くする）
      this.setShadowDarkness(SHADOW_DARKNESS_PBR);
      // PBR では影を常時 ON（モデルはロード時にキャスタ登録）
      this.setShadowEnabled(true);
      this._fitShadowFrustumToCasters();
      // モデル上の接触影感を補う（モバイルでは _syncSsao 側で無効）
      if (this.resolvedQuality !== "low") {
        this.settings.ssao = true;
      }
    } else {
      if (this._savedContrast !== undefined) {
        this.settings.contrast = this._savedContrast;
        this.setContrast(this._savedContrast);
      }
      this.setShadowDarkness(SHADOW_DARKNESS_STANDARD);
    }
    this._syncLightingForMaterialMode();
    this._syncIblForMaterialMode();
    this._syncPipelineFromSettings();
  }

  setXrMode(inXr) {
    this.xrMode = !!inXr;
    if (this.xrMode) {
      // SSAO / Bloom / DoF / シャープネス / CSM を OFF
      if (this.pipeline) {
        this.pipeline.bloomEnabled = false;
        this.pipeline.depthOfFieldEnabled = false;
        this.pipeline.sharpenEnabled = false;
        this.pipeline.samples = 1;
      }
      if (this.ssaoPipeline) {
        this.ssaoPipeline.dispose();
        this.ssaoPipeline = null;
      }
      if (this.shadowGenerator instanceof CascadedShadowGenerator) {
        this.settings.useCascadedShadows = false;
        this._rebuildShadowGenerator();
      }
      if (this.rimLight) this.rimLight.setEnabled(false);
    } else {
      const cfg = QUALITY_PRESETS[this.resolvedQuality] || QUALITY_PRESETS.medium;
      this.settings.useCascadedShadows = !!cfg.useCascadedShadows;
      this._applyPreset(cfg);
      this._syncLightingForMaterialMode();
    }
  }

  /** UI / シリアライズ用スナップショット */
  getSettingsSnapshot() {
    return {
      qualityPreset: this.qualityPreset,
      resolvedQuality: this.resolvedQuality,
      materialMode: this.materialMode,
      ...this.settings
    };
  }

  applySettingsSnapshot(snap) {
    if (!snap) return;
    if (snap.materialMode) this.setMaterialMode(snap.materialMode);
    if (snap.qualityPreset) {
      this.setQualityPreset(snap.qualityPreset);
    }
    if (typeof snap.shadowEnabled === "boolean") this.setShadowEnabled(snap.shadowEnabled);
    if (snap.shadowMapSize) this.setShadowResolution(snap.shadowMapSize);
    if (typeof snap.shadowDarkness === "number") this.setShadowDarkness(snap.shadowDarkness);
    if (typeof snap.bloom === "boolean") this.setBloomEnabled(snap.bloom);
    if (typeof snap.fxaa === "boolean") this.setFxaaEnabled(snap.fxaa);
    if (typeof snap.dof === "boolean") this.setDofEnabled(snap.dof);
    if (typeof snap.sharpen === "boolean") this.setSharpenEnabled(snap.sharpen);
    if (typeof snap.ssao === "boolean") this.setSsaoEnabled(snap.ssao);
    if (typeof snap.ibl === "boolean") this.setIblEnabled(snap.ibl);
    if (typeof snap.iblIntensity === "number") this.setIblIntensity(snap.iblIntensity);
    if (typeof snap.exposure === "number") this.setExposure(snap.exposure);
    if (typeof snap.contrast === "number") this.setContrast(snap.contrast);
    if (typeof snap.keyAzimuth === "number" || typeof snap.keyElevation === "number") {
      this.setKeyLightDirection(snap.keyAzimuth, snap.keyElevation);
    }
    if (typeof snap.keyIntensityMul === "number") this.setKeyIntensityMul(snap.keyIntensityMul);
  }

  dispose() {
    if (this._autoObserver) {
      this.scene.onAfterRenderObservable.remove(this._autoObserver);
      this._autoObserver = null;
    }
    if (this._keyLightGizmo) {
      this._keyLightGizmo.dispose();
      this._keyLightGizmo = null;
    }
    if (this.ssaoPipeline) {
      this.ssaoPipeline.dispose();
      this.ssaoPipeline = null;
    }
    if (this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    if (this.shadowGenerator) {
      this.shadowGenerator.dispose();
      this.shadowGenerator = null;
    }
    if (this._envTexture) {
      this._envTexture.dispose();
      this._envTexture = null;
    }
    if (this._fallbackEnvTexture) {
      this._fallbackEnvTexture.dispose();
      this._fallbackEnvTexture = null;
    }
  }
}

export { QUALITY_PRESETS };
