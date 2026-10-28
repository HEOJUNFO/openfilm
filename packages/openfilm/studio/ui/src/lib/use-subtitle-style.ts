/**
 * The project's subtitle style: read from the project folder (`.film/subtitles.json`, via the server), written back
 * 500 ms after the last change. It is the person's look of this film, kept with the project and used by its exports,
 * and not in film.html, so an agent rewriting the film never resets it.
 *
 * A project with no style of its own shows the default, the look its exports burn; nothing is written for it until
 * the person changes something. A new project starts in the look this person used last instead: Studio writes it to
 * the project as the project is made (see readLastSubtitleStyle and api.newProject), so it is the project's own. A
 * version restored (the project's `{ type: 'history', moved }` event) brings its own: read again.
 */
import * as React from 'react';

import { projectEvents } from '@/api';
import { historyMoved } from './project-history';

import {
  fetchSubtitleStyle,
  saveSubtitleStyle,
  SUBTITLE_DEFAULT,
  writeLastSubtitleStyle,
  type SubtitleStyle,
} from './subtitles';

/** Dragging a color slider makes dozens of values: one write for all of them. */
const SAVE_DEBOUNCE_MS = 500;

export function useSubtitleStyle(projectId: string): [SubtitleStyle, React.Dispatch<React.SetStateAction<SubtitleStyle>>] {
  const [style, setStyle] = React.useState<SubtitleStyle>(SUBTITLE_DEFAULT);
  /* the JSON last known to match the project's file (null: not loaded yet; '': unknown, the next change is written) */
  const saved = React.useRef<string | null>(null);
  const styleRef = React.useRef(style);
  styleRef.current = style;
  const [restored, setRestored] = React.useState(0);
  React.useEffect(() => projectEvents(projectId, (event) => { if (historyMoved(event)) setRestored((n) => n + 1); }), [projectId]);

  React.useEffect(() => {
    saved.current = null;
    const start = SUBTITLE_DEFAULT;
    const startJson = JSON.stringify(start);
    setStyle(start);
    const ask = new AbortController();
    fetchSubtitleStyle(projectId, ask.signal).then((kept) => {
      /* changed in the meantime: the person's change wins, and is written now */
      const dirty = JSON.stringify(styleRef.current) !== startJson;
      if (kept && !dirty) setStyle(kept);
      saved.current = dirty ? '' : JSON.stringify(kept ?? start);
      if (dirty) setStyle((s) => ({ ...s }));
    }, () => {
      if (!ask.signal.aborted) saved.current = '';
    });
    return () => ask.abort();
  }, [projectId, restored]);

  React.useEffect(() => {
    /* not loaded yet: writing now could overwrite the project's own style */
    if (saved.current === null) return undefined;
    const next = JSON.stringify(style);
    if (next === saved.current) return undefined;
    const timer = setTimeout(() => {
      saved.current = next;
      writeLastSubtitleStyle(style);
      saveSubtitleStyle(projectId, style).catch(() => {
        /* a failed save must not interrupt the person styling: the picture still shows their style, and the next
           change tries again */
        saved.current = '';
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [projectId, style]);

  return [style, setStyle];
}
