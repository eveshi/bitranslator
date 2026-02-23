/* Shared mutable application state */
export const state = {
  currentProjectId: null,
  pollTimer: null,
  totalChapterCount: 0,
  translateRangeStart: 0, // 0-based inclusive
  translateRangeEnd: -1,  // 0-based inclusive, -1 = all
  reviewChapters: [],
  reviewIsStopped: false,
  readerChapters: [],
  readerCurrentIdx: 0,
  readerSelectedOriginal: "",
  readerSelectedTranslation: "",
  readerCurrentChapterId: "",
};
