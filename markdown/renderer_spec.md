# レンダラ周りの仕様

Babylon.js 描画基盤、MMD 表示、WebXR、グラフィックス設定の仕様まとめ。
実装の正は `src/engine/` および関連ソース。

---

## 1. 全体構成

**スタック:** `@babylonjs/core@9.18` / `@babylonjs/havok` / `@babylonjs/materials` / `babylon-mmd@1.3` / Vite + PWA

### 起動フロー

```
index.html (#renderCanvas)
  └─ src/main.js
       ├─ BabylonEngine.initialize(canvas)
       │    ├─ SdefInjector.OverrideEngineCreateEffect(engine)
       │    ├─ Havok / ArcRotateCamera / Ground
       │    └─ RenderingManager.initialize()
       ├─ MmdManager(scene, camera, physics, renderingManager)
       ├─ XrManager → setXrMode(true/false)
       └─ UIManager → graphics パネル + localStorage
```

| クラス | 役割 |
|---|---|
| `BabylonEngine` | Engine / Scene / Camera / Ground / Havok。ライト・影は RenderingManager へ委譲 |
| `RenderingManager` | ambient / 3点照明 / 影 / DRP / SSAO / IBL / 品質プリセット / XR モード |
| `MmdManager` | babylon-mmd 1.3 ローダ・アニメ・物理・Standard/PBR 切替 |
| `MmdPbrMaterialBuilder` | PBR 構築（sphere/toon 無効、キーワード質感オプション） |
| `XrManager` | WebXR + RenderingManager.setXrMode |
| `UIManager` | settings-graphics パネル連携 |

---

## 2. RenderingManager

### 2.1 照明

| ライト | 内容 |
|---|---|
| ambientColor | Standard: `(0.5, 0.5, 0.5)` / PBR: `(0.1, 0.1, 0.12)`（モード切替時に自動調整） |
| HemisphericLight | Standard: specular `(0,0,0)` / PBR: specular `(0.15, 0.15, 0.15)` |
| key (`dirLight`) | 主光源・影キャスタ。方位角 / 高度で方向・位置を制御 |
| fill | 影なし |
| rim | 中品質以上。XR 中は OFF |
| キーライトギズモ | `KeyLightGizmo`（Unity 風）。シーン中央 `(0,10,0)` に向きだけ表示。`setKeyLightGizmoVisible` で切替 |

### 2.2 影

| 品質 | 方式 |
|---|---|
| low〜medium | `ShadowGenerator` + PCF |
| high〜ultra | `CascadedShadowGenerator`（`numCascades=2`, `autoCalcDepthBounds=false`） |

- bias / normalBias は MMD スケール向けに調整
- 半透明マテリアルはキャスタ除外
- `receiveShadows` をモデル配下で有効化（モデルは cast + receive = 自己影あり）
- `settings.shadowDarkness`（0〜1）: Standard 既定 `0.35` / PBR 既定 `0.75`
- `setShadowDarkness(v)` で即時反映。モード切替時はモード既定へ戻す
- UI: グラフィックスパネル「影の濃さ」スライダー（`webmmd-graphics-settings` に永続化）
- 影の ON/OFF UI（表示セクション・モデル別「影を落とす」）は廃止。モデルはロード時に常時キャスト
- PBR 時は品質プリセットによらず影を常時 ON（`setShadowEnabled(false)` も無視）
- キーライトは `autoUpdateExtends=false` + キャスタ適合 `shadowFrustumSize`（MMD の巨大 AABB 対策）
- `forceBackFacesOnly` / 低めの bias・normalBias でセルフシャドウを確保
- PBR の IBL: スライダー値をそのまま適用（下限 1.0 強制は廃止）。マテリアル側 `environmentIntensity≈0.55`

### 2.3 ポストFX

`DefaultRenderingPipeline`:

| 効果 | 既定 |
|---|---|
| Bloom | OFF |
| FXAA | ON |
| MSAA | プリセット依存 |
| DoF | OFF |
| シャープネス | OFF（high で ON / ultra で ON） |

`SSAO2RenderingPipeline`: デスクトップ + medium以上 + PBR 時。medium 以上で既定 ON。未使用時は dispose。

### 2.4 IBL

1. `public/env/studio.env` または `default.env` を `CubeTexture.CreateFromPrefilteredData` で読込
2. 無ければ 128px `RawCubeTexture` で方向性のある屋内照明風フォールバック生成（mipmap 有効）
3. ReflectionProbe を environmentTexture に直接は付けない
4. Vite PWA `globPatterns` に `env` を含む

### 2.5 品質プリセット

`auto` / `low` / `medium` / `high` / `ultra`

- auto: 端末スコア（cores / deviceMemory / mobile）+ 実測 FPS で切替
- high: SSAO / シャープネス 既定 ON（PBR + デスクトップ環境向け）
- XR 入場時: SSAO / Bloom / DoF / シャープネス / CSM 強制 OFF（`setXrMode(true)`）

