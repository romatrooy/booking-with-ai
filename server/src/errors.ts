// Единое место с кодами ошибок и русскими текстами. AGENTS.md, раздел 9:
// "Ошибки API это `ApiError` с кодом состояния, машиночитаемым кодом и
// текстом на русском. Тексты собраны в объекте `errors` в
// `server/src/errors.ts`, чтобы одна ситуация всегда описывалась
// одинаково."

// Машиночитаемые коды — литеральный union. Соответствует таблице в
// `README.md`, раздел "Ошибки API". Добавлять новое значение — по правилу
// AGENTS.md: сначала в контракт (`contract/main.tsp`), затем сюда.
export type ErrorCode =
  | "activity_not_found"
  | "booking_not_found"
  | "route_not_found"
  | "slot_taken"
  | "booking_already_cancelled"
  | "validation_failed"
  | "slot_not_found"
  | "invalid_time_window"
  | "invalid_date_range"
  | "unauthorized";

export interface ErrorEntry {
  readonly statusCode: number;
  readonly message: string;
}

export const errors: Record<ErrorCode, ErrorEntry> = {
  activity_not_found: {
    statusCode: 404,
    message: "Вид активности не найден",
  },
  booking_not_found: {
    statusCode: 404,
    message: "Бронь не найдена",
  },
  route_not_found: {
    statusCode: 404,
    message: "Такого эндпоинта нет",
  },
  slot_taken: {
    statusCode: 409,
    message: "Этот слот уже забронирован",
  },
  booking_already_cancelled: {
    statusCode: 409,
    message: "Бронь уже отменена",
  },
  validation_failed: {
    statusCode: 422,
    message: "Данные не прошли проверку",
  },
  slot_not_found: {
    statusCode: 422,
    message: "В расписании нет слота с таким началом",
  },
  invalid_time_window: {
    statusCode: 422,
    message: "Начало рабочего окна должно быть раньше конца",
  },
  invalid_date_range: {
    statusCode: 422,
    message: "Диапазон дат пустой или длиннее 60 дней",
  },
  // Один код на все случаи: нет cookie, неверный пароль, истёкшая
  // сессия, превышен лимит попыток. Согласовано с пользователем:
  // не подсказываем, что именно неверно, но в теле ответа есть
  // необязательное `attempts_left` (см. `AdminErrorBody`).
  unauthorized: {
    statusCode: 401,
    message: "Неверный логин или пароль",
  },
};

// `ApiError` бросается из обработчика или из слоя ниже и подхватывается
// общим обработчиком в `app.ts`. Не наследуем `Error.status` от Fastify —
// он конфликтует с нашей семантикой; вместо этого используем отдельное поле.
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;

  public constructor(code: ErrorCode) {
    const entry = errors[code];
    super(entry.message);
    this.name = "ApiError";
    this.statusCode = entry.statusCode;
    this.code = code;
  }
}

// Тело ответа при любой ошибке одно и то же: машиночитаемый `code` и
// `message` на русском. Это и есть контракт, который видят клиенты.
export interface ErrorResponseBody {
  code: ErrorCode;
  message: string;
}

// Расширенное тело ошибки для админ-эндпоинтов: содержит
// `attempts_left` после неудачной попытки входа. Поле опционально,
// в остальных ответах его нет.
export interface AdminErrorBody {
  code: "unauthorized";
  message: string;
  attempts_left?: number;
}

// Хелпер для Zod. Fastify 5 иногда оборачивает ZodError в свой
// `FastifyError` ещё до того, как срабатывает общий обработчик в
// `app.ts`. Чтобы не зависеть от внутренней логики Fastify, мы
// превращаем ZodError в ApiError прямо в обработчике. Этот хелпер
// делает три вещи:
// 1) вызывает `schema.parse` для проверки;
// 2) при `ZodError` бросает `ApiError("validation_failed")`, чтобы
//    общий обработчик в `app.ts` вернул 422;
// 3) иначе возвращает проверенные данные.
//
// Здесь намеренно `unknown` для входных данных: вызывающая сторона
// передаёт то, что пришло из Fastify.
export function parseOrThrow<T>(
  input: unknown,
  schema: { parse: (data: unknown) => T },
  errorMessage = "Данные не прошли проверку",
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new ApiError("validation_failed");
    }
    // На случай, если схема бросила что-то неожиданное: пусть
    // общий обработчик решит.
    if (error instanceof Error) {
      throw new Error(`${errorMessage}: ${error.message}`);
    }
    throw new Error(errorMessage);
  }
}
