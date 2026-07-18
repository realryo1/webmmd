# ローカルテストおよび GitHub Pages 公開手順書

本プロジェクト（WebMMD）は Vite 開発環境および GitHub Actions によるデプロイ機構を導入しています。
ローカル環境でのテスト方法と、本番環境（GitHub Pages）への公開手順について以下にまとめます。

---

## 1. 事前準備（共通）

最初に、必要なランタイムとパッケージを準備します。

### 手順 1：Node.js のインストール

1. パソコンに Node.js（推奨: v18 または v20 以上の LTS 版）がインストールされていることを確認する。
2. 未インストールの場合は、[Node.js 公式サイト](https://nodejs.org/) からダウンロードしてインストールする。

### 手順 2：依存関係のインストール

1. VSCode 等のターミナル（PowerShell / bash）でプロジェクトのルートディレクトリを開く。
2. 以下のコマンドを実行する。

```bash
npm install
```

> `package.json` に定義された Babylon.js や Havok 物理エンジンなどの必要なライブラリが、ローカルへ自動ダウンロードされます。

---

## 2. ローカルテストの手順

### 2-1. パソコン（PC）のブラウザでテストする場合

#### 手順 1：開発サーバーの起動

1. ターミナルで以下のコマンドを実行する。

```bash
npm run dev
```

2. 起動後、以下のようなログが出力されることを確認する。

```
  VITE v5.2.0  ready in 300 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

#### 手順 2：ブラウザでのアクセス

1. ブラウザで `http://localhost:5173/` にアクセスする。
2. PMX モデルや VMD モーションをドラッグ＆ドロップ、または UI から読み込ませて動作を確認する。

---

### 2-2. スマホや Meta Quest 等の外部デバイスからローカルテストする場合（WebXR 対応）

> [!WARNING]
> **WebXR (VRモード) のセキュリティ制限について**
>
> ブラウザのセキュリティ仕様により、WebXR 機能（VRモード起動など）は **`localhost` または `https`（暗号化された接続）の環境でしか動作しません。**
>
> パソコン以外のデバイス（Quest など）からパソコンのローカルサーバーに接続して VR テストを行う場合は、Tailscale の HTTPS 機能を利用します。

Tailscale の `tailscale serve` を使うと、ローカルの開発サーバー（`http://localhost:5173`）へ、同一 Tailscale ネットワーク内のデバイスから HTTPS 経由でアクセスできます。本番に近い HTTPS 環境で WebXR（VRモード）のテストが行えます。

> 事前に Tailscale の管理画面で **MagicDNS** および **HTTPS Certificates** が有効化されている必要があります。

#### 手順 1：開発サーバーの起動

1. 通常どおり Vite 開発サーバーを起動する（`--host` オプションは不要）。

```bash
npm run dev
```

#### 手順 2：Tailscale Serve の設定

1. 別のターミナル（PowerShell 等）を開く。
2. 以下のコマンドを実行する。

```powershell
tailscale serve --bg http://localhost:5173
```

> ローカルの `http://localhost:5173` が、Tailscale の HTTPS ドメインへバックグラウンドで転送されます。

#### 手順 3：HTTPS リンクでのアクセス

1. 割り当てられた Tailscale の HTTPS ドメインを確認する。

```
例: https://[PC名].[テイルネット名].ts.net/
```

2. 同一の Tailscale に接続した Quest などのデバイスから、その URL に直接アクセスする。
3. SSL 制限をクリアしているため、そのまま VR モードを起動できる。

---

## 3. GitHub Pages での本公開手順

### 3-1. 初回のみ必要な設定（GitHub 側）

Vite ビルド後のアセットを GitHub Actions 経由でデプロイするため、公開元（Source）を切り替えます。

1. GitHub 上で本プロジェクトのリポジトリページを開く。
2. 上部タブの **`Settings`** をクリックする。
3. 左サイドバーから **`Pages`** をクリックする。
4. 画面中央の `Build and deployment` 内にある **`Source`** ドロップダウンを開く。
5. デフォルトの `Deploy from a branch` から **`GitHub Actions`** に変更する。

---

### 3-2. デプロイ（公開）の実行手順

#### 手順 1：修正ファイルを Git にコミット＆プッシュする

1. 変更したファイルをコミットし、GitHub の `main` ブランチ（デフォルトブランチ）へ Push する。

```bash
git add .
git commit -m "feat: migrate to Babylon.js and Havok"
git push origin main
```

#### 手順 2：手動でデプロイワークフローを実行する

1. GitHub 上のリポジトリページを開き、上部タブの **`Actions`** をクリックする。
2. 左側のワークフロー一覧から **`Deploy to GitHub Pages`** を選択する。
3. 画面右側の **`Run workflow`** ドロップダウンをクリックする。
4. ブランチが `main` であることを確認し、緑色の **`Run workflow`** ボタンをクリックして実行する。

> これにより、GitHub のサーバー上でビルド（`npm run build`）が実行され、結果が GitHub Pages に公開されます。
> 無駄なビルド枠消費を防ぐため、この手動起動時のみビルドが走る設定にしています。

#### 手順 3：公開完了の確認

1. 実行されたジョブが緑色のチェックマーク（Success）になればデプロイ成功。
2. GitHub Pages の URL にブラウザ（および Quest 等）でアクセスし、最新の Babylon.js 構成で正しく表示・動作することを確認する。
