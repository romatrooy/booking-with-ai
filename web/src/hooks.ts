// Хуки загрузки данных. Никакой глобальной библиотеки состояния
// нет — компоненты владеют своим состоянием и обновляют его через
// `reload`. Это упрощает чтение и не требует провайдера.

import { useCallback, useEffect, useState } from "react";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface LoadResult<T> {
  data: T | null;
  status: LoadStatus;
  error: string | null;
  reload: () => void;
}

// Загружает данные вызовом `loader()`. Возвращает состояние и функцию
// повторной загрузки. Состояние обновляется при изменении ключей
// зависимостей (как `useEffect`).
export function useLoader<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
): LoadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    loader()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // `tick` нужен, чтобы `reload` мог перезапустить загрузку; в остальных
    // случаях он не меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, status, error, reload };
}
