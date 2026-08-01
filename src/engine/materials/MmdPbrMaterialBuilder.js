import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterialBuilder } from "babylon-mmd/esm/Loader/pbrMaterialBuilder";

/**
 * MMD 向け PBR マテリアルビルダー。
 *
 * 既知制限 (v1):
 * - sphere / toon マップは無効（親クラスの空実装を維持）
 * - マテリアルモーフ非対応（PBR 用 MaterialProxy なし）
 * - アウトライン描画は無効
 */
export class MmdPbrMaterialBuilder extends PBRMaterialBuilder {
  /**
   * キーワード質感プリセット（髪・肌・金属など）。UI から切替。
   * 既定は OFF。
   */
  keywordPresetsEnabled = false;

  constructor() {
    super();
    // sphere / toon / outline は親で既に no-op。明示的に無効化を維持
    this.loadSphereTexture = () => {};
    this.loadToonTexture = () => {};
    this.loadOutlineRenderingProperties = () => {};
  }

  loadGeneralScalarProperties(material, materialInfo, meshes) {
    const diffuse = materialInfo.diffuse;
    material.albedoColor = new Color3(diffuse[0], diffuse[1], diffuse[2]);

    // metallic-roughness ワークフローでは MMD の specular を reflectivity に流用しない。
    // 暗い specular を入れると誘電体が光を吸って真っ暗になる。
    material.reflectivityColor = new Color3(1, 1, 1);

    // MMD ambient も PBR の ambient 乗算に使うと IBL を暗くするため白に固定
    material.ambientColor = new Color3(1, 1, 1);

    const alpha = materialInfo.diffuse[3];
    material.alpha = alpha;
    if (alpha === 0) {
      for (let i = 0; i < meshes.length; ++i) {
        const mesh = meshes[i];
        if (mesh.isVisible !== undefined) {
          mesh.isVisible = false;
        }
      }
    }

    // shininess(0〜100 程度) → roughness。高い shininess ほど滑らか
    const shininess = typeof materialInfo.shininess === "number" ? materialInfo.shininess : 5;
    material.metallic = 0.0;
    // Blinn 的な shininess を perceptual roughness に近似（極端な黒潰れを避ける下限）
    const n = Math.max(1, shininess);
    const rough = Math.pow(2 / (n + 2), 0.25);
    material.roughness = Math.max(0.04, Math.min(0.90, rough));

    // IBL を抑え直射光（＋シャドウマップ）を主役にする。高い environmentIntensity は
    // 影領域を塗り潰してセルフシャドウを消す。
    material.environmentIntensity = 0.55;
    material.directIntensity = 1.35;
    material.specularIntensity = 1.0;

    if (this.keywordPresetsEnabled) {
      this._applyKeywordPreset(material, materialInfo);
    }
  }

  _applyKeywordPreset(material, materialInfo) {
    const name = (materialInfo.name || "").toLowerCase();
    const hairKw = ["髪", "ヘア", "hair", "まつ毛", "睫毛", "eyebrows", "eyelash"];
    const skinKw = ["肌", "skin", "顔", "face", "体", "body", "手", "足"];
    const metalKw = ["金属", "metal", "金", "銀", "鉄", "steel", "gold", "iron"];
    const clothKw = ["服", "cloth", "衣装", "スカート", "skirt", "シャツ"];
    const eyeKw = ["瞳", "eye", "白目", "眼"];

    if (hairKw.some((kw) => name.includes(kw))) {
      material.roughness = Math.min(material.roughness, 0.45);
      material.metallic = 0.0;
    } else if (skinKw.some((kw) => name.includes(kw))) {
      material.roughness = Math.max(material.roughness, 0.55);
      material.metallic = 0.0;
      if (material.subSurface) {
        material.subSurface.isTranslucencyEnabled = true;
        material.subSurface.translucencyIntensity = 0.15;
      }
    } else if (metalKw.some((kw) => name.includes(kw))) {
      material.metallic = 0.85;
      material.roughness = Math.min(material.roughness, 0.35);
    } else if (clothKw.some((kw) => name.includes(kw))) {
      material.roughness = Math.max(material.roughness, 0.7);
      material.metallic = 0.0;
    } else if (eyeKw.some((kw) => name.includes(kw))) {
      material.roughness = Math.min(material.roughness, 0.2);
      material.metallic = 0.0;
    }
  }
}
