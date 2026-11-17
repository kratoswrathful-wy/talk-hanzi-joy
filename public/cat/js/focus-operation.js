/**
 * 延遲回焦的有效期限。新的點擊、搜尋、手動捲動或換檔會使舊的明確返回失效。
 * 程式自己造成的 focus 不應呼叫 invalidate。
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.CatFocusOp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function createFocusOps() {
        let explicit = 0;
        let scroll = 0;
        let file = 0;

        function beginExplicit() {
            explicit += 1;
            return { id: explicit, scroll, file };
        }

        function invalidateExplicit() {
            explicit += 1;
        }

        function noteManualScroll() {
            scroll += 1;
            explicit += 1;
        }

        function noteFileChange() {
            file += 1;
            explicit += 1;
        }

        function isCurrent(op) {
            if (!op) return false;
            return op.id === explicit && op.scroll === scroll && op.file === file;
        }

        return { beginExplicit, invalidateExplicit, noteManualScroll, noteFileChange, isCurrent };
    }

    const shared = createFocusOps();
    shared.createFocusOps = createFocusOps;
    return shared;
});
