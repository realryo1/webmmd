# Implementation Status

## 2026-07-01 (最新)

| Item | Status | Details |
| --- | --- | --- |
| Three.js 廃止および Babylon.js / babylon-mmd への移行 | Completed | Three.jsを完全に廃止し、Babylon.js (v7) と `babylon-mmd` に移行。描画エンジン、モデル/モーションローダー、アニメーション再生等の処理をすべて再構築。 |
| 物理演算を Ammo.js から Havok へ変更 | Completed | WASMベースの高速物理エンジン `@babylonjs/havok` を採用。髪や衣服の揺れを低負荷で高精度に再現。重力加速度の設定なども連動。 |
| 独自実装への移行とコードの整理 (リファクタリング) | Completed | レガシーな `handler.js` や `clean_logic.js` を廃止し、`src/` 配下に機能を分割した独自のマネージャークラス (`BabylonEngine.js`, `MmdManager.js`, `XrManager.js`, `UIManager.js`) を新たに実装。保守性を高めました。 |
| Vite 開発環境の導入 | Completed | パッケージ管理用の `package.json` およびビルド構成ファイル `vite.config.js` を作成。`vite-plugin-pwa` を導入し、PWA 向けサービスワーカーやオフラインキャッシュを自動生成。 |
| アセットファイルのクリーンアップ | Completed | 不要になった `webmmd_files/` ディレクトリ（Three.js 関連モジュール、古い Ammo.js, バラバラの JS/CSS ファイル等）、および古いバックアップの `handler` フォルダを完全に削除。 |
| スタイルシートの移動とJSインポート化 | Completed | `style.css` を `src/style.css` へ移動し、`src/main.js` からインポートする形に変更。HTML上の余計な `<link>` タグを削除。 |
| GitHub Pages 手動デプロイ構成 | Completed | メインブランチへの Push ごとにデプロイが走るのを防ぐため、GitHub上から手動で実行できる `.github/workflows/deploy.yml` (workflow_dispatch) を追加。 |

---

## 2026-06-29 (移行前)

| Item | Status | Details |
| --- | --- | --- |
| VRモード時の黒いもや（FFR境界）バグの解消 | Completed (移行により統合) | Three.jsにおける FFR 境界の問題や、`scene.background` 透過によるコンポジタ合成干渉を、`renderer.xr.setFoveation(0)` と背景色の退避で回避。(Babylon.js への移行後は WebXRDefaultExperience により自動調停され、二重描画ループ問題も本質的に解消されました) |
| 通常ループとVRループの描画競合防止 | Completed (移行により統合) | `clean_logic.js` 内のレンダーループにVR起動時のスキップ処理を追加し、描画バッファの破壊を防止。(Babylon.js では描画ループが一元化されたため不要になりました) |
| レンダリング仕様書作成 | Completed | `markdown/rendering_spec.md` を作成。※2026-07-01 に Babylon.js 仕様へ全面書き換えを実施。 |

---

## 2026-06-23 (移行前)

| Item | Status | Details |
| --- | --- | --- |
| トーンマッピング改善（色再現修正） | Completed (移行により統合) | ACESFilmicToneMapping を設定し、白飛びや彩度低下を防ぐ調整を実施。(Babylon.js の sRGB/Linear パイプラインに統合) |
| ZIP モデル読み込み修正 | Completed (移行により統合) | Vite プレロードスタブの欠落による ZIP 解凍バグを修正。(Vite の正式導入と `src/utils/zipLoader.js` の自作により、本質的に解消・安定化されました) |
| UI/状態管理の択一化・自動復元同期 | Completed (移行により統合) | assetsモデル/モーション選択の択一化（ラジオボタン化）、自動復元時のUI状態同期処理などを `ui.js` に追加。(現在は `UIManager.js` および `MmdManager.js` にて独自に再実装・引き継がれました) |
