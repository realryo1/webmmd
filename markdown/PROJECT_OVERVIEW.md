# webmmd カスタム拡張 — プロジェクト概要

## 概要

本プロジェクトは、ブラウザ上で MMD モデル（PMX）およびモーション（VMD）を表示・再生するビューアです。
従来の Three.js ベースの描画エンジンを完全に廃止し、**Babylon.js**、**babylon-mmd**、および高速物理エンジン **Havok** を用いたモダンな設計へと移行・再構築しました。
また、開発環境には **Vite** を導入し、PWA（オフラインキャッシュ対応）設定を自動化すると共に、GitHub Pages への手動デプロイ用の GitHub Actions ワークフローを備えています。

レンダラ（Babylon / MMD / XR）の詳細仕様は [`renderer_spec.md`](./renderer_spec.md) を参照してください。

---

## ファイル構成

```
mmd/
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Pages 手動デプロイワークフロー
├── index.html                    # メイン HTML（Vite エントリーポイントの土台）
├── package.json                  # 依存関係定義およびスクリプト
├── vite.config.js                # Vite ビルド設定および VitePWA 設定
├── markdown/                     # プロジェクトドキュメント
│   ├── PROJECT_OVERVIEW.md       # 本ドキュメント（プロジェクト概要）
│   ├── deployment_guide.md       # ローカルテストおよび GitHub Pages 公開手順書
│   └── renderer_spec.md          # レンダラ（Babylon / MMD / XR）仕様
├── public/                       # 静的アセット
│   └── icons/
│       ├── icon-192.svg          # PWA 用アイコン (192px)
│       └── icon-512.svg          # PWA 用アイコン (512px)
├── src/
│   ├── main.js                   # アプリのエントリーポイント（LOD Map 対策パッチ含む）
│   ├── style.css                 # アプリのスタイル定義
│   ├── engine/
│   │   ├── BabylonEngine.js      # Babylon.js 描画基盤、カメラ、ライト、物理の初期化・制御
│   │   ├── MmdManager.js         # babylon-mmd によるモデル・モーションのロード、再生、物理設定
│   │   └── XrManager.js          # WebXR（VR）の初期化、コントローラー移動、パススルー、退出時復元
│   ├── ui/
│   │   └── UIManager.js          # HTML UI 要素からのイベントバインドとエンジン状態の同期
│   └── utils/
│       ├── db.js                 # IndexedDB を用いたアセットディレクトリハンドルの保存・取得
│       └── zipLoader.js          # JSZip を用いた ZIP アーカイブの解凍ユーティリティ
```

---

## アーキテクチャ

### 起動フロー

```
ページロード (index.html)
  ├─ /src/main.js (module) を読み込み
  │   ├─ /src/style.css をインポートして適用
  │   ├─ TextureAlphaChecker モンキーパッチ（Babylon v7.54+ LOD Map 対策）
  │   ├─ BabylonEngine を初期化 (Canvas、Havok、カメラ、ライト、影)
  │   ├─ MmdManager を生成して MmdRuntime を初期化
  │   ├─ XrManager を生成して WebXRExperience を非同期セットアップ
  │   │    └─ babylonEngine / mmdManager を後付け参照
  │   └─ UIManager を生成 → restoreSession() で前回セッション復元
  └─ UIManager
      ├─ ドラッグ＆ドロップ、フォルダ選択、ZIP 等のイベント処理
      ├─ IndexedDB から FileSystemDirectoryHandle を復元
      ├─ zipLoader で ZIP をメモリ解凍し、MmdManager の fileMap へ登録
      └─ Blob URL 経由でモデル・モーションを Babylon.js へロード
```

デバッグ用に `window.babylonApp = { engine, mmd, xr, ui }` を公開しています。

### データ永続化レイヤー

本アプリでは、IndexedDB および localStorage を用いて、ユーザーの設定やデータを完全にローカル環境に保存しています。

| ストレージ | キー・ストア情報 | 内容 |
|---|---|---|
| IndexedDB `webmmd-assets-db` | ストア `handles` / キー `assets-folder` | FileSystemDirectoryHandle（アセットフォルダ参照用） |
| localStorage | `vr-passthrough-enabled` | WebXR パススルーの有効 / 無効 |
| localStorage | `auto-play-on-motion` | モーションロード時の自動再生 |
| localStorage | `motion-loop-enabled` | モーションのループ再生 |
| localStorage | `resource-monitor-enabled` | リソースモニターの表示 / 非表示 |
| localStorage | `physics-disable-globally` | 物理演算のグローバル無効化 |
| localStorage | `fps-limit-enabled` | フレームレート制限の有効 / 無効 |
| localStorage | `fps-limit-value` | フレームレート制限の目標値（デフォルト: `60`） |
| localStorage | `pixel-ratio` | 画質上限（ピクセル比。デフォルト: `1`） |
| localStorage | `shadow-resolution` | シャドウ解像度（デフォルト: `1024`） |
| localStorage | `webmmd-panel-states` | 操作パネルの開閉状態および表示位置 |
| localStorage | `webmmd-saved-scenes` | 保存シーン一覧（各要素の `data` は YAML 文字列） |

