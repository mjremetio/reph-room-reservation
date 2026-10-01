'use client';

/** Suggested requests as chips under topic headings: the room assistant's welcome and Ideas panel, and the Admin assistant. */
export interface SuggestionGroup {
  topic: string;
  items: readonly string[];
}

export function SuggestionGroups({ groups, onPick, disabled }: { groups: readonly SuggestionGroup[]; onPick: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="suggestions">
      {groups.map((g) => (
        <div key={g.topic} className="suggestions__group" role="group" aria-label={g.topic}>
          <div className="suggestions__topic">{g.topic}</div>
          <div className="chips">
            {g.items.map((item) => (
              <button key={item} className="chip" onClick={() => onPick(item)} disabled={disabled}>
                {item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
