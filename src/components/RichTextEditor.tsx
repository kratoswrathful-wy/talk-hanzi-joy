import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useEffect, useRef, useCallback, useState } from "react";
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
} from "@blocknote/shadcn";
import { Paintbrush, ClipboardPaste } from "lucide-react";

// zh-TW dictionary for BlockNote slash menu & UI
const zhTWDictionary: Record<string, any> = {
  slash_menu: {
    heading: {
      title: "標題 1",
      subtext: "頂層標題",
      aliases: ["h", "heading1", "h1", "標題"],
      group: "標題",
    },
    heading_2: {
      title: "標題 2",
      subtext: "章節標題",
      aliases: ["h2", "heading2", "subheading", "副標題"],
      group: "標題",
    },
    heading_3: {
      title: "標題 3",
      subtext: "小節標題",
      aliases: ["h3", "heading3", "小標題"],
      group: "標題",
    },
    numbered_list: {
      title: "編號清單",
      subtext: "有序項目清單",
      aliases: ["ol", "li", "list", "numberedlist", "numbered list", "編號"],
      group: "基本區塊",
    },
    bullet_list: {
      title: "項目清單",
      subtext: "無序項目清單",
      aliases: ["ul", "li", "list", "bulletlist", "bullet list", "清單"],
      group: "基本區塊",
    },
    check_list: {
      title: "核取清單",
      subtext: "附核取方塊的清單",
      aliases: ["ul", "li", "list", "checklist", "check list", "checked list", "checkbox", "核取"],
      group: "基本區塊",
    },
    paragraph: {
      title: "段落",
      subtext: "文件的主要內容",
      aliases: ["p", "paragraph", "段落"],
      group: "基本區塊",
    },
    code_block: {
      title: "程式碼區塊",
      subtext: "語法高亮的程式碼",
      aliases: ["code", "codeblock", "程式碼"],
      group: "基本區塊",
    },
    quote: {
      title: "引用",
      subtext: "引用或摘錄",
      aliases: ["quotation", "blockquote", "引用"],
      group: "基本區塊",
    },
    divider: {
      title: "分隔線",
      subtext: "視覺分隔區塊",
      aliases: ["hr", "divider", "separator", "line", "分隔"],
      group: "基本區塊",
    },
    table: {
      title: "表格",
      subtext: "建立表格",
      aliases: ["table", "表格"],
      group: "基本區塊",
    },
    image: {
      title: "圖片",
      subtext: "插入圖片",
      aliases: ["image", "img", "picture", "media", "圖片"],
      group: "媒體",
    },
    video: {
      title: "影片",
      subtext: "插入影片",
      aliases: ["video", "影片"],
      group: "媒體",
    },
    audio: {
      title: "音訊",
      subtext: "插入音訊",
      aliases: ["audio", "音訊"],
      group: "媒體",
    },
    file: {
      title: "檔案",
      subtext: "插入檔案",
      aliases: ["file", "attachment", "檔案"],
      group: "媒體",
    },
    emoji: {
      title: "表情符號",
      subtext: "搜尋並插入表情符號",
      aliases: ["emoji", "emote", "emotion", "face", "表情"],
      group: "其他",
    },
  },
  placeholders: {
    default: "輸入文字或按「/」新增區塊",
    heading: "標題",
    bulletListItem: "清單",
    numberedListItem: "清單",
    checkListItem: "清單",
  },
  file_blocks: {
    image: {
      add_button_text: "新增圖片",
    },
    video: {
      add_button_text: "新增影片",
    },
    audio: {
      add_button_text: "新增音訊",
    },
    file: {
      add_button_text: "新增檔案",
    },
  },
  side_menu: {
    add_block_label: "新增區塊",
    drag_handle_label: "拖曳手把",
  },
  drag_handle: {
    delete_menuitem: "刪除",
    colors_menuitem: "顏色",
  },
  table_handle: {
    delete_column_menuitem: "刪除欄",
    delete_row_menuitem: "刪除列",
    add_left_menuitem: "在左方新增欄",
    add_right_menuitem: "在右方新增欄",
    add_above_menuitem: "在上方新增列",
    add_below_menuitem: "在下方新增列",
  },
  formatting_toolbar: {
    bold: {
      tooltip: "粗體",
      secondary_tooltip: "Mod+B",
    },
    italic: {
      tooltip: "斜體",
      secondary_tooltip: "Mod+I",
    },
    underline: {
      tooltip: "底線",
      secondary_tooltip: "Mod+U",
    },
    strikethrough: {
      tooltip: "刪除線",
      secondary_tooltip: "Mod+Shift+X",
    },
    code: {
      tooltip: "行內程式碼",
    },
    colors: {
      tooltip: "顏色",
    },
    text_color: "文字顏色",
    background_color: "背景顏色",
    link: {
      tooltip: "建立連結",
      secondary_tooltip: "Mod+K",
    },
    file_caption: {
      tooltip: "編輯說明",
      input_placeholder: "編輯說明文字",
    },
    file_replace: {
      tooltip: {
        image: "替換圖片",
        video: "替換影片",
        audio: "替換音訊",
        file: "替換檔案",
      },
    },
    file_rename: {
      tooltip: "重新命名",
      input_placeholder: "重新命名檔案",
    },
    file_download: {
      tooltip: "下載",
    },
    file_delete: {
      tooltip: "刪除",
    },
    file_preview_toggle: {
      tooltip: "切換預覽",
    },
    nest: {
      tooltip: "內縮區塊",
    },
    unnest: {
      tooltip: "取消內縮",
    },
    align_left: {
      tooltip: "靠左對齊",
    },
    align_center: {
      tooltip: "置中對齊",
    },
    align_right: {
      tooltip: "靠右對齊",
    },
    align_justify: {
      tooltip: "兩端對齊",
    },
  },
  generic: {
    dictionary: {
      slash_menu: {
        no_items_found: "找不到結果",
      },
    },
  },
};

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
      const sel = editor.getSelection();
      if (sel) {
        for (const block of sel.blocks) {
          // Apply stored styles to each selected block's content via the editor
        }
      }
      // Apply stored text styles
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
    dictionary: zhTWDictionary as any,
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
