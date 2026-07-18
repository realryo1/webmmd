# レンダラ周りの仕様

Babylon.js 描画基盤、MMD 表示、WebXR、および UI から触れる描画設定の仕様まとめ。
実装の正は `src/engine/` および関連ソース。本ドキュメントは現状コードの整理である。

---

## 1. 全体構成

**スタック:** `@babylonjs/core` / `@babylonjs/havok` / `@babylonjs/materials` / `babylon-mmd` / Vite + PWA

### 起動フロー

```
index.html (#renderCanvas)
  └─ src/main.js
       ├─ TextureAlphaChecker モンキーパッチ（Babylon LOD Map 対策）
       ├─ BabylonEngine.initialize(canvas)
       ├─ MmdManager(scene, camera, physicsPlugin)
       ├─ XrManager(scene, ground).initialize(#overlay-vr-button)
       └─ UIManager(engine, mmd, xr).restoreSession()
```

| クラス | ファイル | 役割 |
|---|---|---|
| `BabylonEngine` | `src/engine/BabylonEngine.js` | Engine / Scene / Camera / Lights / Shadow / Ground / Havok / FPS 制限 / リサイズ / 背景 |
| `MmdManager` | `src/engine/MmdManager.js` | PMX / VMD ロード、`MmdRuntime`、物理最適化、音声同期、モーフ |
| `XrManager` | `src/engine/XrManager.js` | WebXR 入退場、スケール、パススルー、スティック移動 |
| `UIManager` | `src/ui/UIManager.js` | DOM バインドと描画設定のエンジン同期 |

---

## 2. BabylonEngine

### 2.1 初期化パラメータ

| 項目 | 値 |
|---|---|
| Engine オプション | `preserveDrawingBuffer: true`, `stencil: true` |
| `scene.clearColor` | `Color4(0.04, 0.07, 0.09, 1.0)`（≈ `#0b1118`） |
| Havok | WASM を Vite `?url` で同梱（CDN 不使用） |
| `HavokPlugin` | `useDeltaForWorldStep = false` |
| 重力初期値 | `(0, -9.8 * 12.5, 0)`（MMD スケール 12.5 倍） |
| 物理タイムステップ | `1/60` 秒固定 |
| Camera | `ArcRotateCamera` — α=`-π/2`, β=`π/2-0.1`, radius=`30`, target=`(0,10,0)` |
| Camera 制限 | `wheelPrecision=15`, `pinchPrecision=200`, radius `1`〜`200` |
| HemisphericLight | intensity `0.5` |
| DirectionalLight | dir `(-1,-2,1)`, pos `(10,30,-10)`, intensity `0.7` |
| ShadowGenerator | size `1024`, Blur Exponential + Kernel Blur (`blurKernel=32`) |
| Ground | `100×100`, `receiveShadows=true` |

### 2.2 床マテリアル

| モード | マテリアル | 備考 |
|---|---|---|
| `grid`（初期） | `GridMaterial` | majorUnitFrequency=`5`, opacity=`0.8` |
| `solid` | `StandardMaterial` | diffuse は背景色と連動、specular 黒 |

### 2.3 公開 API

| メソッド | 挙動 |
|---|---|
| `setFpsLimit(limit)` | `customAnimationFrameRequester` で間引き。`null` で解除 |
| `setGravity(magnitude)` | `(0, -magnitude * 12.5, 0)` |
| `setBackgroundColor(hex)` | `clearColor` と solid 床色を更新（α=1） |
| `setBackgroundMode("grid"\|"solid")` | 床マテリアル切替 |
| `setShadowEnabled(bool)` | `dirLight.shadowEnabled` |
| `setShadowResolution(size)` | shadowMap の resize |
| `setPixelRatio(ratio)` | `setHardwareScalingLevel(1/ratio)` |
| `restoreAfterXr()` | XR 終了後のカメラ・FPS requester・`engine.resize()` 復元 |
| `togglePhysicsViewer()` | `P` キー。Havok `PhysicsViewer` の表示切替 |
| `dispose()` | リスナー解除 + engine dispose |

### 2.4 リサイズ

