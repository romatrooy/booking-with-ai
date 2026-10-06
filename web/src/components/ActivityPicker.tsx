import type { Activity } from "../api.ts";

interface Props {
  activities: Activity[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

// Список доступных активностей. Гость выбирает, на какую активность
// записываться. Сделан как группа радио-кнопок: один выбор, без JS —
// работает как обычная форма.
export function ActivityPicker({
  activities,
  selectedId,
  onSelect,
}: Props) {
  if (activities.length === 0) {
    return <p className="empty">Активностей пока нет</p>;
  }
  return (
    <div className="activity-picker" role="radiogroup" aria-label="Активность">
      {activities.map((a) => {
        const checked = a.id === selectedId;
        return (
          <label
            key={a.id}
            className={`activity-picker__item${checked ? " activity-picker__item--checked" : ""}`}
          >
            <input
              type="radio"
              name="activity"
              value={a.id}
              checked={checked}
              onChange={() => onSelect(a.id)}
            />
            <span className="activity-picker__name">{a.name}</span>
            <span className="activity-picker__duration">
              {a.default_duration_minutes} мин
            </span>
          </label>
        );
      })}
    </div>
  );
}