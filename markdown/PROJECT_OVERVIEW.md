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
├── src/
│   ├── main.js                   # アプリのエントリーポイント
│   ├── style.css                 # アプリのスタイル定義
│   ├── engine/
│   │   ├── BabylonEngine.js      # Babylon.js 描画基盤、カメラ、ライト、物理の初期化・制御
│   │   ├── MmdManager.js         # babylon-mmd によるモデル・モーションのロード、再生、ボーン追跡
│   │   └── XrManager.js          # WebXR（VR）の初期化、コントローラー移動、パススルー
│   ├── ui/
│   │   └── UIManager.js          # HTML UI 要素からのイベントバインドとエンジン状態の同期
│   └── utils/
│       └── zipLoader.js          # JSZip を用いた ZIP アーカイブの解凍ユーティリティ
└── icons/
    ├── icon-192.svg              # PWA 用アイコン (192px)
    └── icon-512.svg              # PWA 用アイコン (512px)
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
      ├─ zipLoader で ZIP をメモリ解凍し、MmdManager のファイルマップへ登録
      └─ ファイルマップ（Blob URL）を用いてモデル・モーションを Babylon.js へロード
```

### データ永続化レイヤー（引き継ぎ予定・設計）

| ストレージ | キー | 内容 |
|---|---|---|
| IndexedDB `settings` | `assetsDirectoryHandle` | FileSystemDirectoryHandle (アセットフォルダ参照用) |
| localStorage | `webmmd-settings` | アプリケーション全体のUI設定、物理感度、前回設定のキャッシュなど |
| localStorage | `webmmd-saved-scenes` | 保存されたシーン情報（YAML 文字列） |

---

## レンダリング設定と機能の最適化

### トーンマッピング・色空間
Babylon.js の標準である Linear / sRGB 色空間に基づき、マテリアルの質感およびライティングを最適化しています。

### 影（Shadow Map）
`DirectionalLight` に対して `ShadowGenerator` を設定し、`useBlurExponentialShadowMap = true`（指数シャドウマップ）および `useKernelBlur = true`（カーネルブラー）により、モデルの輪郭に合わせた柔らかく美麗な影を描画します。

### 物理演算 (Havok)
WASMベースの高速物理エンジン `Havok` を採用しました。キャラクターの髪やスカートの揺れなどを従来より低負荷かつ高精度にシミュレーションします。重力の設定（標準 9.8）は MMD スケール（約12.5倍）に変換され、リアルタイムに物理ワールドへ同期されます。

### ボーン追跡機能
キャラクターモデルの頭や首、センターなどのボーン（TransformNode）の絶対ワールド座標を、Babylon.js の `ArcRotateCamera.setTarget` に対して毎フレーム同期させることで、滑らかなカメラトラッキングを実現しています。

---

## ブラウザ互換性とPWA

- **Vite PWA**: ビルド時に `vite-plugin-pwa` が自動でサービスワーカー（オフラインキャッシュ）を生成し、インターネット未接続時でも完全にローカルで動作させることができます。
- **モバイル対応**: iOS や Android の各種ブラウザにおけるファイル選択・解凍処理（`JSZip`）に対応しています。
- **WebXR (VR)**: Meta Quest シリーズなどの対応ゴーグルからシームレスに VR モード（Immersive-VR）を立ち上げ、コントローラー移動やパススルーが利用可能です。
