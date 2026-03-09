import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { zhTW } from "@blocknote/core/locales";
import { useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
} from "@blocknote/react";
import { Paintbrush, ClipboardPaste } from "lucide-react";

interface RichTextEditorProps {
  /** BlockNote JSON blocks */
  initialContent?: PartialBlock[];
  /** Called on every content change with the new blocks array */
  onChange?: (blocks: Block[]) => void;
  /** Whether the editor is read-only */
  editable?: boolean;
}

async function uploadFile(file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, "_");
  const path = `editor-files/${Date.now()}-${Math.random().toString(36).slice(2, 6)}_${safeName}`;
  const { error } = await supabase.storage.from("case-files").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("case-files").getPublicUrl(path);
  return data.publicUrl;
}

/** Copy/Paste Format button for the formatting toolbar */
function CopyPasteFormatButton({ editor }: { editor: BlockNoteEditor<any, any, any> }) {
  const [storedStyles, setStoredStyles] = useState<Record<string, any> | null>(null);

  const handleClick = () => {
    if (storedStyles) {
      // Paste format
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
      // Copy format — store current active styles
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

export default function RichTextEditor({
  initialContent,
  onChange,
  editable = true,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useCreateBlockNote({
    initialContent:
      initialContent && initialContent.length > 0
        ? initialContent
        : undefined,
    uploadFile,
    dictionary: zhTW,
  });

  const handleChange = useCallback(() => {
    onChangeRef.current?.(editor.document);
  }, [editor]);

  return (
    <div className="rich-text-editor rounded-md border border-input bg-background">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="dark"
        data-theming-css-variables-demo
        formattingToolbar={false}
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
      </BlockNoteView>
    </div>
  );
}