### 2.6 露出

`scene.imageProcessingConfiguration.exposure` と、存在する `MmdStandardMaterial.cameraExposure` を同期。

### 2.7 PBR 照明最適化

- モード切替時（`setMaterialMode`）に以下を自動調整:
  - `scene.ambientColor`: Standard `(0.5, 0.5, 0.5)` → PBR `(0.1, 0.1, 0.12)`
  - `hemiLight.specular`: Standard `(0,0,0)` → PBR `(0.15, 0.15, 0.15)`
  - `contrast`: Standard 既定値 → PBR 切替時に +0.15（最低 1.1）。Standard 復帰時に復元
  - `shadowDarkness`: Standard `0.35` → PBR `0.75`
- PBR ライト強度（`LIGHT_LEVELS_PBR`）: hemi `0.32` / key `2.2` / fill `0.1` / rim `0.28`  
  （キー主体。IBL/fill/hemi で影が埋まらないようにする）

---

## 3. BabylonEngine（互換ラッパ）

| メソッド | 委譲先 |
|---|---|
| `setShadowEnabled` | `renderingManager.setShadowEnabled` |
| `setShadowResolution` | `renderingManager.setShadowResolution` |
| `setShadowDarkness` | `renderingManager.setShadowDarkness` |
| `dirLight` / `hemiLight` / `shadowGenerator` | getter で RenderingManager を参照 |

その他（重力・背景・FPS制限・XR 復元・PhysicsViewer）は従来どおり。

---

## 4. MMD（babylon-mmd 1.3）

### 4.1 ロード

```js
RegisterPmxLoader();
RegisterMmdRuntimeModelAnimation();
RegisterMmdRuntimeCameraAnimation();

LoadAssetContainerAsync(url, scene, {
  pluginExtension: ".pmx",
  pluginOptions: { mmdmodel: { materialBuilder } }
});

createMmdModel(mesh, {
  materialProxyConstructor: MmdStandardMaterialProxy, // PBR 時は null
  trimMetadata: false,
  buildPhysics: true
});
```

### 4.2 アニメ / カメラ

- モデル: `createRuntimeAnimation` → `setRuntimeAnimation(handle|null)` → `destroyRuntimeAnimation`
- カメラ: `new MmdCamera` + `mmdRuntime.addAnimatable`（`mmdRuntime.camera` は削除済み）
- `motions` Map: `name → { animation, handle }`

### 4.3 物理

- `rigidBodyStates[i]`: `0` = kinematic（アニメ追従）, `1` = dynamic
- 再初期化: `mmdRuntime.initializeMmdModelPhysics(model)`
- 胸物理: メタデータ最適化 + `mesh.getChildTransformNodes` 上の `physicsBody` へ damping / gravityFactor
- グローバル無効: 全 `rigidBodyStates` を 0 + 物理タイムステップ 0

### 4.4 Standard / PBR 切替

- YAML 往復禁止。専用スナップショット（位置・回転・モーション名・モーフ・再生時刻）
- 旧 AssetContainer / メッシュ / マテリアルを明示 dispose 後に再ロード

### 4.5 PBR 既知制限

- sphere / toon 無効（v1）
- マテリアルモーフ非対応（UI に明記）
- キーワード質感プリセットはオプション（既定 OFF）

---

## 5. UI（settings-graphics）

| コントロール | 動作 |
|---|---|
| 品質プリセット | `setQualityPreset` |
| マテリアル | `switchMaterialMode`（再ロード） |
| 露出 / Bloom / FXAA / DoF / シャープ / SSAO / IBL | RenderingManager |
| キーライト方位・高度・強度 / 位置表示 | `setKeyLightDirection` / `setKeyIntensityMul` / `setKeyLightGizmoVisible` |
| キーワード質感 | 次回 PBR ロードから反映 |

永続化キー: `localStorage["webmmd-graphics-settings"]`  
シーン YAML の `settings.graphics` にも往復。

---

## 6. 関連ファイル

```
src/engine/BabylonEngine.js
src/engine/RenderingManager.js
src/engine/KeyLightGizmo.js
src/engine/MmdManager.js
src/engine/materials/MmdPbrMaterialBuilder.js
src/engine/XrManager.js
src/ui/UIManager.js
src/main.js
index.html
public/env/README.txt
vite.config.js
```

---

## 7. 既知の注意点

- XR 終了時は `_restoreDesktopState` + `restoreAfterXr` でデスクトップ表示を戻す
- `#overlay-gyro-recalibrate-button` は未配線
- IBL フォールバックは 128px mipmap 有効の方向性あるキューブマップ（prefiltered ではないため `studio.env` には劣る）
- 旧 API（`ImportMeshAsync` / `addAnimation` / `physicsEnabled` / `dirLight._shadowGenerator` / TextureAlphaChecker パッチ）は削除済み
