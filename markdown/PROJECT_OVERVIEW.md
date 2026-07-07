# webmmd カスタム拡張 — プロジェクト概要

## 概要

本プロジェクトは、ブラウザ上で MMD モデル（PMX）およびモーション（VMD）を表示・再生するビューアです。
従来の Three.js ベースの描画エンジンを完全に廃止し、**Babylon.js**、**babylon-mmd**、および高速物理エンジン **Havok** を用いたモダンな設計へと移行・再構築しました。
また、開発環境には **Vite** を導入し、PWA（オフラインキャッシュ対応）設定を自動化すると共に、GitHub Pages への手動デプロイ用の GitHub Actions ワークフローを備えています。

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
│   └── deployment_guide.md       # ローカルテストおよび GitHub Pages 公開手順書
├── public/                       # 静的アセット
│   └── icons/
│       ├── icon-192.svg          # PWA 用アイコン (192px)
│       └── icon-512.svg          # PWA 用アイコン (512px)
├── src/
│   ├── main.js                   # アプリのエントリーポイント
│   ├── style.css                 # アプリのスタイル定義
│   ├── engine/
│   │   ├── BabylonEngine.js      # Babylon.js 描画基盤、カメラ、ライト、物理の初期化・制御
│   │   ├── MmdManager.js         # babylon-mmd によるモデル・モーションのロード、再生、物理設定、ボーン追跡
│   │   └── XrManager.js          # WebXR（VR）の初期化、コントローラー移動、パススルー
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
  │   ├─ BabylonEngine インスタンスを生成して初期化 (Canvas、Havok物理、カメラ、ライト、影)
  │   ├─ MmdManager インスタンスを生成して MmdRuntime を初期化
  │   ├─ XrManager インスタンスを生成して WebXRExperience を非同期でセットアップ
  │   └─ UIManager インスタンスを生成して DOM イベントをバインド
  └─ UIManager
      ├─ ドラッグ＆ドロップ、フォルダ選択、ZIPファイル等のイベントを処理
      ├─ IndexedDB から前回の FileSystemDirectoryHandle を復元
      ├─ zipLoader で ZIP をメモリ解凍し、MmdManager のファイルマップへ登録
      └─ ファイルマップ（Blob URL）を用いてモデル・モーションを Babylon.js へロード