シーンの入出力には `js-yaml` を使用します（エクスポートは `.yaml` ダウンロード）。

---

## 機能および最適化

### レンダリング・影（Shadow Map）
- **影の描画**: `DirectionalLight` に `ShadowGenerator` を設定し、`useBlurExponentialShadowMap = true`（指数シャドウマップ）および `useKernelBlur = true`（カーネルブラー、カーネルサイズ `32`）により柔らかい影を描画します。影の有効/無効や解像度（256 / 512 / 1024）は UI からリアルタイムに変更できます。
- **背景**: デフォルト clearColor は `#0b1118` 相当。床はグリッド / ソリッドを切替可能です。
- **ピクセル比**: UI から `1` / `1.5` / `2` を選択し、`setHardwareScalingLevel` で反映します。
- **FPS 制限**: `engine.customAnimationFrameRequester` による間引き（1〜240）。詳細は `renderer_spec.md` 参照。

### 物理演算 (Havok) & MMD 物理の最適化
WASM ベースの高速物理エンジン **Havok** を採用しています（WASM は Vite 経由で同梱し、CDN は使用しません）。
- **タイムステップの固定化（描画 FPS 非依存）**: `useDeltaForWorldStep = false` と `setTimeStep(1/60)` / `setSubTimeStep(1000/60)` により、描画側の FPS 制限に依存せず実時間で 60Hz 物理ステップします。胸の揺れ強度は慣性力倍率（0〜10）のみで調整します。
- **重力の同期**: 重力設定（標準 `9.8`）は MMD スケール（約 `12.5` 倍）に自動変換されて物理ワールドへ同期されます。
- **骨格・物理の自動最適化 (`MmdManager.js`)**:
  - **突き抜け・暴走防止**: 体幹・基幹ボーン（センター、腰、頭など）の剛体について、物理モードを `FollowBone` (0) に設定し、衝突シミュレーションから除外します。不要な剛体（下着やパンツなど）も自動で衝突対象から除外されます。
  - **揺れもの物理の最適化**: 髪、胸、スカートなどの揺れものに対して、質量・摩擦・ダンピングを補正。特に胸は衝突判定を無効化した上で、「揺れやすさ係数」が滑らかに反映される設計です。
  - **つま先 IK の自動修正**: 一部モデルにおけるつま先 IK の `transformOrder` 不整合をロード時に自動検知・修正します。

### 音声とアニメーションの同期
- モーション（VMD）と同名の音声（`.wav` / `.mp3`）を HTML5 Audio で自動ロードします（`loop=true`）。
- `onBeforeRenderObservable` にて `MmdRuntime.currentTime` と音声 `currentTime` のズレを監視します。
- ズレが `0.05` 秒超で `playbackRate` を `1.02` / `0.98` に微調整、`2.0` 秒以上で強制シークします。
- `readyState < 2` のときは同期をスキップし、デコード待ちによるフリーズを防ぎます。

### カメラ制御
- **デスクトップ**: ユーザー操作の `ArcRotateCamera`（半径 1〜200）。
- **カメラモーション**: VMD カメラを `mmdRuntime.camera` に適用可能。
- **ボーン追従カメラ**: 現行コードには未実装（頭・首ボーンへの `setTarget` 同期などは行わない）。

### WebXR (VR)
- パススルー OFF 時は `immersive-vr`、ON 時は `immersive-ar`（`local-floor`）。
- 入場時に `worldScalingFactor = 12.5` で等身大化し、退出時は `1.0` に戻します。
- 左スティック移動 / 右スティックヨー / X・Y で上下移動（テレポート無効の自前制御）。
- 退出時はカメラ・背景・地面・canvas サイズ・FPS 制限 requester をデスクトップ状態へ復元します（灰色ビューポート対策）。

### パフォーマンス計測とデバッグ機能
- **パフォーマンス計測**: `onBeforeRenderObservable` / `onBeforeDrawPhaseObservable` / `onAfterRenderObservable` で `updateTime` と `drawTime` を計測。リソースモニタ Overlay で FPS / Draw / Update / MEM を表示できます。
- **物理デバッグビューア**: `P` キーで `PhysicsViewer` をトグル表示。
- **ポーズ＆IK リアルタイムダンプ**: UI のボーンログトグルで `boneLogEnabled` を有効にし、スペースキーで主要ボーン座標・IK 情報をコンソールへダンプ。

---

## ブラウザ互換性とPWA

- **Vite PWA**: ビルド時に `vite-plugin-pwa` がサービスワーカーを生成し、インターネット未接続時でもローカル動作可能です（CDN 依存なし）。
- **モバイル対応**: iOS / Android ブラウザでのファイル選択・ZIP 解凍（`JSZip`）に対応しています。
- **WebXR**: Meta Quest 等の対応ゴーグルから VR / パススルー（AR セッション）を起動できます。
- **既知の未配線 UI**: `#overlay-gyro-recalibrate-button`（ジャイロ再キャリブレーション）は HTML に存在するが JS 未接続です。
