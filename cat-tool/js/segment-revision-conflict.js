(function (root) {
    function revisionConflictMayRetry(serverText, attemptedText) {
        return String(serverText == null ? '' : serverText) === String(attemptedText == null ? '' : attemptedText);
    }

    root.CatSegmentRevision = { revisionConflictMayRetry };
})(typeof globalThis !== 'undefined' ? globalThis : this);
