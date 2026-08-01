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
- `settings.shadowEnabled`（既定 `true`）: 全体の影 ON/OFF。`setShadowEnabled` で即時反映。Standard / PBR 共通。品質プリセットでは上書きしない
- `settings.shadowDarkness`（0〜1）: Standard 既定 `0.35` / PBR 既定 `0.75`
- `setShadowDarkness(v)` で即時反映。モード切替時はモード既定へ戻す
- **PBR 影コントラスト連動**: 濃さ上昇に応じ hemi / fill / rim / ambient / 実効 IBL を減衰（キー影だけでなく影内の埋め光も暗くする）。倍率は `fill=1-d*0.85` / `hemi=1-d*0.70` / `rim=1-d*0.35` / `ambient=1-d*0.50` / `IBL=1-d*0.55`。`settings.iblIntensity` 自体は保持。Standard では連動なし
- UI: グラフィックスパネル「影」トグル + 「影の濃さ」スライダー（`webmmd-graphics-settings` に永続化）
- モデル別「影を落とす」UI は廃止。モデルはロード時にキャスタ登録（全体 OFF 時は投影しない）
- キーライトは `autoUpdateExtends=false` + キャスタ適合 `shadowFrustumSize`（MMD の巨大 AABB 対策）
- `forceBackFacesOnly` / 低めの bias・normalBias でセルフシャドウを確保
- PBR の IBL: スライダー値 × 影濃さ連動倍率を適用（下限 1.0 強制は廃止）。マテリアル側 `environmentIntensity≈0.42`（肌・顔材はさらに ×0.75）

### 2.3 ポストFX

`DefaultRenderingPipeline`:

| 効果 | Standard | PBR 既定 |
|---|---|---|
| Bloom | 無効（適用しない） | OFF（ultra で ON） |
| FXAA | 有効（ユーザー切替可） | ON |
| MSAA | 無効（samples=1） | プリセット依存 |
| DoF | 無効 | OFF（手動トグル） |
| シャープネス | 無効 | OFF（high / ultra で ON） |

`SSAO2RenderingPipeline`: デスクトップ + medium以上 + **PBR のみ**。medium 以上で既定 ON。未使用時は dispose。

### 2.4 IBL

1. `public/env/studio.env` または `default.env` を `CubeTexture.CreateFromPrefilteredData` で読込
2. 無ければ 128px `RawCubeTexture` で方向性のある屋内照明風フォールバック生成（mipmap 有効）
3. ReflectionProbe を environmentTexture に直接は付けない
4. Vite PWA `globPatterns` に `env` を含む
5. **PBR のみ** `environmentTexture` を設定。Standard では常に `null`

### 2.5 品質プリセット

`auto` / `low` / `medium` / `high` / `ultra`

**Standard**: `pixelRatio`（`hardwareScaling`）のみ変更。影・rim・MSAA・Bloom 等は `STANDARD_BASELINE`（medium 相当: 影 ON / 1024 / CSM OFF / rim ON）で固定。

**PBR**: 解像度スケールとシャドウ解像度もプリセットが唯一の入口。システムパネルの個別 UI は廃止済み。

| プリセット | pixelRatio | shadowMapSize | CSM | MSAA | 主な効果（PBR） |
|---|---|---|---|---|---|
| low | 1 | 512 | OFF | 0 | 影 OFF※ |
| medium | 1 | 1024 | OFF | 0 | SSAO 既定 ON |
| high | 1.5 | 2048 | ON | 2 | SSAO / シャープネス |
| ultra | 2 | 2048 | ON | 4 | Bloom / SSAO / シャープネス |

※ 影 ON/OFF はユーザー UI が優先（プリセットの `shadowEnabled` は適用しない）

- auto: 端末スコア（cores / deviceMemory / mobile）+ 実測 FPS で切替
- DoF は手動トグル専用（プリセットでは上書きしない）
- XR 入場時: SSAO / Bloom / DoF / シャープネス / CSM 強制 OFF（`setXrMode(true)`）

### 2.6 露出

`scene.imageProcessingConfiguration.exposure` と、存在する `MmdStandardMaterial.cameraExposure` を同期。

### 2.7 PBR 照明最適化

- モード切替時（`setMaterialMode`）に以下を自動調整:
  - `scene.ambientColor`: Standard `(0.5, 0.5, 0.5)` → PBR ベース `(0.1, 0.1, 0.12)`（影濃さ連動でさらに減衰）
  - `hemiLight.specular`: Standard `(0,0,0)` → PBR `(0.15, 0.15, 0.15)`
  - `contrast`: Standard 既定値 → PBR 切替時に +0.15（最低 1.1）。Standard 復帰時に復元
  - `shadowDarkness`: Standard `0.35` → PBR `0.75`
- PBR ライト強度（`LIGHT_LEVELS_PBR`）: hemi `0.32` / key `2.2` / fill `0.1` / rim `0.28`  
  （キー主体。実効値は `shadowDarkness` 連動でさらに減衰）
- 肌・顔材（材質名に 顔/肌/face/skin 等）: `environmentIntensity` ×0.75・`directIntensity=1.2` を常時適用。キーワード質感 ON 時の肌 SSS translucency は `0.08`

---

## 3. BabylonEngine（互換ラッパ）

| メソッド | 委譲先 |
|---|---|
| `setShadowEnabled` | `renderingManager.setShadowEnabled` |
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
- Standard: `MmdStandardMaterialBuilder` + `MmdStandardMaterialProxy`。アウトライン（トゥーンエッジ）は無効のまま
- PBR 離脱時に Bloom / DoF / Sharpen / SSAO / IBL を `_pbrFxSnapshot` へ退避し、復帰時に復元

### 4.5 PBR 既知制限

- sphere / toon 無効（v1）
- マテリアルモーフ非対応（UI に明記）
- キーワード質感プリセットはオプション（既定 OFF）

---

## 5. UI（settings-graphics）

| コントロール | 表示 | 動作 |
|---|---|---|
| 品質プリセット | 常時 | `setQualityPreset`（Standard は解像度のみ） |
| マテリアル | 常時 | `switchMaterialMode`（再ロード） |
| 露出 / FXAA | 常時 | RenderingManager |
| Bloom / DoF / シャープ / SSAO / IBL / キーワード質感 | **PBR のみ**（`.graphics-pbr-only`） | RenderingManager |
| キーライト方位・高度・強度 / 位置表示 / 影 / 影の濃さ | 常時 | `setKeyLightDirection` / `setShadowEnabled` 等 |

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
