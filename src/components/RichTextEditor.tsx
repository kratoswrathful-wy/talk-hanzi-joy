import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      />
    </div>
  );
}