- `window.resize` → `engine.resize()`
- フルスクリーン切替（標準 / webkit）→ `requestAnimationFrame` 後に `resize()`

---

## 3. 描画ループと計測

```
engine.runRenderLoop(() => scene.render())

onBeforeRenderObservable      → update 計測開始
onBeforeDrawPhaseObservable  → updateTime 確定 / draw 計測開始
onAfterRenderObservable      → drawTime 確定
```

| 指標 | 取得元 |
|---|---|
| FPS | `engine.getFps()`（なければ自前） |
| Update / Draw | `babylonEngine.updateTime` / `drawTime`（ms） |
| MEM | `performance.memory.usedJSHeapSize`（Chrome 系のみ） |

リソースモニタは `UIManager.startResourceMonitor` が約 1 秒間隔でオーバーレイ更新する。

**その他の毎フレーム処理:**

- `MmdManager` — ループ再生・音声同期
- `XrManager.updateXrMovement()` — `IN_XR` 時のみ

---

## 4. WebXR（XrManager）

### 4.1 初期化

```javascript
scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground],
  uiOptions: { disableDefaultUI: true },
  disableTeleportation: true,
  optionalFeatures: ["xr-legacy-passthrough", "background-removal"]
})
```

UI は `#overlay-vr-button`。非対応環境ではボタンを disabled にする。

### 4.2 入退場

| 状態 | 処理 |
|---|---|
| **Enter (`IN_XR`)** | `_saveDesktopState()`（カメラ α/β/radius/target、clearColor、ground）→ `worldScalingFactor = 12.5` → パススルー適用 |
| **Exit (`NOT_IN_XR`)** | `worldScalingFactor = 1.0` → `_restoreDesktopState()` |

| セッション | 条件 |
|---|---|
| `immersive-ar` | パススルー ON |
| `immersive-vr` | パススルー OFF |
| referenceSpace | `"local-floor"` |

### 4.3 退出時復元（`_restoreDesktopState`）

1. clearColor を保存値で α=1 強制復元（なければ UI 色 or `#0b1118`）
2. ground の enabled 復元
3. ArcRotateCamera の α/β/radius/target 復元（Babylon が XR カメラ位置で上書きするのを打ち消す）
4. `babylonEngine.restoreAfterXr()`（activeCamera / FPS requester / resize）

### 4.4 移動定数

| 定数 | 値 |
|---|---|
| `moveSpeed` | `0.03`（× `worldScalingFactor`） |
| `verticalSpeed` | `0.015`（同上） |
| ヨー回転 | `0.03` rad/frame |
| デッドゾーン | スティック絶対値 `> 0.1` |

| 操作 | 内容 |
|---|---|
| 左スティック | 水平移動 |
| X / Y ボタン | 下降 / 上昇 |
| 右スティック X | ヨー回転 |

パススルーは `WebXRFeatureName.XR_LEGACY_PASSTHROUGH`。状態は `localStorage["vr-passthrough-enabled"]`。

---

## 5. MMD（MmdManager）

### 5.1 ランタイム

- `MmdPhysics(scene)` + `MmdRuntime(scene, mmdPhysics)` → `register(scene)`
- アセット解決: `fileMap`（相対パス → Blob URL）+ `FileTools.PreprocessUrl`
- 欠損テクスチャ: 1×1 透明 PNG のダミー Blob URL

### 5.2 モデルロード `loadModel`

1. `SceneLoader.ImportMeshAsync`（`.pmx`）
2. 初期位置 X = `deployedModels.size * 6.0`
3. `dirLight` の ShadowGenerator に `addShadowCaster`
4. 物理メタデータ最適化（つま先 IK、体幹 FollowBone など）
5. `createMmdModel` → rest pose → `initializePhysics`
6. ID: `"model_" + counter`

### 5.3 モーション / カメラ

| API | 内容 |
|---|---|
| `loadMotion` | VMD 適用、同名 `.wav`/`.mp3` を `Audio` で紐付け（`loop=true`） |
| `loadCameraMotion` | `mmdRuntime.camera` にランタイムアニメーション設定 |
| `play` / `pause` / `reset` / `setLoopEnabled` | 再生制御 |
| `setModelPosition` / `setModelRotation` / `setModelShadowEnabled` | モデル単位設定 |
| `getMorphTargets` / `setMorphValue` | モーフ |