```

### データ永続化レイヤー

本アプリでは、IndexedDB および localStorage を用いて、ユーザーの設定やデータを完全にローカル環境に保存しています。

| ストレージ | キー・ストア情報 | 内容 |
|---|---|---|
| IndexedDB `webmmd-assets-db` | ストア `handles` / キー `assets-folder` | FileSystemDirectoryHandle (アセットフォルダ参照用) |
| localStorage | `vr-passthrough-enabled` | WebXR パススルー機能の有効 / 無効状態 |
| localStorage | `auto-play-on-motion` | モーションロード時の自動再生の有効 / 無効状態 |
| localStorage | `motion-loop-enabled` | モーションのループ再生の有効 / 無効状態 |
| localStorage | `resource-monitor-enabled` | リソースモニター（パフォーマンス監視）の表示 / 非表示状態 |
| localStorage | `physics-disable-globally` | 物理演算のグローバル無効化状態 |
| localStorage | `fps-limit-enabled` | フレームレート制限の有効 / 無効状態 |
| localStorage | `fps-limit-value` | フレームレート制限の目標値（デフォルト: `60`） |
| localStorage | `webmmd-panel-states` | 各操作パネル（UI）の開閉状態および表示位置 |
| localStorage | `webmmd-saved-scenes` | 保存されたシーン情報（JSON 文字列） |

---

## 機能および最適化

### レンダリング・影（Shadow Map）
- **トーンマッピング**: Babylon.js の標準である Linear / sRGB 色空間に基づき、マテリアルの質感およびライティングを最適化しています。
- **影の描画**: `DirectionalLight` に対して `ShadowGenerator` を設定し、`useBlurExponentialShadowMap = true`（指数シャドウマップ）および `useKernelBlur = true`（カーネルブラー、カーネルサイズ `32`）により、モデルの輪郭に合わせた柔らかく美麗な影を描画します。影の有効/無効や解像度の変更もリアルタイムに反映されます。

### 物理演算 (Havok) & MMD 物理の最適化
WASM ベースの高速物理エンジン **Havok** を採用しています。
- **タイムステップの固定化**: FPS 変動時の物理挙動を安定させるため、`useDeltaForWorldStep = false` および `setTimeStep(1 / 60)` により物理ワールドのタイムステップを 1/60s (約16.6ms) に完全に固定しています。
- **重力の同期**: 重力設定（標準 `9.8`）は MMD スケール（約 `12.5` 倍）に自動変換されて物理ワールドへ同期されます。
- **骨格・物理の自動最適化 (`MmdManager.js`)**:
  - **突き抜け・暴走防止**: 体幹・基幹ボーン（センター、腰、頭など）の剛体について、物理演算による姿勢の上書きを完全に防ぐため、自動的に物理モードを `FollowBone` (0) に設定し、衝突シミュレーションから除外します。また、不要な剛体（下着やパンツなど）も自動で衝突対象から除外されます。
  - **揺れもの物理の最適化**: 髪、胸、スカートなどの揺れものに対して、質量（Mass）や摩擦（Friction）、ダンピング係数を補正。特に胸の物理については、めり込みや暴走を防ぐために衝突判定を無効化した上で、ユーザーが設定した「揺れやすさ係数」（ダンピング値）が滑らかに反映される設計となっています。
  - **つま先 IK の自動修正**: 一部モデルにおけるつま先 IK の変形階層（`transformOrder`）の不整合をロード時に自動検知・修正し、モーションの正確な追従を可能にしています。

### 音声とアニメーションの同期
- モーション（VMD）と同時に読み込まれた同名の音声ファイル（`.wav` または `.mp3`）を HTML5 Audio を通じて自動でロードします。
- `onBeforeRenderObservable` フックにて、描画エンジンの時間軸（`MmdRuntime.currentTime`）と音声の再生時間（`currentTime`）のズレを常時監視します。
- ズレが `0.05` 秒を超えた場合は `playbackRate` を `1.02` または `0.98` に微調整して滑らかに同期させ、`2.0` 秒以上の大きなズレが発生した場合は強制シークします。
- Safari 等におけるロード・デコード待ちフリーズを防ぐため、音声の `readyState < 2` (情報不足) の場合は同期処理を一時的にスキップする堅牢な設計になっています。

### ボーン追跡とカメラ制御
- キャラクターモデルの頭や首、センターなどのボーン（TransformNode）の絶対ワールド座標を、毎フレームカメラの注視点（`ArcRotateCamera.setTarget`）に同期させることで、激しいモーションでも滑らかなカメラトラッキングが可能です。

### パフォーマンス計測とデバッグ機能
- **パフォーマンス計測**: `onBeforeRenderObservable` および `onBeforeDrawPhaseObservable` を使用して、描画エンジンの更新時間（`updateTime`）と描画時間（`drawTime`）をリアルタイムに計測しています。
- **物理デバッグビューア**: キーボードの `P` キーを押すことで、`PhysicsViewer` を立ち上げてHavok物理エンジンの衝突判定用シェイプを視覚的に画面上にオーバーレイ表示（トグル）できます。
- **ポーズ＆IKリアルタイムダンプ**: `MmdManager` の `boneLogEnabled` を有効にした状態でスペースキーを押すことで、現在のキャラクターモデルの主要ボーン（親ボーン、センター、足IKなど）の絶対座標、可動フラグ、IKソルバーの Iterations やリンク情報をブラウザの開発者コンソールに瞬時にダンプ出力できます。

---

## ブラウザ互換性とPWA

- **Vite PWA**: ビルド時に `vite-plugin-pwa` が自動でサービスワーカー（オフラインキャッシュ）を生成し、インターネット未接続時でも完全にローカルで動作させることができます。
- **モバイル対応**: iOS や Android の各種ブラウザにおけるファイル選択・解凍処理（`JSZip`）に対応しています。
- **WebXR (VR)**: Meta Quest シリーズなどの対応ゴーグルからシームレスに VR モード（Immersive-VR）を立ち上げ、コントローラー移動やパススルーが利用可能です。
