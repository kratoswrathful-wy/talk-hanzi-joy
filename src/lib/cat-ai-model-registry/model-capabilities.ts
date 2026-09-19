/**
 * GPT-5.5／GPT-5.6 系列與 GPT-6 Astra 不支援 chat/completions 自訂 temperature
 *（與 cat-tool/js/ai-model-temperature.js 規則一致）。
 */
export function shouldOmitTemperature(modelId: string | null | undefined): boolean {
  const id = String(modelId ?? "").trim().toLowerCase();
  if (!id) return false;
  return /^gpt-5\.5(-pro)?(-\d{4}-\d{2}-\d{2})?$/.test(id)
    || /^gpt-5\.6(-sol|-terra|-luna)?(-\d{4}-\d{2}-\d{2})?$/.test(id)
    || /^gpt-6-astra(-\d{4}-\d{2}-\d{2})?$/.test(id);
}

export const GPT55_TEMPERATURE_HINT_ZH =
  "此模型需省略 temperature（CAT 呼叫時不送自訂 temperature）";