### 5.4 音声同期しきい値

| 条件 | 動作 |
|---|---|
| `\|diff\| > 2.0` | 強制シーク |
| `diff > 0.05` | `playbackRate = 1.02` |
| `diff < -0.05` | `playbackRate = 0.98` |
| `\|diff\| ≤ 0.02` | `1.0` |
| `readyState < 2` | 同期スキップ |

### 5.5 物理まわり

| API | 内容 |
|---|---|
| `updateBreastPhysicsSettings(enabled, fps, inertia)` | 胸物理。`shakeFactor = inertia * (60/fps)`。衝突マスクは常に 0 |
| `setPhysicsDisableGlobally` | `mmdPhysics` / 各モデルの物理 OFF、`setTimeStep(0)` または `1/60` |

---

## 6. Canvas / ビューア UI

| 要素 | 内容 |
|---|---|
| Canvas | `#renderCanvas`（`width/height: 100%`, `touch-action: none`） |
| レイアウト | `#app` > `.app-shell`（sidebar 280px + `.viewer`） |
| テーマ色 | `#0b1118`（meta / PWA / 背景デフォルト） |
| Vite base | `/webmmd/` |

ビューア周辺:

- `.viewer-loading` — ロード表示
- `.viewer-overlay` — フルスクリーン / 再生 / リセット / VR
- `#resource-monitor-overlay` — FPS / Draw / Update / MEM
- フルスクリーン時は sidebar 非表示（`body.pseudo-fullscreen` フォールバックあり）
- `.viewer.xr-active` — XR 時の背景透明化用（CSS）

---

## 7. UI から触れる描画設定

| UI | 呼び出し | 既定 / 永続化 |
|---|---|---|
| `.color-input` | `setBackgroundColor` | `#0b1118` |
| `.mode-select` | `setBackgroundMode` (`grid` / `solid`) | grid |
| `.shadow-toggle` | `setShadowEnabled` | HTML 上 unchecked |
| `.gravity-magnitude-input` | `setGravity` | `9.8`（実効 `-9.8*12.5`）、range 0.1–50 |
| `.breast-physics-*` | `updateBreastPhysicsSettings` | ON, 60Hz, inertia 1.0 |
| `.pixel-ratio-select` | `setPixelRatio` | 1 / 1.5 / 2 |
| `.shadow-resolution-select` | `setShadowResolution` | 256 / 512 / **1024** |
| `.vr-passthrough-toggle` | `setPassthroughEnabled` | `vr-passthrough-enabled` |
| `.fps-limit-toggle` + `.fps-limit-input` | `setFpsLimit` | `fps-limit-enabled` / `fps-limit-value`（default 60） |
| `.physics-disable-toggle` | `setPhysicsDisableGlobally` | `physics-disable-globally` |
| `.resource-monitor-toggle` | monitor start/stop | `resource-monitor-enabled` |
| `.motion-loop-toggle` | `setLoopEnabled` | `motion-loop-enabled` |
| モデル「影を落とす」 | `setModelShadowEnabled` | モデル単位 |
| `#overlay-vr-button` | enter / exit XR | — |

シーン YAML 復元時も背景色・影・重力・胸物理などを再適用する。

---

## 8. 関連ファイル

```
src/
├── main.js
├── style.css
├── engine/
│   ├── BabylonEngine.js
│   ├── MmdManager.js
│   └── XrManager.js
├── ui/
│   └── UIManager.js
└── utils/
    ├── db.js
    └── zipLoader.js
index.html
vite.config.js
```

---

## 9. 既知の注意点

- XR 終了時は Babylon 側が canvas サイズ・カメラ・`customAnimationFrameRequester` を変える。アプリ側は `_restoreDesktopState` + `restoreAfterXr` でデスクトップ表示を戻す。
- `PROJECT_OVERVIEW.md` に記載のある「ボーン追跡でカメラ `setTarget`」は現行 `MmdManager` には未実装（`setTarget` は XR 復元時のみ）。
- `#overlay-gyro-recalibrate-button` は HTML にあるが JS 未配線。
