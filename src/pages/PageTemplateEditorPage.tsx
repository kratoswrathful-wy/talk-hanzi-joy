import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledCheckbox } from "@/components/ui/checkbox-patterns";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { pageTemplateStore, usePageTemplates, PAGE_MODULE_LABELS } from "@/stores/page-template-store";
import { getModuleFields, getFieldGroups, type TemplateFieldDef } from "@/data/page-template-fields";
import ColorSelect from "@/components/ColorSelect";
import MultiColorSelect from "@/components/MultiColorSelect";
import DateTimePicker from "@/components/DateTimePicker";
import FileField from "@/components/FileField";
import { MultilineInput } from "@/components/ui/multiline-input";

/** Renders the appropriate input for a field definition */
function FieldValueEditor({
  field,
  value,
  onChange,
}: {
  field: TemplateFieldDef;
  value: any;
  onChange: (v: any) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <MultilineInput
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`預填${field.label}...`}
          className="max-w-md"
          minRows={1}
          maxRows={3}
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="max-w-[120px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      );

    case "single-select":
    case "person":
      return (
        <ColorSelect
          fieldKey={field.selectKey || ""}
          value={value || ""}
          onValueChange={(v) => onChange(v)}
          className="max-w-xs"
        />
      );

    case "multi-select":
    case "person-multi":
      return (
        <MultiColorSelect
          fieldKey={field.selectKey || ""}
          values={Array.isArray(value) ? value : []}
          onValuesChange={(v) => onChange(v)}
          className="max-w-xs"
        />
      );

    case "date":
      return (
        <DateTimePicker
          value={value || null}
          onChange={(v) => onChange(v)}
          className="max-w-xs"
        />
      );

    case "file":
      return (
        <FileField
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v)}
        />
      );

    case "boolean":
      return (
        <div className="pt-1">
          <LabeledCheckbox
            checked={!!value}
            onCheckedChange={(v) => onChange(v)}
            labelClassName="text-muted-foreground"
          >
            啟用
          </LabeledCheckbox>
        </div>
      );

    default:
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`預填${field.label}...`}
          className="max-w-md"
        />
      );
  }
}

export default function PageTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Subscribe to template store
  usePageTemplates();

  const template = id ? pageTemplateStore.getById(id) : undefined;

  const [templateName, setTemplateName] = useState("");
  const [enabledFields, setEnabledFields] = useState<Set<string>>(new Set());
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  // Initialize from template
  useEffect(() => {
    if (!template) return;
    setTemplateName(template.name);
    const enabled = new Set(Object.keys(template.fieldValues));
    setEnabledFields(enabled);
    setFieldValues({ ...template.fieldValues });
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!template) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        找不到此範本
      </div>
    );
  }

  const moduleFields = getModuleFields(template.module);
  const groups = getFieldGroups(template.module);
  const moduleLabel = PAGE_MODULE_LABELS[template.module];

  const toggleField = (key: string) => {
    setEnabledFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Also clear the value
        setFieldValues((fv) => {
          const copy = { ...fv };
          delete copy[key];
          return copy;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const updateFieldValue = (key: string, value: any) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    // Build fieldValues from only enabled fields
    const savedValues: Record<string, any> = {};
    for (const key of enabledFields) {
      if (fieldValues[key] !== undefined && fieldValues[key] !== "" && fieldValues[key] !== null) {
        savedValues[key] = fieldValues[key];
      }
    }

    const updates: { name?: string; fieldValues?: Record<string, any> } = {
      fieldValues: savedValues,
    };
    if (templateName.trim() && templateName.trim() !== template.name && !template.isDefault) {
      updates.name = templateName.trim();
    }
    pageTemplateStore.update(template.id, updates);
    toast({ title: "範本已儲存" });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/tools")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回工具管理
        </button>
        <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave}>
          <Save className="h-3.5 w-3.5" />
          儲存範本
        </Button>
      </div>

      {/* Template info */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground rounded-full border border-border px-2.5 py-0.5">
              {moduleLabel}
            </span>
            {template.isDefault && (
              <span className="text-xs text-muted-foreground rounded-full border border-border px-2.5 py-0.5">
                預設範本
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground shrink-0">範本名稱</Label>
            {template.isDefault ? (
              <span className="text-sm font-medium">{template.name}</span>
            ) : (
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="max-w-xs h-8 text-sm"
                placeholder="範本名稱"
              />
            )}
          </div>
        </div>
      </div>

      {/* Field selection + value editing */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold">欄位設定</h2>
          <p className="text-xs text-muted-foreground mt-1">
            勾選要預填的欄位，並設定預填值。套用範本時將自動帶入這些內容。
          </p>
        </div>

        {groups.map((group) => {
          const groupFields = moduleFields.filter((f) => f.group === group);
          return (
            <div key={group} className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">{group}</h3>
              <Separator />
              <div className="space-y-3">
                {groupFields.map((field) => {
                  const isEnabled = enabledFields.has(field.key);
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <LabeledCheckbox
                          id={`field-${field.key}`}
                          checked={isEnabled}
                          onCheckedChange={() => toggleField(field.key)}
                        >
                          {field.label}
                        </LabeledCheckbox>
                        <span className="text-[10px] text-muted-foreground">
                          {field.type === "single-select" || field.type === "person"
                            ? "選項"
                            : field.type === "file"
                            ? "檔案"
                            : field.type === "boolean"
                            ? "開關"
                            : field.type === "date"
                            ? "日期"
                            : field.type === "number"
                            ? "數字"
                            : "文字"}
                        </span>
                      </div>
                      {isEnabled && (
                        <div className="ml-6">
                          <FieldValueEditor
                            field={field}
                            value={fieldValues[field.key]}
                            onChange={(v) => updateFieldValue(field.key, v)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {moduleFields.length === 0 && (
          <p className="text-sm text-muted-foreground">此模組尚未定義可用欄位。</p>
        )}
      </div>
    </div>
  );
}
