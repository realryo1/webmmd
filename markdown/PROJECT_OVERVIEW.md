# webmmd カスタム拡張 — プロジェクト概要

## 概要

本プロジェクトは、ブラウザ上で MMD モデル（PMX）およびモーション（VMD）を表示・再生するビューアです。
描画エンジンは **Babylon.js 9.x**、MMD ランタイムは **babylon-mmd 1.3**、物理は **Havok** を用います。
**Vite + PWA** によりオフライン動作し、CDN 依存はありません。

レンダラ（照明・影・ポストFX・IBL・品質プリセット）の詳細は [`renderer_spec.md`](./renderer_spec.md) を参照してください。

---

## ファイル構成

```
mmd/
├── .github/workflows/deploy.yml
├── index.html
├── package.json
├── vite.config.js                 # PWA: globPatterns に env 含む
├── markdown/
│   ├── PROJECT_OVERVIEW.md
│   ├── deployment_guide.md
│   └── renderer_spec.md
├── public/
│   ├── icons/
│   └── env/                       # 任意の studio.env（無ければフォールバック生成）
└── src/
    ├── main.js                    # エントリー（TextureAlphaChecker パッチ削除済み）
    ├── style.css
    ├── engine/
    │   ├── BabylonEngine.js       # Engine / Scene / Havok / RenderingManager 配線
    │   ├── RenderingManager.js    # 照明・影・ポストFX・IBL・品質プリセット
    │   ├── KeyLightGizmo.js       # キーライト位置の Unity 風可視化
    │   ├── MmdManager.js          # babylon-mmd 1.3 ローダ/アニメ/物理
    │   ├── XrManager.js           # WebXR + setXrMode 連携
    │   └── materials/
    │       └── MmdPbrMaterialBuilder.js
    ├── ui/UIManager.js
    └── utils/
```

---

## アーキテクチャ

### 起動フロー

```
index.html
  └─ src/main.js
       ├─ BabylonEngine.initialize
       │    ├─ SdefInjector.OverrideEngineCreateEffect
       │    ├─ Havok / Camera / Ground
       │    └─ RenderingManager.initialize（3点照明・影・DRP・IBL）
       ├─ MmdManager(scene, camera, physics, renderingManager)
       ├─ XrManager → enter/exit で renderingManager.setXrMode
       └─ UIManager → グラフィックス設定を localStorage 永続化
```

### babylon-mmd 1.3 要点

| 領域 | API |
|---|---|
| ローダ | `RegisterPmxLoader` + `LoadAssetContainerAsync` + `pluginOptions.mmdmodel.materialBuilder` |
| モデル | `createMmdModel(mesh, { materialProxyConstructor, trimMetadata: false, buildPhysics })` |
| アニメ | `createRuntimeAnimation` / `setRuntimeAnimation` / `destroyRuntimeAnimation` |
| カメラ | `MmdCamera` + `mmdRuntime.addAnimatable` |
| 物理 | `rigidBodyStates`（0=kinematic / 1=dynamic）+ `initializeMmdModelPhysics` |
| URL | `FileToolsOptions.PreprocessUrl` |

### グラフィックス強化（RenderingManager）

- **品質プリセット**: auto / low / medium / high / ultra（端末スコア + 実測 FPS）
- **影**: 低〜中は ShadowGenerator+PCF、高以上は CascadedShadowGenerator（numCascades=2）。濃さは UI 調整可（Standard 0.35 / PBR 0.75 既定）。ON/OFF UI は廃止。PBR では常時 ON、モデルはロード時にキャスト。セルフシャドウ用にフラスタム絞り込み + forceBackFacesOnly
- **ポストFX**: DefaultRenderingPipeline（Bloom 既定OFF / FXAA / MSAA / DoF / シャープネス）
- **SSAO2**: デスクトップ・medium以上 + PBR で有効。medium 以上で既定 ON（モデルの影感を補完）
- **IBL**: `public/env/*.env` があれば `CreateFromPrefilteredData`、無ければ 128px キューブ生成。既定強度 0.55（高すぎるとセルフシャドウが消える）
- **マテリアル**: Standard（既定） / PBR。切替は専用スナップショットで再ロード（YAML往復なし）
- **PBR 照明最適化**: ambient / contrast / shadowDarkness / キー主体のライト比 / マテリアル environmentIntensity を影コントラスト優先で調整
- **キーライトギズモ**: シーン中央に Unity 風の向き表示（黄球 + 平行レイ）。グラフィックスパネルで ON/OFF、`webmmd-graphics-settings` に永続化
- **XR**: 入場時に SSAO / Bloom / DoF / シャープネス / CSM を OFF

### データ永続化

| ストレージ | キー | 内容 |
|---|---|---|
| IndexedDB | `webmmd-assets-db` | アセットフォルダハンドル |
| localStorage | `webmmd-graphics-settings` | 品質・マテリアル・Bloom/IBL・影の濃さ 等 |
| localStorage | 既存キー群 | FPS制限、影解像度、物理無効、パネル状態など |

---

## 既知の制限

- **PBR**: マテリアルモーフ非対応。sphere / toon マップは v1 で無効。
- **IBL**: 同梱 `.env` が無い場合は簡易フォールバック（prefiltered ではない）。`public/env/studio.env` を置くと品質向上。
- **胸物理の慣性スライダー**: ランタイムは transformNode の `physicsBody` を走査して damping/gravity を調整。必要に応じて物理再初期化で近似。
- **ジャイロ再キャリブ**: `#overlay-gyro-recalibrate-button` は未配線。
