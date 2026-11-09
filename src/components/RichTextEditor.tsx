import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { zhTW } from "@blocknote/core/locales";
import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { decideRemoteEditorUpdate, serializeBlocksForCompare } from "@/lib/rich-text-remote-sync";
import { supabase } from "@/integrations/supabase/client";
import { buildCaseFilePathWithPrefix } from "@/lib/storage-case-files";
import {
  FormattingToolbarController,
  FormattingToolbar,
  BlockTypeSelect,
  BasicTextStyleButton,
  TextAlignButton,
  NestBlockButton,
  UnnestBlockButton,
  CreateLinkButton,
  ColorStyleButton,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { Paintbrush, ClipboardPaste } from "lucide-react";

interface RichTextEditorProps {
  /** BlockNote JSON blocks */
  initialContent?: PartialBlock[];
  /** Called on user edits only; remote apply does not fire this */
  onChange?: (blocks: Block[]) => void;
  /** Whether the editor is read-only */
  editable?: boolean;
  /** 同一文件身分；切換不同 ID 應由外層 key 重建，不可每次內容變動就卸載 */
  documentId?: string;
  remoteContent?: PartialBlock[];
  remoteRevision?: string | number | null;
  hasLocalDraft?: boolean;
  suppressedRevision?: string | number | null;
  onConflict?: () => void;
}

async function uploadFile(file: File): Promise<string> {
  const path = buildCaseFilePathWithPrefix("editor-files", file);
  const { error } = await supabase.storage.from("case-files").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("case-files").getPublicUrl(path);
  return data.publicUrl;
}

// Titles to exclude from slash menu (heading levels 4-6)
const excludedTitles = new Set([
  "Heading 4", "Heading 5", "Heading 6",
  // zhTW equivalents
  "標題4", "標題 4", "標題5", "標題 5", "標題6", "標題 6",
]);

// Rename map for list items
const renameMap: Record<string, { title: string; subtext?: string }> = {
  "項目符號列表": { title: "項目符號清單", subtext: "用於顯示項目符號清單" },
  "編號列表": { title: "編號清單", subtext: "用於顯示編號清單" },
  "無序清單": { title: "項目符號清單", subtext: "用於顯示項目符號清單" },
  "有序清單": { title: "編號清單", subtext: "用於顯示編號清單" },
  "可折疊標題1": { title: "可折疊標題 1" },
  "可折疊標題2": { title: "可折疊標題 2" },
  "可折疊標題3": { title: "可折疊標題 3" },
  "Bullet List": { title: "項目符號清單", subtext: "用於顯示項目符號清單" },
  "Numbered List": { title: "編號清單", subtext: "用於顯示編號清單" },
};

/** Copy/Paste Format button for the formatting toolbar */
function CopyPasteFormatButton({ editor }: { editor: BlockNoteEditor }) {
  const [storedStyles, setStoredStyles] = useState<ReturnType<BlockNoteEditor["getActiveStyles"]> | null>(null);

  const handleClick = () => {
    if (storedStyles) {
      const styles = storedStyles;
      if (styles.bold !== undefined) editor.toggleStyles({ bold: styles.bold });
      if (styles.italic !== undefined) editor.toggleStyles({ italic: styles.italic });
      if (styles.underline !== undefined) editor.toggleStyles({ underline: styles.underline });
      if (styles.strike !== undefined) editor.toggleStyles({ strike: styles.strike });
      if (styles.code !== undefined) editor.toggleStyles({ code: styles.code });
      if (styles.textColor) editor.addStyles({ textColor: styles.textColor });
      if (styles.backgroundColor) editor.addStyles({ backgroundColor: styles.backgroundColor });
      setStoredStyles(null);
    } else {
      const activeStyles = editor.getActiveStyles();
      setStoredStyles({ ...activeStyles });
    }
  };

  return (
    <button
      className={`bn-button ${storedStyles ? "bn-is-active" : ""}`}
      onClick={handleClick}
      title={storedStyles ? "貼上格式" : "複製格式"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: 4,
        border: "none",
        cursor: "pointer",
        background: storedStyles ? "var(--bn-colors-side-menu)" : "transparent",
      }}
    >
      {storedStyles ? <ClipboardPaste className="h-4 w-4" /> : <Paintbrush className="h-4 w-4" />}
    </button>
  );
}

function blocksOrEmptyParagraph(blocks: PartialBlock[] | undefined): PartialBlock[] {
  if (blocks && blocks.length > 0) return blocks;
  return [{ type: "paragraph" }];
}

