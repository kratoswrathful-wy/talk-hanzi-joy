import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const current = readFileSync('cat-tool/app.js', 'utf8').replace(/\r\n/g, '\n');
const baseline = execFileSync('git', ['show', 'ac47eb1d:cat-tool/app.js'], {encoding:'utf8',maxBuffer:10*1024*1024}).replace(/\r\n/g, '\n');
function extract(source, name) {
  const start = source.indexOf(`    function ${name}(`);
  if (start < 0) return '';
  return source.slice(start, source.indexOf('\n    }\n', start) + 6);
}
function editorCase(source, {base='abc', live='abc-UNDO42', composing=false}={}) {
  let caret=live.length, cleared=0;
  const frames=[], writes=[];
  const seg={id:3,targetText:live,status:'unconfirmed',matchValue:'',targetTags:[]};
  const editor={text:live,contentEditable:'true',classList:{contains:n=>n==='grid-textarea'||n==='is-composing'&&composing},closest:()=>row,focus:()=>{}};
  const row={dataset:{segId:'3'},querySelector:()=>editor};
  const ctx=vm.createContext({
    document:{activeElement:editor,querySelectorAll:()=>[row]},
    currentSegmentsList:[seg],gridBody:null,
    editorUndoStack:base?[{kind:'target',segmentId:3,oldTarget:'',newTarget:base,oldStatus:'unconfirmed',newStatus:'unconfirmed'}]:[],editorRedoStack:[],
    editorUndoEditStart:{3:base},editorUndoStatusStart:{3:'unconfirmed'},editorUndoMatchStart:{3:''},
    segmentEditorDraftGuards:new Map([['3',{clearPending:()=>cleared++}]]),
    getGridRowAtListIndex:()=>row,extractTextFromEditor:e=>e.text,
    buildTaggedHtml:t=>t,effectiveTags:()=>[],setEditorHtml:(e,t)=>{e.text=t;caret=0},
    setNpCaretOffset:(_e,n)=>{caret=n},saveCatCaretFromSelection:()=>{},
    updateTagColors:()=>{},applyMatchCellVisual:()=>{},syncRowConfirmedStateClass:()=>{},refreshStatusIconForRow:()=>{},
    updateProgress:()=>{},buildWorkflowStatusExtra:()=>({}),
    DBService:{updateSegmentStatus:async()=>{}},applyUpdateSegmentTarget:async(_s,t)=>{writes.push(t)},
    requestAnimationFrame:f=>frames.push(f),_pendingEditorFocusGen:1,_userScrollGen:0,console,
  });
  for(const name of ['pushUndoEntry','pushEditorUndo','normalizeUndoEntry','plainCaretEndAfterSingleEdit','scheduleNpCaretAfterTargetUndo','restoreCaretAfterTargetUndo','applyOneTargetUndo','flushActiveTargetUndoDraft','applyEditorUndo','applyEditorRedo']) vm.runInContext(extract(source,name),ctx);
  return {ctx,editor,seg,writes,frames,get caret(){return caret},get cleared(){return cleared},type(t){editor.text=editor.text.slice(0,caret)+t+editor.text.slice(caret);caret+=t.length;seg.targetText=editor.text}};
}
describe('快速復原重做：真實處理函式與合成格子',()=>{
  it('舊版尚未收錄尾段時，重做只能回到 abc',()=>{const c=editorCase(baseline);c.ctx.applyEditorUndo();c.ctx.applyEditorRedo();expect(c.editor.text).toBe('abc');});
  it('舊版游標延後兩幀，下一個字先落到句首',()=>{const c=editorCase(baseline,{live:'abc'});c.ctx.applyEditorUndo();c.ctx.applyEditorRedo();c.type('X');expect(c.editor.text).toBe('Xabc');});
  it.each([['abc','abc-UNDO42'],['','abc-UNDO42'],['abc','']])('尚未收錄的 %s → %s 可完整重做', (base,live)=>{const c=editorCase(current,{base,live});c.ctx.applyEditorUndo();expect(c.editor.text).toBe(base);c.ctx.applyEditorRedo();expect(c.editor.text).toBe(live);expect(c.frames).toHaveLength(0);c.type('X');expect(c.editor.text).toBe(live+'X');expect(c.cleared).toBe(1);});
  it('已收錄的普通輸入仍能復原、重做及立即續打',()=>{const c=editorCase(current,{live:'abc'});c.ctx.applyEditorUndo();expect(c.editor.text).toBe('');c.ctx.applyEditorRedo();expect(c.editor.text).toBe('abc');c.type('X');expect(c.editor.text).toBe('abcX');});
  it('復原後改字不能被重做覆蓋，並保留原定儲存排程',()=>{const c=editorCase(current);c.ctx.applyEditorUndo();c.type('NEW');c.ctx.applyEditorRedo();expect(c.editor.text).toBe('abcNEW');expect(c.ctx.editorRedoStack).toHaveLength(0);expect(c.cleared).toBe(1);c.ctx.applyEditorUndo();expect(c.editor.text).toBe('abc');c.ctx.applyEditorRedo();expect(c.editor.text).toBe('abcNEW');});
  it('組字尚未選字時不更動畫面、歷史或寫庫',()=>{const c=editorCase(current,{composing:true});c.ctx.applyEditorUndo();c.ctx.applyEditorRedo();expect(c.editor.text).toBe('abc-UNDO42');expect(c.ctx.editorUndoStack).toHaveLength(1);expect(c.writes).toEqual([]);expect(c.cleared).toBe(0);});
  it('重做不因舊狀態基準重建紀錄而失效',()=>{const c=editorCase(current,{live:'abc'});c.ctx.editorUndoStack[0].oldStatus='confirmed';c.ctx.applyEditorUndo();expect(c.seg.status).toBe('confirmed');c.ctx.applyEditorRedo();expect(c.editor.text).toBe('abc');expect(c.seg.status).toBe('unconfirmed');});
});
