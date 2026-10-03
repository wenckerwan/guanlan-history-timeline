export type Precision = 'day' | 'month' | 'year' | 'range' | 'period' | 'unknown';
export type Publication = 'original' | 'verified' | 'pending';
export interface DateAssertion { label: string; start: number | null; end: number | null; precision: Precision; sourceId: string; page: number | null; status: 'original' | 'verified' | 'pending'; calendar?: string }
export interface HistoryEvent { id: string; title: string; content: string; note: string; topicId: string; groupId: string; dates: { original: DateAssertion | null; textbook: DateAssertion | null }; publication: Publication; tags: string[]; trainable: boolean; isGroup?: boolean }
export interface Topic { id: string; name: string; color: string; description: string }
export interface SourceDocument { id: string; title: string; fileName: string; kind: 'original' | 'textbook'; version: string; pdfPages: number }
export interface DateComparison { id: string; title: string; textbook: DateAssertion; original: DateAssertion | null; kind: string; publication: 'pending'; originalLabel?: string }
export interface HistoryDataset { version: string; title: string; range: { start: number; end: number }; topics: Topic[]; sources: SourceDocument[]; events: HistoryEvent[]; comparisons: DateComparison[]; generatedAt: string }
export interface ViewState { start: number; end: number; selectedId: string | null; topicIds: string[]; query: string; compareIds: string[]; archive: boolean }
export interface Attempt { id: string; mode: 'recall' | 'order'; eventIds: string[]; correct: boolean; answer: string; createdAt: string }
export interface StudyState { version: 1; bookmarks: string[]; notes: Record<string,string>; attempts: Attempt[]; view: ViewState | null }
export interface HistoryRepository { loadDataset(): Promise<HistoryDataset>; sourceUrl(sourceId: string, page?: number | null): string | null }
export interface StudyRepository { load(): Promise<StudyState>; save(state: StudyState): Promise<void>; exportBackup(): Promise<string>; importBackup(text: string): Promise<StudyState> }