export default function RichTextEditor({
  initialContent,
  onChange,
  editable = true,
  documentId,
  remoteContent,
  remoteRevision,
  hasLocalDraft = false,
  suppressedRevision,
  onConflict,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;
  const applyingRemoteRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastAppliedRevisionRef = useRef<string | number | null | undefined>(remoteRevision);
  const lastAppliedSerializedRef = useRef(
    serializeBlocksForCompare(initialContent && initialContent.length > 0 ? initialContent : []),
  );

  const editor = useCreateBlockNote({
    initialContent:
      initialContent && initialContent.length > 0
        ? initialContent
        : undefined,
    uploadFile,
    dictionary: zhTW,
  });

  const handleChange = useCallback(() => {
    if (applyingRemoteRef.current) return;
    const serialized = serializeBlocksForCompare(editor.document);
    if (serialized === lastAppliedSerializedRef.current) return;
    dirtyRef.current = true;
    onChangeRef.current?.(editor.document);
  }, [editor]);

  useEffect(() => {
    const remoteBlocks = remoteContent ?? initialContent ?? [];
    const decision = decideRemoteEditorUpdate({
      documentId: documentId ?? "",
      incomingDocumentId: documentId ?? "",
      incomingRevision: remoteRevision,
      lastAppliedRevision: lastAppliedRevisionRef.current,
      suppressedRevision,
      localDirty: dirtyRef.current || hasLocalDraft,
      localSerialized: serializeBlocksForCompare(editor.document),
      remoteSerialized: serializeBlocksForCompare(remoteBlocks),
    });
    if (decision === "ignore") return;
    if (decision === "adopt") {
      lastAppliedRevisionRef.current = remoteRevision;
      lastAppliedSerializedRef.current = serializeBlocksForCompare(editor.document);
      dirtyRef.current = false;
      return;
    }
    if (decision === "conflict") {
      onConflictRef.current?.();
      return;
    }
    applyingRemoteRef.current = true;
    try {
      const next = blocksOrEmptyParagraph(remoteBlocks);
      editor.replaceBlocks(
        editor.document.map((block) => block.id),
        next,
      );
      lastAppliedRevisionRef.current = remoteRevision;
      lastAppliedSerializedRef.current = serializeBlocksForCompare(next);
      dirtyRef.current = false;
    } finally {
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
      });
    }
  }, [
    documentId,
    editor,
    hasLocalDraft,
    initialContent,
    remoteContent,
    remoteRevision,
    suppressedRevision,
  ]);

  // Build filtered & renamed slash menu items
  const getFilteredItems = useCallback(
    async (query: string) => {
      const defaultItems = getDefaultReactSlashMenuItems(editor);
      // Filter out heading 4-6 and collapsible heading 4-6
      const filtered = defaultItems.filter((item) => {
        const t = item.title;
        if (excludedTitles.has(t)) return false;
        if (/可折疊標題\s*[4-6]/.test(t) || /Collapsible Heading [4-6]/i.test(t)) return false;
        return true;
      });
      // Rename items
      const renamed = filtered.map((item) => {
        const mapping = renameMap[item.title];
        if (mapping) {
          return { ...item, title: mapping.title, ...(mapping.subtext ? { subtext: mapping.subtext } : {}) };
        }
        if (item.title.includes("列表")) {
          return { ...item, title: item.title.replace(/列表/g, "清單") };
        }
        return item;
      });
      // Simple query filtering
      if (!query) return renamed;
      const q = query.toLowerCase();
      return renamed.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtext && item.subtext.toLowerCase().includes(q)) ||
          (item.aliases && item.aliases.some((a: string) => a.toLowerCase().includes(q)))
      );
    },
    [editor]
  );

  return (
    <div className="rich-text-editor rounded-md border border-input bg-background">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="dark"
        data-theming-css-variables-demo
        formattingToolbar={false}
        slashMenu={false}
      >
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <BlockTypeSelect key="blockTypeSelect" />
              <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
              <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
              <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
              <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
              <TextAlignButton textAlignment="left" key="textAlignLeft" />
              <TextAlignButton textAlignment="center" key="textAlignCenter" />
              <TextAlignButton textAlignment="right" key="textAlignRight" />
              <ColorStyleButton key="colorStyleButton" />
              <NestBlockButton key="nestBlockButton" />
              <UnnestBlockButton key="unnestBlockButton" />
              <CreateLinkButton key="createLinkButton" />
              <CopyPasteFormatButton editor={editor} key="copyPasteFormat" />
            </FormattingToolbar>
          )}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={getFilteredItems}
        />
      </BlockNoteView>
    </div>
  );
}
